import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";
import { randomUUID } from "crypto";

export async function GET(req: NextRequest) {
  // ── Modo contenido: llamado desde el .bat con Bearer token ──────────────────
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token    = authHeader.slice(7);
    const settings = await prisma.tenantSettings.findFirst({ where: { agentToken: token } });
    if (!settings) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

    const appUrl = process.env.AUTH_URL ?? "http://localhost:3000";
    const script = PS1_TEMPLATE
      .replace(/APP_URL_PLACEHOLDER/g, appUrl)
      .replace(/TOKEN_PLACEHOLDER/g,   token);

    return new NextResponse(script, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  // ── Modo descarga: llamado desde el navegador (sesión) ──────────────────────
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;

  let settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (!settings?.agentToken) {
    settings = await prisma.tenantSettings.upsert({
      where:  { tenantId },
      create: { tenantId, agentToken: randomUUID() },
      update: { agentToken: randomUUID() },
    });
  }

  const token  = settings.agentToken!;
  const appUrl = process.env.AUTH_URL ?? "http://localhost:3000";

  // ── Generar .bat autónomo con PS1 embebido en base64 ─────────────────────────
  // El .bat usa certutil (incluido en Windows) para decodificar y ejecutar
  // sin necesidad de internet ni configuración de políticas de ejecución
  const ps1Content = PS1_TEMPLATE
    .replace(/APP_URL_PLACEHOLDER/g, appUrl)
    .replace(/TOKEN_PLACEHOLDER/g,   token);

  // Codificar PS1 en base64 y partir en líneas de 64 chars (formato certutil)
  const b64      = Buffer.from(ps1Content, "utf8").toString("base64");
  const b64Lines = b64.match(/.{1,64}/g) ?? [];

  // Primeras líneas con > (crear), resto con >> (añadir)
  const echoLines = b64Lines
    .map((line, i) => i === 0
      ? `echo ${line}> "%TMPB64%"`
      : `echo ${line}>> "%TMPB64%"`)
    .join("\r\n");

  const bat = `@echo off
chcp 65001 >nul
title HelpDesk OS - Agente de inventario
echo.
echo  ================================================
echo   HelpDesk OS - Agente de inventario de hardware
echo  ================================================
echo.
set "TMPB64=%TEMP%\\hd_agent_%RANDOM%.b64"
set "TMPPS1=%TEMP%\\hd_agent_%RANDOM%.ps1"
${echoLines}
certutil -decode "%TMPB64%" "%TMPPS1%" >nul 2>&1
del "%TMPB64%" 2>nul
if not exist "%TMPPS1%" (
  echo  ERROR: No se pudo preparar el agente.
  pause
  exit /b 1
)
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%TMPPS1%"
del "%TMPPS1%" 2>nul
`;

  return new NextResponse(bat, {
    headers: {
      "Content-Type":        "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="helpdesk-agent.bat"`,
    },
  });
}

const PS1_TEMPLATE = `
# ================================================================
#  HelpDesk OS - Agente de inventario de hardware v1.1
#  Ejecuta como Administrador para mejores resultados
# ================================================================

$API_URL   = "APP_URL_PLACEHOLDER"
$API_TOKEN = "TOKEN_PLACEHOLDER"
$AGENT_VER = "1.1.0"

# Forzar TLS 1.2 (requerido en Windows 7/8/Server 2012 y algunos Win10 viejos)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ""
Write-Host "  HelpDesk OS - Agente de inventario" -ForegroundColor Cyan
Write-Host "  ===================================" -ForegroundColor DarkGray
Write-Host ""

# ---- [1/8] Sistema operativo ----
Write-Host "  [1/8] Sistema operativo..." -ForegroundColor Yellow
$os = Get-CimInstance Win32_OperatingSystem
$osCaption = $os.Caption
$osBuild   = $os.BuildNumber
$osVer     = $os.Version
$osArch    = $os.OSArchitecture
$osName    = "$osCaption build $osBuild"

# ---- [2/8] Procesador ----
Write-Host "  [2/8] Procesador..." -ForegroundColor Yellow
$cpuRaw   = Get-CimInstance Win32_Processor | Select-Object -First 1
$cpuName  = $cpuRaw.Name.Trim()
$cpuCores = $cpuRaw.NumberOfCores
$cpuMHz   = $cpuRaw.MaxClockSpeed
$cpuGHz   = [math]::Round($cpuMHz / 1000, 1)
$cpu      = "$cpuName - $cpuCores nucleos a $cpuGHz GHz"
$cpuData  = @{ name = $cpuName; cores = $cpuCores; threads = $cpuRaw.NumberOfLogicalProcessors; mhz = $cpuMHz; id = $cpuRaw.ProcessorId }

# ---- [3/8] Memoria RAM ----
Write-Host "  [3/8] Memoria RAM..." -ForegroundColor Yellow
$ramModules = @(Get-CimInstance Win32_PhysicalMemory)
$ramTotalGB = [math]::Round(($ramModules | Measure-Object -Property Capacity -Sum).Sum / 1GB, 0)
$ramData = $ramModules | ForEach-Object {
    $sizeGB = [math]::Round($_.Capacity / 1GB, 0)
    @{ sizeGB = $sizeGB; manufacturer = $_.Manufacturer; partNumber = $_.PartNumber.Trim(); serial = $_.SerialNumber.Trim(); speed = $_.Speed }
}

# ---- [4/8] Discos ----
Write-Host "  [4/8] Discos..." -ForegroundColor Yellow
$disksRaw  = @(Get-CimInstance Win32_DiskDrive)
$firstDisk = $disksRaw | Select-Object -First 1
$diskSizeGB = [math]::Round($firstDisk.Size / 1GB, 0)
$diskInfo  = "$($firstDisk.Model.Trim()) $diskSizeGB GB"
$disksData = $disksRaw | ForEach-Object {
    $sizeGB = [math]::Round($_.Size / 1GB, 0)
    @{ model = $_.Model.Trim(); sizeGB = $sizeGB; serial = $_.SerialNumber.Trim(); mediaType = $_.MediaType; interface = $_.InterfaceType }
}

# ---- [5/8] Placa madre ----
Write-Host "  [5/8] Placa madre..." -ForegroundColor Yellow
$mbRaw       = Get-CimInstance Win32_BaseBoard
$motherboard = "$($mbRaw.Manufacturer.Trim()) $($mbRaw.Product.Trim())"
$biosRaw     = Get-CimInstance Win32_BIOS
$mbData      = @{ manufacturer = $mbRaw.Manufacturer.Trim(); product = $mbRaw.Product.Trim(); serial = $mbRaw.SerialNumber.Trim() }
$biosData    = @{ manufacturer = $biosRaw.Manufacturer; version = $biosRaw.SMBIOSBIOSVersion; serial = $biosRaw.SerialNumber }

# ---- [6/8] Tarjeta grafica ----
Write-Host "  [6/8] Tarjeta grafica..." -ForegroundColor Yellow
$gpuData = @(Get-CimInstance Win32_VideoController) | ForEach-Object {
    $vramMB = [math]::Round($_.AdapterRAM / 1MB, 0)
    @{ name = $_.Name; vramMB = $vramMB; driver = $_.DriverVersion }
}

# ---- [7/8] Red ----
Write-Host "  [7/8] Red..." -ForegroundColor Yellow
$netRaw     = @(Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true -and $_.DefaultIPGateway })
$ipAddress  = if ($netRaw.Count -gt 0) { $netRaw[0].IPAddress | Select-Object -First 1 } else { "" }
$macAddress = if ($netRaw.Count -gt 0) { $netRaw[0].MACAddress } else { "" }

# ---- [8/8] USB ----
Write-Host "  [8/8] Dispositivos USB..." -ForegroundColor Yellow
$usbData = try {
    @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
        Where-Object { $_.Class -in @("USB","HIDClass","Keyboard","Mouse","Printer","Image") } |
        ForEach-Object { @{ name = $_.FriendlyName; class = $_.Class; status = $_.Status.ToString() } })
} catch { @() }

# ---- Tipo de equipo ----
$chassis   = try { (Get-CimInstance Win32_SystemEnclosure).ChassisTypes | Select-Object -First 1 } catch { 3 }
$assetType = if ($chassis -in @(8,9,10,11,12,14,18,21)) { "LAPTOP" } else { "DESKTOP" }

# ---- Construir payload ----
$hwData = @{
    cpu         = $cpuData
    ram         = $ramData
    disks       = $disksData
    motherboard = $mbData
    bios        = $biosData
    gpu         = $gpuData
    network     = @{ ip = $ipAddress; mac = $macAddress }
    usb         = $usbData
    os          = @{ name = $osCaption; version = $osVer; build = $osBuild; arch = $osArch }
}

$body = @{
    hostname     = $env:COMPUTERNAME
    username     = $env:USERNAME
    ipAddress    = $ipAddress
    macAddress   = $macAddress
    osName       = $osName
    cpu          = $cpu
    ramGB        = $ramTotalGB
    diskInfo     = $diskInfo
    motherboard  = $motherboard
    agentVersion = $AGENT_VER
    assetType    = $assetType
    hardwareData = $hwData
}

$payload = $body | ConvertTo-Json -Depth 6
$headers = @{ "Authorization" = "Bearer $API_TOKEN"; "Content-Type" = "application/json" }

Write-Host ""
Write-Host "  Enviando datos a HelpDesk OS..." -ForegroundColor Cyan

try {
    $resp = Invoke-RestMethod -Uri "$API_URL/api/agent/inventory" -Method POST -Body $payload -Headers $headers
    Write-Host ""
    Write-Host "  OK  Inventario registrado correctamente" -ForegroundColor Green
    Write-Host "  ->  Equipo : $($resp.name)"             -ForegroundColor White
    Write-Host "  ->  ID     : $($resp.id)"               -ForegroundColor DarkGray
} catch {
    Write-Host ""
    Write-Host "  ERROR: $($_.Exception.Message)"         -ForegroundColor Red
    Write-Host "  Verifica tu conexion a internet."       -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Presiona cualquier tecla para cerrar..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;

const BAT_TEMPLATE = `@echo off
chcp 65001 >nul
echo.
echo  HelpDesk OS - Agente de inventario de hardware
echo  ===============================================
echo.

REM Verificar que el exe existe
if not exist "%~dp0helpdesk-agent.exe" (
    echo  ERROR: No se encuentra helpdesk-agent.exe
    echo  Descarga el ejecutable desde HelpDesk OS ^> Activos ^> Descargar .exe
    echo  y colócalo en la misma carpeta que este archivo.
    echo.
    pause
    exit /b 1
)

REM Ejecutar agente con configuracion de la empresa
"%~dp0helpdesk-agent.exe" --token "TOKEN_PLACEHOLDER" --server "APP_URL_PLACEHOLDER"
`;
