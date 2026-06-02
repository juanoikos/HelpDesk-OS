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

    const server = process.env.AUTH_URL ?? req.nextUrl.origin;
    const script = PS1_SCANNER
      .replace(/APP_URL_PLACEHOLDER/g, server)
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
  const server = process.env.AUTH_URL ?? req.nextUrl.origin;

  // ── Generar .bat que descarga y ejecuta el PS1 automáticamente ───────────────
  // Esto evita el problema de política de ejecución al hacer doble clic
  const bat = `@echo off
chcp 65001 >nul
title HelpDesk OS - Scanner de Red
echo.
echo  HelpDesk OS - Scanner de Red v1.0
echo  =====================================
echo.
echo  Iniciando... por favor espera.
echo.
set "TMPPS1=%TEMP%\\helpdesk-scanner-%RANDOM%.ps1"
powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "$ProgressPreference='SilentlyContinue'; try { Invoke-WebRequest -Uri '${server}/api/agent/scanner' -Headers @{Authorization='Bearer ${token}'} -OutFile $env:TMPPS1 -UseBasicParsing } catch { Write-Host '  ERROR al descargar el script: ' $_.Exception.Message -ForegroundColor Red; pause; exit 1 }"
if not exist "%TMPPS1%" (
  echo  ERROR: No se pudo preparar el scanner.
  echo  Verifica tu conexion a internet.
  pause
  exit /b 1
)
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%TMPPS1%"
del "%TMPPS1%" 2>nul
`;

  return new NextResponse(bat, {
    headers: {
      "Content-Type":        "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="helpdesk-scanner.bat"`,
    },
  });
}

// ─── Script PowerShell de descubrimiento de red ───────────────────────────────
const PS1_SCANNER = `
# ================================================================
#  HelpDesk OS - Scanner de red v1.0
#  Descubre todos los dispositivos en la red local
#  Ejecuta como Administrador para mejores resultados
# ================================================================

$API_URL     = "APP_URL_PLACEHOLDER"
$API_TOKEN   = "TOKEN_PLACEHOLDER"
$AGENT_VER   = "1.0.0"
$MAX_THREADS = 50

Write-Host ""
Write-Host "  HelpDesk OS - Scanner de red" -ForegroundColor Cyan
Write-Host "  ==============================" -ForegroundColor DarkGray
Write-Host ""

# ---- Detectar subred local ----
Write-Host "  Detectando subred local..." -ForegroundColor Yellow
$localIP = $null
$subnet  = $null

$adapters = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notmatch "^127\." -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1

if ($adapters) {
    $localIP = $adapters.IPAddress
    $parts   = $localIP.Split(".")
    $subnet  = "$($parts[0]).$($parts[1]).$($parts[2])"
    Write-Host "  IP local   : $localIP" -ForegroundColor White
    Write-Host "  Subred     : $subnet.0/24" -ForegroundColor White
} else {
    Write-Host "  ERROR: No se pudo detectar la subred." -ForegroundColor Red
    Write-Host "  Presiona Enter para salir..."
    $null = Read-Host
    exit 1
}

Write-Host ""
Write-Host "  [1/4] Escaneando red ($subnet.1 - $subnet.254)..." -ForegroundColor Yellow
Write-Host "        Esto puede tomar 30-60 segundos..." -ForegroundColor DarkGray

# ---- Ping sweep paralelo ----
$pingJobs = @()
1..254 | ForEach-Object {
    $ip = "$subnet.$_"
    $pingJobs += Start-Job -ScriptBlock {
        param($ip)
        $result = ping -n 1 -w 300 $ip 2>$null
        if ($LASTEXITCODE -eq 0) { $ip }
    } -ArgumentList $ip
}

# Esperar todos los pings
$activeIPs = @()
$pingJobs | ForEach-Object {
    $result = $_ | Wait-Job | Receive-Job
    if ($result) { $activeIPs += $result }
    $_ | Remove-Job -Force
}

Write-Host "  Hosts activos encontrados: $($activeIPs.Count)" -ForegroundColor Green

# ---- Leer tabla ARP ----
Write-Host ""
Write-Host "  [2/4] Obteniendo MACs y fabricantes..." -ForegroundColor Yellow

$arpOutput = arp -a 2>$null
$macTable  = @{}

foreach ($line in $arpOutput) {
    if ($line -match "(\d+\.\d+\.\d+\.\d+)\s+([\da-f-]{17})") {
        $ip  = $matches[1]
        $mac = $matches[2].Replace("-", ":").ToUpper()
        $macTable[$ip] = $mac
    }
}

# Función para buscar fabricante por MAC
function Get-Vendor($mac) {
    if (-not $mac -or $mac -eq "FF:FF:FF:FF:FF:FF") { return "Desconocido" }
    try {
        $macClean = $mac.Replace(":", "").Substring(0, 6)
        $uri      = "https://api.macvendors.com/$mac"
        $resp     = Invoke-WebRequest -Uri $uri -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        Start-Sleep -Milliseconds 500
        return $resp.Content.Trim()
    } catch {
        return "Desconocido"
    }
}

# ---- Escanear puertos clave y clasificar ----
Write-Host ""
Write-Host "  [3/4] Escaneando puertos y clasificando dispositivos..." -ForegroundColor Yellow

$KEY_PORTS = @(80, 443, 22, 23, 554, 8000, 8080, 8443, 37777, 34567, 5000, 9000)

function Test-Port($ip, $port, $timeoutMs = 400) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $ar  = $tcp.BeginConnect($ip, $port, $null, $null)
        $ok  = $ar.AsyncWaitHandle.WaitOne($timeoutMs, $false)
        if ($ok -and $tcp.Connected) { $tcp.Close(); return $true }
        $tcp.Close()
    } catch {}
    return $false
}

function Get-HttpTitle($ip, $port = 80) {
    try {
        $scheme = if ($port -eq 443 -or $port -eq 8443) { "https" } else { "http" }
        $resp   = Invoke-WebRequest -Uri "$scheme://$ip:$port" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
        if ($resp.Content -match "<title[^>]*>([^<]+)</title>") {
            return $matches[1].Trim().Substring(0, [Math]::Min($matches[1].Trim().Length, 60))
        }
    } catch {}
    return $null
}

function Get-DeviceType($vendor, $openPorts, $onvif) {
    $v = $vendor.ToLower()
    if ($onvif) { return "ip_camera" }
    if ($v -match "hikvision") {
        if ($openPorts -contains 8000 -or $openPorts -contains 554) { return "dvr_nvr" }
        return "ip_camera"
    }
    if ($v -match "dahua") {
        if ($openPorts -contains 37777 -or $openPorts -contains 554) { return "dvr_nvr" }
        return "ip_camera"
    }
    if ($v -match "uniview|hanwha|axis|reolink|annke|amcrest|foscam|vivotek") { return "ip_camera" }
    if ($openPorts -contains 554) { return "ip_camera" }
    if ($openPorts -contains 37777 -or $openPorts -contains 34567) { return "dvr_nvr" }
    if ($v -match "cisco|juniper|extreme") { return "switch" }
    if ($v -match "mikrotik|ubiquiti") { return "router_ap" }
    if ($v -match "tp-link|netgear|asus|d-link|tenda|mercusys|xiaomi") { return "router_ap" }
    if ($openPorts -contains 22 -and ($v -match "cisco|hp|dell|aruba")) { return "switch" }
    if ($openPorts -contains 80 -or $openPorts -contains 443) { return "web_device" }
    return "unknown"
}

$devices = @()
$total   = $activeIPs.Count
$current = 0

foreach ($ip in ($activeIPs | Sort-Object { [Version]$_ })) {
    $current++
    Write-Host "  [$current/$total] $ip..." -ForegroundColor DarkGray -NoNewline

    $mac       = if ($macTable.ContainsKey($ip)) { $macTable[$ip] } else { $null }
    $vendor    = if ($mac) { Get-Vendor $mac } else { "Desconocido" }
    $openPorts = @()

    foreach ($port in $KEY_PORTS) {
        if (Test-Port $ip $port) { $openPorts += $port }
    }

    $httpTitle = $null
    if ($openPorts -contains 80)   { $httpTitle = Get-HttpTitle $ip 80 }
    if (-not $httpTitle -and $openPorts -contains 8080) { $httpTitle = Get-HttpTitle $ip 8080 }
    if (-not $httpTitle -and $openPorts -contains 8000) { $httpTitle = Get-HttpTitle $ip 8000 }

    # Hostname via DNS
    $hostname = $null
    try {
        $dns      = [System.Net.Dns]::GetHostEntry($ip)
        $hostname = $dns.HostName
    } catch {}

    $deviceType = Get-DeviceType $vendor $openPorts $false

    $devices += @{
        ip         = $ip
        mac        = $mac
        vendor     = $vendor
        hostname   = $hostname
        deviceType = $deviceType
        openPorts  = $openPorts
        httpTitle  = $httpTitle
        onvif      = $false
    }

    $icon = switch ($deviceType) {
        "dvr_nvr"    { "📹" }
        "ip_camera"  { "📷" }
        "switch"     { "🔀" }
        "router_ap"  { "📡" }
        "web_device" { "🌐" }
        default      { "💻" }
    }
    Write-Host " $icon $vendor ($deviceType) ports:$($openPorts -join ',')" -ForegroundColor White
}

# ---- ONVIF WS-Discovery ----
Write-Host ""
Write-Host "  [4/4] Buscando camaras ONVIF..." -ForegroundColor Yellow

$onvifProbe = '<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><e:Header><w:MessageID>uuid:helpdesk-scanner</w:MessageID><w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>'

$onvifIPs = @()
try {
    $udpClient  = New-Object System.Net.Sockets.UdpClient
    $udpClient.EnableBroadcast = $true
    $multicast  = [System.Net.IPAddress]::Parse("239.255.255.250")
    $udpClient.JoinMulticastGroup($multicast)
    $endpoint   = New-Object System.Net.IPEndPoint($multicast, 3702)
    $bytes       = [System.Text.Encoding]::UTF8.GetBytes($onvifProbe)
    $udpClient.Send($bytes, $bytes.Length, $endpoint) | Out-Null

    $udpClient.Client.ReceiveTimeout = 3000
    $deadline = (Get-Date).AddSeconds(3)
    while ((Get-Date) -lt $deadline) {
        try {
            $remoteEP = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
            $data      = $udpClient.Receive([ref]$remoteEP)
            $respIP    = $remoteEP.Address.ToString()
            if ($respIP -notin $onvifIPs -and $respIP -ne $localIP) {
                $onvifIPs += $respIP
                Write-Host "  ONVIF encontrado: $respIP" -ForegroundColor Magenta
            }
        } catch { break }
    }
    $udpClient.Close()
} catch {}

# Marcar dispositivos ONVIF descubiertos
foreach ($ip in $onvifIPs) {
    $device = $devices | Where-Object { $_.ip -eq $ip }
    if ($device) {
        $device.onvif      = $true
        $device.deviceType = "ip_camera"
    } else {
        $devices += @{
            ip         = $ip
            mac        = $null
            vendor     = "Camara ONVIF"
            hostname   = $null
            deviceType = "ip_camera"
            openPorts  = @()
            httpTitle  = $null
            onvif      = $true
        }
    }
}

# ---- Enviar resultados al servidor ----
Write-Host ""
Write-Host "  Enviando $($devices.Count) dispositivos a HelpDesk OS..." -ForegroundColor Cyan

$scanStart = Get-Date
$payload = @{
    scannedFrom  = $env:COMPUTERNAME
    subnet       = "$subnet.0/24"
    scanDuration = [int]((Get-Date) - $scanStart).TotalSeconds
    agentVersion = $AGENT_VER
    devices      = $devices
} | ConvertTo-Json -Depth 5

$headers = @{ "Authorization" = "Bearer $API_TOKEN"; "Content-Type" = "application/json" }

try {
    $resp = Invoke-RestMethod -Uri "$API_URL/api/agent/network-scan" -Method POST -Body $payload -Headers $headers
    Write-Host ""
    Write-Host "  OK  Scan completado" -ForegroundColor Green
    Write-Host "  ->  Dispositivos registrados: $($resp.deviceCount)" -ForegroundColor White
    Write-Host "  ->  Scan ID: $($resp.scanId)"                        -ForegroundColor DarkGray
} catch {
    Write-Host ""
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "  Presiona cualquier tecla para cerrar..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;
