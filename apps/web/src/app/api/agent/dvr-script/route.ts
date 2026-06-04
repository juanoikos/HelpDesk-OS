import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";
import crypto from "crypto";

const ENC_KEY = (process.env.AUTH_SECRET ?? "helpdesk-dvr-secret-key-32chars!").slice(0, 32);
function decrypt(text: string): string {
  const [ivHex, encHex] = text.split(":");
  const iv  = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const d   = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENC_KEY), iv);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return NextResponse.json({ error: "Falta jobId" }, { status: 400 });

  const tenantId = session.user.tenantId;
  const [job, settings] = await Promise.all([
    prisma.dvrScanJob.findFirst({ where: { id: jobId, tenantId } }),
    prisma.tenantSettings.findUnique({ where: { tenantId } }),
  ]);
  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });

  const dvr = await prisma.dvr.findFirst({ where: { id: job.dvrId, tenantId } });
  if (!dvr?.localIp) return NextResponse.json({ error: "DVR sin IP local" }, { status: 400 });

  let username = "admin";
  let password = "";
  if (dvr.username && dvr.password) {
    username = dvr.username;
    password = decrypt(dvr.password);
  } else {
    const cred = await prisma.dvrCredential.findUnique({ where: { tenantId } });
    if (cred) { username = cred.username; password = decrypt(cred.password); }
  }

  const agentToken = settings?.agentToken ?? "";
  const appUrl     = process.env.AUTH_URL ?? "https://helpdesk-os-production.up.railway.app";
  const channels   = job.channels as number[];
  const channelsPs = channels.length === 0
    ? ("1.." + dvr.channels)
    : ("@(" + channels.join(",") + ")");

  const ps1 = buildPs1(
    dvr.localIp, dvr.port, username, password,
    channelsPs, job.date, job.startTime, job.endTime,
    jobId, appUrl, agentToken
  );

  const b64      = Buffer.from(ps1, "utf8").toString("base64");
  const b64Lines = b64.match(/.{1,64}/g) ?? [];
  const echoLines = b64Lines
    .map((l, i) => i === 0 ? "echo " + l + '> "%TMP64%"' : "echo " + l + '>> "%TMP64%"')
    .join("\r\n");

  const bat = [
    "@echo off",
    "chcp 65001 >nul",
    "title HelpDesk OS - DVR Scanner",
    "echo.",
    "echo  ==============================================",
    "echo   HelpDesk OS - Buscando grabaciones en DVR",
    "echo  ==============================================",
    "echo   DVR: " + dvr.localIp + ":" + dvr.port,
    "echo   Fecha: " + job.date + "  " + job.startTime + " - " + job.endTime,
    "echo  ==============================================",
    "echo.",
    'set "TMP64=%TEMP%\\hd_dvr_%RANDOM%.b64"',
    'set "TMPPS1=%TEMP%\\hd_dvr_%RANDOM%.ps1"',
    echoLines,
    'certutil -decode "%TMP64%" "%TMPPS1%" >nul 2>&1',
    'del "%TMP64%" 2>nul',
    'if not exist "%TMPPS1%" (',
    "  echo  ERROR: No se pudo preparar el agente.",
    "  pause & exit /b 1",
    ")",
    'powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%TMPPS1%"',
    'del "%TMPPS1%" 2>nul',
    "",
  ].join("\r\n");

  return new NextResponse(bat, {
    headers: {
      "Content-Type":        "text/plain; charset=utf-8",
      "Content-Disposition": 'attachment; filename="dvr-scan-' + job.date + '.bat"',
    },
  });
}

// Construir el script PS1 sin template literals (los backticks de PS1 rompen TS)
function buildPs1(
  dvrIp: string, dvrPort: number, username: string, password: string,
  channelsPs: string, date: string, startTime: string, endTime: string,
  jobId: string, appUrl: string, agentToken: string
): string {
  const lines: string[] = [
    "# HelpDesk OS - Agente DVR local",
    '$DVR_IP   = "' + dvrIp + '"',
    "$DVR_PORT = " + dvrPort,
    '$USERNAME = "' + username + '"',
    '$PASSWORD = "' + password + '"',
    '$DATE     = "' + date + '"',
    '$START    = "' + date + " " + startTime + ':00"',
    '$END      = "' + date + " " + endTime + ':59"',
    "$CHANNELS = " + channelsPs,
    '$JOB_ID   = "' + jobId + '"',
    '$API_URL  = "' + appUrl + '"',
    '$TOKEN    = "' + agentToken + '"',
    "",
    'Write-Host ""',
    'Write-Host "  Conectando a DVR $DVR_IP`:$DVR_PORT..." -ForegroundColor Cyan',
    "",
    '$b64  = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$USERNAME`:$PASSWORD"))',
    '$auth = @{ Authorization = "Basic $b64" }',
    "$all  = @()",
    "",
    "foreach ($ch in $CHANNELS) {",
    '  Write-Host "  Canal $ch..." -ForegroundColor Yellow -NoNewline',
    '  $startEnc = [Uri]::EscapeDataString($START)',
    '  $endEnc   = [Uri]::EscapeDataString($END)',
    '  $url = "http://$DVR_IP`:$DVR_PORT/cgi-bin/mediaFileFind.cgi?action=findFile&object=0&condition.Channel=$ch&condition.StartTime=$startEnc&condition.EndTime=$endEnc&condition.Flags[0]=General"',
    "  try {",
    "    $resp  = Invoke-WebRequest -Uri $url -Headers $auth -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop",
    '    $lines = $resp.Content -split "[\\r\\n]+" | Where-Object { $_ -match "=" }',
    '    $found = ($lines | Where-Object { $_ -match "^found=" } | Select-Object -First 1) -replace "found=",""',
    '    $found = [int]($found -replace "[^0-9]","")',
    '    Write-Host " $found grabaciones" -ForegroundColor Green',
    "    for ($i = 0; $i -lt $found; $i++) {",
    "      $fp = ($lines | Where-Object { $_ -match \"^items\\[$i\\]\\.FilePath=\" } | Select-Object -First 1) -replace \"^items\\[$i\\]\\.FilePath=\",\"\"",
    "      $st = (($lines | Where-Object { $_ -match \"^items\\[$i\\]\\.StartTime=\" } | Select-Object -First 1) -replace \"^items\\[$i\\]\\.StartTime=\",\"\") -replace \"/\",\"-\"",
    "      $en = (($lines | Where-Object { $_ -match \"^items\\[$i\\]\\.EndTime=\" }   | Select-Object -First 1) -replace \"^items\\[$i\\]\\.EndTime=\",\"\")   -replace \"/\",\"-\"",
    "      $sz = [long]((($lines | Where-Object { $_ -match \"^items\\[$i\\]\\.Length=\" } | Select-Object -First 1) -replace \"^items\\[$i\\]\\.Length=\",\"\") -replace \"[^0-9]\",\"\")",
    "      if ($fp) {",
    "        $all += [PSCustomObject]@{ channel=[int]$ch; start=$st; end=$en; size=$sz; filePath=$fp }",
    "      }",
    "    }",
    "  } catch {",
    '    Write-Host " Error: $($_.Exception.Message)" -ForegroundColor Red',
    "  }",
    "}",
    "",
    'Write-Host ""',
    'Write-Host "  Total grabaciones: $($all.Count)" -ForegroundColor Cyan',
    'Write-Host "  Enviando resultados..." -ForegroundColor Yellow',
    "",
    "$recs = @($all | ForEach-Object {",
    "  @{ channel=[int]$_.channel; start=[string]$_.start; end=[string]$_.end; size=[long]$_.size; filePath=[string]$_.filePath }",
    "})",
    '$payload = @{ jobId = $JOB_ID; recordings = $recs } | ConvertTo-Json -Depth 5',
    "try {",
    '  Invoke-RestMethod -Uri "$API_URL/api/agent/dvr-scan" -Method POST -Body $payload -ContentType "application/json" -Headers @{ Authorization = "Bearer $TOKEN" } -TimeoutSec 15 | Out-Null',
    '  Write-Host "  OK - Resultados enviados" -ForegroundColor Green',
    "} catch {",
    '  Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red',
    "}",
    "",
    'Write-Host ""',
    'Write-Host "  Presiona cualquier tecla para cerrar..."',
    '$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")',
  ];
  return lines.join("\n");
}
