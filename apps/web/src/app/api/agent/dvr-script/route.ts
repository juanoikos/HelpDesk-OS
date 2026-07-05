import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";
import crypto from "crypto";

function getEncKey(): string {
  const s = process.env.DVR_ENCRYPTION_KEY ?? process.env.AUTH_SECRET;
  if (!s) throw new Error("DVR_ENCRYPTION_KEY o AUTH_SECRET debe estar configurado");
  return s.slice(0, 32);
}
function decrypt(text: string): string {
  const [ivHex, encHex] = text.split(":");
  const iv  = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const d   = crypto.createDecipheriv("aes-256-cbc", Buffer.from(getEncKey()), iv);
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
  if (!dvr) return NextResponse.json({ error: "DVR no encontrado" }, { status: 404 });
  const dvrLocalIp = dvr.localIp ?? dvr.ip ?? null;
  if (!dvrLocalIp) return NextResponse.json({ error: "DVR sin IP local" }, { status: 400 });

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
    dvrLocalIp, dvr.port, username, password,
    channelsPs, job.date, job.startTime, job.endTime,
    jobId, appUrl, agentToken
  );

  // BOM UTF-8 al inicio: sin esto, Windows PowerShell 5.1 lee el .ps1 con la
  // página de códigos ANSI del sistema en vez de UTF-8, y corrompe caracteres
  // especiales (rompe el parseo de todo lo que sigue).
  const b64      = Buffer.from("﻿" + ps1, "utf8").toString("base64");
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
    "echo   DVR: " + dvrLocalIp + ":" + dvr.port,
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

// Script PS1 con protocolo Dahua RPC2 JSON (challenge-response MD5)
function buildPs1(
  dvrIp: string, dvrPort: number, username: string, password: string,
  channelsPs: string, date: string, startTime: string, endTime: string,
  jobId: string, appUrl: string, agentToken: string
): string {
  const L = (s: string) => s; // alias para legibilidad
  const lines: string[] = [
    "# HelpDesk OS - Agente DVR local (Dahua RPC2 JSON)",
    L('$DVR_IP   = "' + dvrIp + '"'),
    L("$DVR_PORT = " + dvrPort),
    L('$USERNAME = "' + username + '"'),
    L('$PASSWORD = "' + password + '"'),
    L('$START    = "' + date + " " + startTime + ':00"'),
    L('$END      = "' + date + " " + endTime + ':59"'),
    L("$CHANNELS = " + channelsPs),
    L('$JOB_ID   = "' + jobId + '"'),
    L('$API_URL  = "' + appUrl + '"'),
    L('$TOKEN    = "' + agentToken + '"'),
    L('$BASE     = "http://$DVR_IP`:$DVR_PORT"'),
    "",
    "function md5([string]$text) {",
    "  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)",
    "  $hash  = [System.Security.Cryptography.MD5]::Create().ComputeHash($bytes)",
    '  return ([BitConverter]::ToString($hash) -replace "-","").ToUpper()',
    "}",
    "",
    "function rpc([string]$uri, [hashtable]$body, [string]$session='') {",
    "  if ($session) { $body['session'] = $session }",
    "  $json = $body | ConvertTo-Json -Depth 10 -Compress",
    "  return Invoke-RestMethod -Uri $uri -Method POST -Body $json -ContentType 'application/json' -TimeoutSec 10 -ErrorAction Stop",
    "}",
    "",
    'Write-Host ""',
    'Write-Host "  Conectando a DVR $DVR_IP`:$DVR_PORT..." -ForegroundColor Cyan',
    "",
    "# ── Paso 1: login inicial para obtener challenge ─────────────────────────",
    "try {",
    "  $r1 = rpc \"$BASE/RPC2_Login\" @{",
    "    method = 'global.login'",
    "    params = @{ userName=$USERNAME; password=''; clientType='Web3.0'; loginType='Direct'; authorityType='Default' }",
    "    id = 1",
    "  }",
    "} catch {",
    '  Write-Host "  ERROR de conexion: $($_.Exception.Message)" -ForegroundColor Red',
    '  Invoke-RestMethod -Uri "$API_URL/api/agent/dvr-scan" -Method POST -ContentType "application/json" -Headers @{ Authorization = "Bearer $TOKEN" } -Body (@{ jobId=$JOB_ID; error="No se pudo conectar al DVR: $($_.Exception.Message)" } | ConvertTo-Json) | Out-Null',
    '  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown"); exit 1',
    "}",
    "",
    "$session = $r1.session",
    "$realm   = $r1.params.realm",
    "$random  = $r1.params.random",
    '$enc     = $r1.params.encryption',
    "",
    "# ── Paso 2: calcular hash MD5 y autenticar ───────────────────────────────",
    '$h1  = md5 "$USERNAME`:$realm`:$PASSWORD"',
    '$h2  = md5 "$USERNAME`:$random`:$h1"',
    "",
    "try {",
    "  $r2 = rpc \"$BASE/RPC2_Login\" @{",
    "    method  = 'global.login'",
    "    params  = @{ userName=$USERNAME; password=$h2; clientType='Web3.0'; authorityType='Default' }",
    "    id      = 2",
    "    session = $session",
    "  }",
    "} catch {",
    '  Write-Host "  ERROR de autenticacion: $($_.Exception.Message)" -ForegroundColor Red',
    '  Invoke-RestMethod -Uri "$API_URL/api/agent/dvr-scan" -Method POST -ContentType "application/json" -Headers @{ Authorization = "Bearer $TOKEN" } -Body (@{ jobId=$JOB_ID; error="Autenticacion fallida: $($_.Exception.Message)" } | ConvertTo-Json) | Out-Null',
    '  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown"); exit 1',
    "}",
    "",
    "if (-not $r2.result) {",
    '  Write-Host "  ERROR: credenciales incorrectas (result=false)" -ForegroundColor Red',
    '  Invoke-RestMethod -Uri "$API_URL/api/agent/dvr-scan" -Method POST -ContentType "application/json" -Headers @{ Authorization = "Bearer $TOKEN" } -Body (@{ jobId=$JOB_ID; error="Credenciales incorrectas" } | ConvertTo-Json) | Out-Null',
    '  $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown"); exit 1',
    "}",
    '$session = $r2.session',
    'Write-Host "  Autenticado correctamente" -ForegroundColor Green',
    "",
    "# ── Paso 3: buscar grabaciones por canal ─────────────────────────────────",
    "$all = @()",
    "",
    "foreach ($ch in $CHANNELS) {",
    '  Write-Host "  Canal $ch..." -ForegroundColor Yellow -NoNewline',
    "  try {",
    "    # Crear instancia del finder",
    "    $fi = rpc \"$BASE/RPC2\" @{ method='mediaFileFind.factory.instance'; id=10; params=@{} } $session",
    "    $fid = $fi.result",
    "",
    "    # Buscar archivos",
    "    rpc \"$BASE/RPC2\" @{",
    "      method='mediaFileFind.findFile'; id=11; object=$fid",
    "      params=@{",
    "        channel      = [int]$ch",
    "        startTime    = $START",
    "        endTime      = $END",
    "        dirs         = @('/mnt/dvr/')",
    "        types        = @('dav','mp4')",
    "        events       = @('General','Alarm','Motion')",
    "        streamType   = 'Main'",
    "      }",
    "    } $session | Out-Null",
    "",
    "    # Obtener cantidad",
    "    $cnt = rpc \"$BASE/RPC2\" @{ method='mediaFileFind.getCount'; id=12; object=$fid; params=@{} } $session",
    "    $total = [int]$cnt.params.count",
    '    Write-Host " $total grabaciones" -ForegroundColor Green',
    "",
    "    # Obtener archivos en lotes de 100",
    "    $fetched = 0",
    "    while ($fetched -lt $total) {",
    "      $batch = rpc \"$BASE/RPC2\" @{ method='mediaFileFind.findNextFile'; id=13; object=$fid; params=@{ count=100 } } $session",
    "      foreach ($info in $batch.params.infos) {",
    "        $st = [string]$info.StartTime -replace '/','-'",
    "        $en = [string]$info.EndTime   -replace '/','-'",
    "        $fp = [string]$info.FilePath",
    "        $sz = [long]$info.Length",
    "        if ($fp) { $all += [PSCustomObject]@{ channel=[int]$ch; start=$st; end=$en; size=$sz; filePath=$fp } }",
    "      }",
    "      $fetched += $batch.params.infos.Count",
    "      if ($batch.params.infos.Count -lt 100) { break }",
    "    }",
    "",
    "    # Cerrar finder",
    "    rpc \"$BASE/RPC2\" @{ method='mediaFileFind.close'; id=14; object=$fid; params=@{} } $session | Out-Null",
    "    rpc \"$BASE/RPC2\" @{ method='mediaFileFind.destroy'; id=15; object=$fid; params=@{} } $session | Out-Null",
    "",
    "  } catch {",
    '    Write-Host " Error: $($_.Exception.Message)" -ForegroundColor Red',
    "  }",
    "}",
    "",
    "# ── Paso 4: logout y enviar resultados ───────────────────────────────────",
    "try { rpc \"$BASE/RPC2\" @{ method='global.logout'; id=99; params=@{} } $session | Out-Null } catch {}",
    "",
    'Write-Host ""',
    'Write-Host "  Total: $($all.Count) grabaciones encontradas" -ForegroundColor Cyan',
    'Write-Host "  Enviando a HelpDesk OS..." -ForegroundColor Yellow',
    "",
    "$recs = @($all | ForEach-Object {",
    "  @{ channel=[int]$_.channel; start=[string]$_.start; end=[string]$_.end; size=[long]$_.size; filePath=[string]$_.filePath }",
    "})",
    '$payload = @{ jobId=$JOB_ID; recordings=$recs } | ConvertTo-Json -Depth 5',
    "try {",
    '  Invoke-RestMethod -Uri "$API_URL/api/agent/dvr-scan" -Method POST -Body $payload -ContentType "application/json" -Headers @{ Authorization = "Bearer $TOKEN" } -TimeoutSec 15 | Out-Null',
    '  Write-Host "  OK - Resultados enviados correctamente" -ForegroundColor Green',
    "} catch {",
    '  Write-Host "  ERROR al enviar: $($_.Exception.Message)" -ForegroundColor Red',
    "}",
    "",
    'Write-Host ""',
    'Write-Host "  Presiona cualquier tecla para cerrar..."',
    '$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")',
  ];
  return lines.join("\n");
}
