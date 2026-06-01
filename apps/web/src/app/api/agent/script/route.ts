import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;

  // Get or create agent token
  let settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
  if (!settings?.agentToken) {
    settings = await prisma.tenantSettings.upsert({
      where:  { tenantId },
      create: { tenantId, agentToken: randomUUID() },
      update: { agentToken: randomUUID() },
    });
  }

  const appUrl = process.env.AUTH_URL ?? "http://localhost:3000";
  const script = PS1_TEMPLATE
    .replace("APP_URL_PLACEHOLDER", appUrl)
    .replace("TOKEN_PLACEHOLDER", settings.agentToken!);

  return new NextResponse(script, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="helpdesk-agent.ps1"`,
    },
  });
}

const PS1_TEMPLATE = `#Requires -Version 5.1
# ================================================================
#  HelpDesk OS — Agente de inventario de hardware v1.0
#  Ejecuta este script como Administrador para mejores resultados
# ================================================================

$API_URL   = "APP_URL_PLACEHOLDER"
$API_TOKEN = "TOKEN_PLACEHOLDER"
$AGENT_VER = "1.0.0"

Write-Host ""
Write-Host "  HelpDesk OS — Agente de inventario de hardware" -ForegroundColor Cyan
Write-Host "  ================================================" -ForegroundColor DarkGray
Write-Host ""

function Get-SizeGB($bytes) { if ($bytes) { [math]::Round($bytes / 1GB, 0) } else { 0 } }
function Get-SizeMB($bytes) { if ($bytes) { [math]::Round($bytes / 1MB, 0) } else { 0 } }

Write-Host "  [1/8] Sistema operativo..." -ForegroundColor Yellow
$os       = Get-CimInstance Win32_OperatingSystem
$osName   = "$($os.Caption) (Build $($os.BuildNumber))"
$osArch   = $os.OSArchitecture

Write-Host "  [2/8] Procesador..." -ForegroundColor Yellow
$cpuRaw  = Get-CimInstance Win32_Processor | Select-Object -First 1
$cpu     = "$($cpuRaw.Name.Trim()) — $($cpuRaw.NumberOfCores) nucleos @ $([math]::Round($cpuRaw.MaxClockSpeed/1000,1)) GHz"
$cpuData = @{
    name    = $cpuRaw.Name.Trim()
    cores   = $cpuRaw.NumberOfCores
    threads = $cpuRaw.NumberOfLogicalProcessors
    mhz     = $cpuRaw.MaxClockSpeed
    id      = $cpuRaw.ProcessorId
}

Write-Host "  [3/8] Memoria RAM..." -ForegroundColor Yellow
$ramModules = Get-CimInstance Win32_PhysicalMemory
$ramGB      = Get-SizeGB(($ramModules | Measure-Object -Property Capacity -Sum).Sum)
$ramData    = $ramModules | ForEach-Object {
    @{ sizeGB = Get-SizeGB($_.Capacity); manufacturer = $_.Manufacturer; partNumber = $_.PartNumber.Trim(); serial = $_.SerialNumber.Trim(); speed = $_.Speed }
}

Write-Host "  [4/8] Discos..." -ForegroundColor Yellow
$disksRaw = Get-CimInstance Win32_DiskDrive
$diskInfo = ($disksRaw | Select-Object -First 1 | ForEach-Object { "$($_.Model.Trim()) $(Get-SizeGB($_.Size)) GB" })
$disksData = $disksRaw | ForEach-Object {
    @{ model = $_.Model.Trim(); sizeGB = Get-SizeGB($_.Size); serial = $_.SerialNumber.Trim(); mediaType = $_.MediaType; interface = $_.InterfaceType }
}

Write-Host "  [5/8] Placa madre..." -ForegroundColor Yellow
$mbRaw       = Get-CimInstance Win32_BaseBoard
$motherboard = "$($mbRaw.Manufacturer.Trim()) $($mbRaw.Product.Trim())"
$biosRaw     = Get-CimInstance Win32_BIOS
$mbData      = @{ manufacturer = $mbRaw.Manufacturer.Trim(); product = $mbRaw.Product.Trim(); serial = $mbRaw.SerialNumber.Trim() }
$biosData    = @{ manufacturer = $biosRaw.Manufacturer; version = $biosRaw.SMBIOSBIOSVersion; serial = $biosRaw.SerialNumber }

Write-Host "  [6/8] Tarjeta grafica..." -ForegroundColor Yellow
$gpuData = Get-CimInstance Win32_VideoController | ForEach-Object {
    @{ name = $_.Name; vramMB = Get-SizeMB($_.AdapterRAM); driver = $_.DriverVersion }
}

Write-Host "  [7/8] Red..." -ForegroundColor Yellow
$netRaw     = Get-CimInstance Win32_NetworkAdapterConfiguration | Where-Object { $_.IPEnabled -eq $true -and $_.DefaultIPGateway }
$ipAddress  = ($netRaw | Select-Object -First 1).IPAddress | Select-Object -First 1
$macAddress = ($netRaw | Select-Object -First 1).MACAddress

Write-Host "  [8/8] Dispositivos USB..." -ForegroundColor Yellow
$usbData = try {
    Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue |
        Where-Object { $_.Class -in @("USB","HIDClass","Keyboard","Mouse","Printer","Image","Disk Drive") } |
        ForEach-Object { @{ name = $_.FriendlyName; class = $_.Class; status = $_.Status.ToString() } }
} catch { @() }

$chassis   = try { (Get-CimInstance Win32_SystemEnclosure).ChassisTypes | Select-Object -First 1 } catch { 3 }
$assetType = if ($chassis -in @(8,9,10,11,12,14,18,21)) { "LAPTOP" } else { "DESKTOP" }

$payload = @{
    hostname     = $env:COMPUTERNAME
    username     = $env:USERNAME
    ipAddress    = $ipAddress
    macAddress   = $macAddress
    osName       = $osName
    cpu          = $cpu
    ramGB        = $ramGB
    diskInfo     = $diskInfo
    motherboard  = $motherboard
    agentVersion = $AGENT_VER
    assetType    = $assetType
    hardwareData = @{
        cpu   = $cpuData; ram = $ramData; disks = $disksData
        motherboard = $mbData; bios = $biosData; gpu = $gpuData
        network = @{ ip = $ipAddress; mac = $macAddress }
        usb = $usbData
        os  = @{ name = $os.Caption; version = $os.Version; build = $os.BuildNumber; arch = $osArch }
    }
} | ConvertTo-Json -Depth 6

Write-Host ""
Write-Host "  Enviando datos a HelpDesk OS..." -ForegroundColor Cyan

$headers = @{ "Authorization" = "Bearer $API_TOKEN"; "Content-Type" = "application/json" }

try {
    $resp = Invoke-RestMethod -Uri "$API_URL/api/agent/inventory" -Method POST -Body $payload -Headers $headers
    Write-Host ""
    Write-Host "  OK  Inventario registrado correctamente" -ForegroundColor Green
    Write-Host "  ->  Equipo : $($resp.name)"             -ForegroundColor White
    Write-Host "  ->  ID     : $($resp.id)"               -ForegroundColor DarkGray
} catch {
    Write-Host ""
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Verifica tu conexion y que el servidor este disponible." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Presiona cualquier tecla para cerrar..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;
