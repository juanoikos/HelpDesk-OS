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

  // ── .bat autónomo con PS1 embebido en base64 (sin internet, sin política) ────
  const ps1Content = PS1_SCANNER
    .replace(/APP_URL_PLACEHOLDER/g, server)
    .replace(/TOKEN_PLACEHOLDER/g,   token);

  const b64      = Buffer.from(ps1Content, "utf8").toString("base64");
  const b64Lines = b64.match(/.{1,64}/g) ?? [];

  const echoLines = b64Lines
    .map((line, i) => i === 0
      ? `echo ${line}> "%TMPB64%"`
      : `echo ${line}>> "%TMPB64%"`)
    .join("\r\n");

  const bat = `@echo off
chcp 65001 >nul
title HelpDesk OS - Scanner de Red v2.0
echo.
echo  =============================================
echo   HelpDesk OS - Scanner de Red v1.0
echo  =============================================
echo.
set "TMPB64=%TEMP%\\hd_scanner_%RANDOM%.b64"
set "TMPPS1=%TEMP%\\hd_scanner_%RANDOM%.ps1"
${echoLines}
certutil -decode "%TMPB64%" "%TMPPS1%" >nul 2>&1
del "%TMPB64%" 2>nul
if not exist "%TMPPS1%" (
  echo  ERROR: No se pudo preparar el scanner.
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
#  HelpDesk OS - Scanner de red v2.0
#  Descubre dispositivos en TODAS las subredes locales activas
#  Ejecuta como Administrador para mejores resultados
# ================================================================

$API_URL   = "APP_URL_PLACEHOLDER"
$API_TOKEN = "TOKEN_PLACEHOLDER"
$AGENT_VER = "2.0.0"

# ── OUI local (prefijos comunes: CCTV, camaras, switches, APs) ────────────────
# Evita llamadas HTTP por cada dispositivo — solo consulta API para los desconocidos
$OUI_LOCAL = @{
    "44:19:B6"="Hikvision";"BC:AD:28"="Hikvision";"00:23:63"="Hikvision"
    "54:C4:15"="Hikvision";"A4:14:37"="Hikvision";"28:57:BE"="Hikvision"
    "CC:CE:1E"="Hikvision";"80:71:1F"="Hikvision";"C0:56:E3"="Hikvision"
    "3C:EF:8C"="Dahua";    "E0:50:8B"="Dahua"
    "90:02:A9"="Dahua";    "B4:A3:82"="Dahua";    "70:85:C2"="Dahua"
    "00:12:40"="Dahua";    "BC:32:B2"="Dahua"
    "F4:4D:30"="Uniview";  "00:0C:43"="Uniview"
    "00:40:8C"="Axis"
    "00:09:18"="Hanwha"
    "24:A4:3C"="Ubiquiti"; "78:8A:20"="Ubiquiti"; "DC:9F:DB"="Ubiquiti"
    "04:18:D6"="Ubiquiti"; "00:27:22"="Ubiquiti"; "F4:92:BF"="Ubiquiti"
    "2C:C8:1B"="MikroTik"; "48:8F:5A"="MikroTik"; "74:4D:28"="MikroTik"
    "E4:8D:8C"="MikroTik"; "D4:CA:6D"="MikroTik"
    "50:C7:BF"="TP-Link";  "14:91:82"="TP-Link";  "F4:F2:6D"="TP-Link"
    "F8:1A:67"="TP-Link";  "60:32:B1"="TP-Link";  "98:DE:D0"="TP-Link"
    "C8:3A:35"="Tenda";    "C4:6E:1F"="Tenda";    "00:0A:EB"="Tenda"
    "00:09:5B"="Netgear";  "20:E5:2A"="Netgear";  "84:1B:5E"="Netgear"
    "00:05:5D"="D-Link";   "14:D6:4D"="D-Link";   "90:94:E4"="D-Link"
    "1C:BD:B9"="D-Link";   "00:1B:11"="D-Link"
    "04:92:26"="ASUS";     "00:11:2F"="ASUS";     "50:46:5D"="ASUS"
    "2C:FD:A1"="ASUS";     "AC:22:0B"="ASUS"
    "00:0C:6E"="Cisco";    "00:1E:BD"="Cisco";    "F8:72:EA"="Cisco"
    "74:86:E2"="Cisco";    "00:25:B5"="Cisco"
}

function Get-OUIVendor {
    param([string]$mac)
    if (-not $mac -or $mac -eq "FF:FF:FF:FF:FF:FF") { return $null }
    $parts  = $mac.ToUpper() -split ":"
    $prefix = $parts[0] + ":" + $parts[1] + ":" + $parts[2]
    return $OUI_LOCAL[$prefix]
}

Write-Host ""
Write-Host "  HelpDesk OS - Scanner de red v2.0" -ForegroundColor Cyan
Write-Host "  ====================================" -ForegroundColor DarkGray
Write-Host ""

# ── Detectar TODAS las interfaces activas (excluir virtual/loopback) ──────────
Write-Host "  Detectando interfaces de red..." -ForegroundColor Yellow

$allAddrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -notmatch "^127\." -and
        $_.IPAddress -notmatch "^169\.254\." -and
        $_.IPAddress -ne "0.0.0.0" -and
        $_.PrefixLength -ge 16 -and $_.PrefixLength -le 30
    }

$activeAdapters = @()
foreach ($addr in $allAddrs) {
    $iface = Get-NetAdapter -InterfaceIndex $addr.InterfaceIndex -ErrorAction SilentlyContinue
    if (-not $iface -or $iface.Status -ne "Up") { continue }
    $desc = $iface.InterfaceDescription
    if ($desc -match "Hyper-V|Virtual|VMware|Loopback|Bluetooth|WAN Miniport|6to4|Teredo|isatap|TAP") { continue }
    $mac = $iface.MacAddress.Replace("-",":").ToUpper()
    $activeAdapters += [PSCustomObject]@{
        IP     = $addr.IPAddress
        Prefix = $addr.PrefixLength
        MAC    = $mac
        Name   = $iface.Name
        Index  = $addr.InterfaceIndex
    }
}

if ($activeAdapters.Count -eq 0) {
    Write-Host "  ERROR: No se encontraron interfaces activas." -ForegroundColor Red
    Read-Host "  Presiona Enter para salir"
    exit 1
}

# Construir lista de subredes /24 unicas a escanear
$subnets    = @()
$localIPSet = @{}
foreach ($a in $activeAdapters) {
    $p = $a.IP.Split(".")
    $sn = $p[0] + "." + $p[1] + "." + $p[2]
    $localIPSet[$a.IP] = $a.MAC
    if (-not ($subnets | Where-Object { $_.Subnet -eq $sn })) {
        $subnets += [PSCustomObject]@{ Subnet = $sn; LocalIP = $a.IP; LocalMAC = $a.MAC; Name = $a.Name }
        Write-Host "  $($a.Name)  $($a.IP)  ->  escaneando $sn.0/24" -ForegroundColor White
    }
}
Write-Host ""

# ── [1/4] Descubrir hosts: ARP + async ping en todas las subredes ─────────────
Write-Host "  [1/4] Descubriendo hosts en $($subnets.Count) subred(es)..." -ForegroundColor Yellow

$discovered = [System.Collections.Generic.HashSet[string]]::new()

# ARP (detecta equipos que no responden ICMP)
try {
    $neighbors = Get-NetNeighbor -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.State -notin @("Unreachable","Incomplete") }
    foreach ($n in $neighbors) {
        foreach ($s in $subnets) {
            if ($n.IPAddress -match ("^" + [regex]::Escape($s.Subnet) + "\.")) {
                $discovered.Add($n.IPAddress) | Out-Null
            }
        }
    }
} catch {
    foreach ($line in (arp -a 2>$null)) {
        foreach ($s in $subnets) {
            if ($line -match ("(" + [regex]::Escape($s.Subnet) + "\.\d{1,3})")) {
                $discovered.Add($matches[1]) | Out-Null
            }
        }
    }
}

# Agregar IPs locales
foreach ($s in $subnets) { $discovered.Add($s.LocalIP) | Out-Null }

# Ping sweep async en todas las subredes simultaneamente
$totalIPs = $subnets.Count * 254
Write-Host "  Ping sweep ($totalIPs IPs en paralelo)..." -ForegroundColor DarkGray

$pingTasks = foreach ($s in $subnets) {
    $sn = $s.Subnet
    1..254 | ForEach-Object {
        $ip   = $sn + "." + $_
        $ping = [System.Net.NetworkInformation.Ping]::new()
        [PSCustomObject]@{ ip = $ip; task = $ping.SendPingAsync($ip, 700); ping = $ping }
    }
}
[System.Threading.Tasks.Task]::WaitAll($pingTasks.task)
foreach ($t in $pingTasks) {
    if ($t.task.Result.Status -eq [System.Net.NetworkInformation.IPStatus]::Success) {
        $discovered.Add($t.ip) | Out-Null
    }
    $t.ping.Dispose()
}

Write-Host "  Hosts descubiertos: $($discovered.Count)" -ForegroundColor Green

# ── [2/4] MACs y fabricantes ──────────────────────────────────────────────────
Write-Host ""
Write-Host "  [2/4] Obteniendo MACs y fabricantes..." -ForegroundColor Yellow

$macTable = @{}
try {
    Get-NetNeighbor -AddressFamily IPv4 -ErrorAction Stop |
        Where-Object { $_.State -notin @("Unreachable","Incomplete") -and
                       $_.LinkLayerAddress -notmatch "^00-00-00" -and
                       $_.LinkLayerAddress -ne "FF-FF-FF-FF-FF-FF" } |
        ForEach-Object { $macTable[$_.IPAddress] = $_.LinkLayerAddress.Replace("-",":").ToUpper() }
} catch {
    foreach ($line in (arp -a 2>$null)) {
        if ($line -match "(\d+\.\d+\.\d+\.\d+)\s+([\da-fA-F-]{17})") {
            $macTable[$matches[1]] = $matches[2].Replace("-",":").ToUpper()
        }
    }
}
foreach ($ip in $localIPSet.Keys) { $macTable[$ip] = $localIPSet[$ip] }

# Resolver fabricantes: tabla local primero
$vendorCache = @{}
$unknownMACs = [System.Collections.Generic.List[string]]::new()
foreach ($ip in $discovered) {
    $mac = $macTable[$ip]
    if (-not $mac) { continue }
    $v = Get-OUIVendor $mac
    if ($v) { $vendorCache[$mac] = $v }
    elseif (-not $vendorCache.ContainsKey($mac) -and $unknownMACs.Count -lt 25) {
        $unknownMACs.Add($mac) | Out-Null
    }
}

# Consulta API solo para los desconocidos (paralelo, throttled)
$uniqueUnknown = $unknownMACs | Select-Object -Unique
if ($uniqueUnknown.Count -gt 0) {
    Write-Host "  Consultando API para $($uniqueUnknown.Count) fabricantes desconocidos..." -ForegroundColor DarkGray
    $pool = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspacePool(1, 8)
    $pool.Open()
    $vendorJobs = foreach ($m in $uniqueUnknown) {
        $ps = [System.Management.Automation.PowerShell]::Create()
        $ps.RunspacePool = $pool
        $ps.AddScript({
            param($mac)
            try {
                $r = Invoke-WebRequest -Uri ("https://api.macvendors.com/" + $mac) -TimeoutSec 4 -UseBasicParsing -ErrorAction Stop
                return $r.Content.Trim()
            } catch { return "" }
        }).AddArgument($m) | Out-Null
        [PSCustomObject]@{ mac = $m; ps = $ps; h = $ps.BeginInvoke() }
    }
    foreach ($j in $vendorJobs) {
        try {
            $v = $j.ps.EndInvoke($j.h) | Select-Object -First 1
            if ($v) { $vendorCache[$j.mac] = [string]$v }
        } catch {}
        $j.ps.Dispose()
    }
    $pool.Close(); $pool.Dispose()
}
Write-Host "  MACs resueltas: $($vendorCache.Count)" -ForegroundColor DarkGray

# ── [3/4] Escaneo de puertos en paralelo (Runspaces) ─────────────────────────
Write-Host ""
Write-Host "  [3/4] Escaneando puertos en $($discovered.Count) hosts..." -ForegroundColor Yellow

$KEY_PORTS = @(80, 443, 22, 23, 554, 8000, 8080, 8443, 37777, 34567, 5000, 9000)

$scanScript = {
    param([string]$ip, [int[]]$ports, [int]$tms)
    $open = [System.Collections.Generic.List[int]]::new()
    foreach ($port in $ports) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient
            $ar  = $tcp.BeginConnect($ip, $port, $null, $null)
            if ($ar.AsyncWaitHandle.WaitOne($tms, $false) -and $tcp.Connected) { $open.Add($port) }
            try { $tcp.Close() } catch {}
        } catch {}
    }
    $hostname = $null
    try { $hostname = [string][System.Net.Dns]::GetHostEntry($ip).HostName } catch {}
    $httpTitle = $null
    foreach ($hp in @(80, 8080, 8000, 443, 8443)) {
        if (-not $open.Contains($hp)) { continue }
        try {
            $scheme = if ($hp -eq 443 -or $hp -eq 8443) { "https" } else { "http" }
            $url    = $scheme + "://" + $ip + ":" + $hp
            $r = Invoke-WebRequest -Uri $url -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
            if ($r.Content -match "<title[^>]*>([^<]+)</title>") {
                $t = $matches[1].Trim()
                $httpTitle = $t.Substring(0, [Math]::Min($t.Length, 60))
                break
            }
        } catch {}
    }
    [PSCustomObject]@{ ip = $ip; openPorts = $open.ToArray(); hostname = $hostname; httpTitle = $httpTitle }
}

$pool = [System.Management.Automation.Runspaces.RunspaceFactory]::CreateRunspacePool(1, 60)
$pool.Open()
$portJobs = foreach ($ip in $discovered) {
    $ps = [System.Management.Automation.PowerShell]::Create()
    $ps.RunspacePool = $pool
    $ps.AddScript($scanScript).AddArgument([string]$ip).AddArgument($KEY_PORTS).AddArgument(500) | Out-Null
    [PSCustomObject]@{ ps = $ps; h = $ps.BeginInvoke() }
}

$portResults = @{}
$done = 0
foreach ($j in $portJobs) {
    try {
        $r = $j.ps.EndInvoke($j.h) | Select-Object -First 1
        if ($r) { $portResults[$r.ip] = $r }
    } catch {}
    $j.ps.Dispose()
    $done++
    if ($done % 25 -eq 0) { Write-Host "  $done/$($portJobs.Count) escaneados..." -ForegroundColor DarkGray }
}
$pool.Close(); $pool.Dispose()

function Get-DeviceType {
    param([string]$vendor, [int[]]$ports, [bool]$onvif)
    if ($onvif) { return "ip_camera" }
    $v = $vendor.ToLower()
    if ($v -match "hikvision") { return if ($ports -contains 8000 -or $ports -contains 554) { "dvr_nvr" } else { "ip_camera" } }
    if ($v -match "dahua")     { return if ($ports -contains 37777 -or $ports -contains 554) { "dvr_nvr" } else { "ip_camera" } }
    if ($v -match "uniview|hanwha|axis|reolink|amcrest|foscam|vivotek|annke") { return "ip_camera" }
    if ($ports -contains 37777 -or $ports -contains 34567) { return "dvr_nvr" }
    if ($ports -contains 554)  { return "ip_camera" }
    if ($v -match "cisco|juniper|extreme|aruba|hp enterprise") { return "switch" }
    if ($v -match "mikrotik|ubiquiti") { return "router_ap" }
    if ($v -match "tp-link|tplink|netgear|asus|d-link|tenda|mercusys|xiaomi") { return "router_ap" }
    if ($ports -contains 80 -or $ports -contains 443 -or $ports -contains 8080) { return "web_device" }
    return "unknown"
}

$devices = @()
foreach ($ipRaw in ($discovered | Sort-Object { try { [Version]$_ } catch { $_ } })) {
    $ip      = [string]$ipRaw
    $mac     = if ($macTable.ContainsKey($ip)) { [string]$macTable[$ip] } else { $null }
    $vendor  = if ($mac -and $vendorCache.ContainsKey($mac)) { [string]$vendorCache[$mac] } else { "Desconocido" }
    $pr      = $portResults[$ip]
    $ports   = if ($pr) { @($pr.openPorts | ForEach-Object { [int]$_ }) } else { @() }
    $dtype   = [string](Get-DeviceType $vendor $ports $false)
    $hn      = if ($pr -and $pr.hostname) { [string]$pr.hostname } else { $null }
    $ht      = if ($pr -and $pr.httpTitle) { [string]$pr.httpTitle } else { $null }

    $devices += [PSCustomObject]@{
        ip = $ip; mac = $mac; vendor = $vendor; hostname = $hn
        deviceType = $dtype; openPorts = $ports; httpTitle = $ht; onvif = $false
    }

    $col  = if ($dtype -in @("dvr_nvr","ip_camera")) { "Cyan" } else { "DarkGray" }
    $icon = switch ($dtype) {
        "dvr_nvr"   { "[DVR]" }; "ip_camera"  { "[CAM]" }; "switch" { "[SW]" }
        "router_ap" { "[AP]"  }; "web_device"  { "[WEB]" }; default  { "[?]" }
    }
    Write-Host ("  " + $ip.PadRight(16) + $icon.PadRight(8) + $vendor) -ForegroundColor $col
}

# ── [4/4] ONVIF WS-Discovery en todas las interfaces ─────────────────────────
Write-Host ""
Write-Host "  [4/4] ONVIF WS-Discovery..." -ForegroundColor Yellow

$onvifProbe = '<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><e:Header><w:MessageID>uuid:helpdesk-scan-2</w:MessageID><w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>'
$onvifBytes = [System.Text.Encoding]::UTF8.GetBytes($onvifProbe)
$mc = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse("239.255.255.250"), 3702)

# Enviar probe en cada interfaz activa para cubrir todas las subredes
foreach ($s in $subnets) {
    try {
        $udp = New-Object System.Net.Sockets.UdpClient
        $local = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Parse($s.LocalIP), 0)
        $udp.Client.Bind($local)
        $udp.EnableBroadcast = $true
        $udp.Send($onvifBytes, $onvifBytes.Length, $mc) | Out-Null
        $udp.Close()
    } catch {}
}

# Recolectar respuestas
try {
    $udpL = New-Object System.Net.Sockets.UdpClient(3702)
    $udpL.Client.ReceiveTimeout = 3000
    $deadline = (Get-Date).AddSeconds(3)
    while ((Get-Date) -lt $deadline) {
        try {
            $ep   = New-Object System.Net.IPEndPoint([System.Net.IPAddress]::Any, 0)
            $data = $udpL.Receive([ref]$ep)
            $ip   = $ep.Address.ToString()
            if ($localIPSet.ContainsKey($ip)) { continue }
            $dev  = $devices | Where-Object { $_.ip -eq $ip } | Select-Object -First 1
            if ($dev) { $dev.onvif = $true; $dev.deviceType = "ip_camera" }
            else {
                $devices += [PSCustomObject]@{
                    ip = $ip; mac = $null; vendor = "Camara ONVIF"; hostname = $null
                    deviceType = "ip_camera"; openPorts = @(); httpTitle = $null; onvif = $true
                }
            }
            Write-Host "  ONVIF: $ip" -ForegroundColor Magenta
        } catch { break }
    }
    $udpL.Close()
} catch {}

# ── Enviar resultados ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Enviando $($devices.Count) dispositivos a HelpDesk OS..." -ForegroundColor Cyan

$subnetStr = ($subnets | ForEach-Object { $_.Subnet + ".0/24" }) -join ", "
$payload = @{
    scannedFrom  = $env:COMPUTERNAME
    subnet       = $subnetStr
    scanDuration = 0
    agentVersion = $AGENT_VER
    devices      = $devices
} | ConvertTo-Json -Depth 5

$headers = @{ "Authorization" = "Bearer $API_TOKEN"; "Content-Type" = "application/json" }
try {
    $resp = Invoke-RestMethod -Uri "$API_URL/api/agent/network-scan" -Method POST -Body $payload -Headers $headers
    Write-Host "  OK  Scan completado — $($resp.deviceCount) dispositivos registrados" -ForegroundColor Green
    Write-Host "  ID: $($resp.scanId)" -ForegroundColor DarkGray
} catch {
    Write-Host "  ERROR: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "  Presiona cualquier tecla para cerrar..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;
