import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";

// GET /api/agent/monitor-agent  → descarga helpdesk-monitor.bat
// El .bat extrae y ejecuta un script PowerShell que corre en bucle continuo
// haciendo checks de todos los targets LAN asignados al agente.

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  let token = "";

  // Si viene autenticado, usar su token; sino, generar bat genérico que pide token
  if (auth?.startsWith("Bearer ")) {
    token = auth.slice(7);
    const settings = await prisma.tenantSettings.findFirst({ where: { agentToken: token } });
    if (!settings) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }
  }

  const serverUrl = req.nextUrl.origin;

  const PS_SCRIPT = `
# HelpDesk OS — Monitor Agent LAN
# Corre en bucle continuo. Instalar como tarea programada de Windows para que arranque automaticamente.
# Requiere PowerShell 5.1+ (Windows 7/Server 2008 R2 en adelante)

param(
    [string]$ServerUrl  = "${serverUrl}",
    [string]$AgentToken = "${token}"
)

if (-not $AgentToken) {
    $AgentToken = Read-Host "Pega aqui el token del agente HelpDesk OS"
}

$AgentHost   = $env:COMPUTERNAME
$BaseHeaders = @{ "Authorization" = "Bearer $AgentToken"; "Content-Type" = "application/json" }

Write-Host "[HelpDesk Monitor] Iniciando agente en $AgentHost -> $ServerUrl" -ForegroundColor Cyan

# ── Funcion de check ────────────────────────────────────────────────────────────
function Invoke-Check {
    param($Target)

    $start  = Get-Date
    $result = [ordered]@{
        targetId   = $Target.id
        status     = "down"
        latency    = $null
        httpStatus = $null
        error      = $null
        checkedAt  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        checkedBy  = $AgentHost
    }

    try {
        switch ($Target.checkType) {

            "ping" {
                $ok = Test-Connection -ComputerName $Target.host -Count 1 -Quiet -ErrorAction SilentlyContinue
                if ($ok) {
                    $ping = Test-Connection -ComputerName $Target.host -Count 1 -ErrorAction SilentlyContinue
                    $result.status  = "up"
                    $result.latency = if ($ping) { [int]$ping.ResponseTime } else { [int]((Get-Date) - $start).TotalMilliseconds }
                } else {
                    $result.status = "down"
                    $result.error  = "Sin respuesta ICMP"
                }
            }

            "tcp" {
                $port    = if ($Target.port) { $Target.port } else { 80 }
                $timeout = if ($Target.timeout) { $Target.timeout } else { 5000 }
                $tcpOk = (Test-NetConnection -ComputerName $Target.host -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue) 2>$null
                $elapsed = [int]((Get-Date) - $start).TotalMilliseconds
                if ($tcpOk) {
                    $result.status  = "up"
                    $result.latency = $elapsed
                } else {
                    $result.status = "down"
                    $result.error  = "Puerto $port no accesible"
                }
            }

            { $_ -in "http","https" } {
                $port    = if ($Target.port) { $Target.port } else { if ($Target.checkType -eq "https") { 443 } else { 80 } }
                $path    = if ($Target.httpPath) { $Target.httpPath } else { "/" }
                $url     = "$($Target.checkType)://$($Target.host):$port$path"
                $timeout = [int]([math]::Max(1, [math]::Ceiling(($Target.timeout ?? 5000) / 1000)))
                try {
                    # Ignorar errores de certificado SSL en checks internos
                    Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue
                    $handler = New-Object System.Net.Http.HttpClientHandler
                    $handler.ServerCertificateCustomValidationCallback = { $true }
                    $client = New-Object System.Net.Http.HttpClient($handler)
                    $client.Timeout = [TimeSpan]::FromSeconds($timeout)

                    $response = $client.GetAsync($url).GetAwaiter().GetResult()
                    $elapsed  = [int]((Get-Date) - $start).TotalMilliseconds

                    $result.httpStatus = [int]$response.StatusCode
                    $result.latency    = $elapsed
                    $result.status     = if ([int]$response.StatusCode -lt 500) { "up" } else { "down" }
                    if ($result.status -eq "down") { $result.error = "HTTP $($response.StatusCode)" }

                    $client.Dispose()
                    $handler.Dispose()
                } catch {
                    $elapsed = [int]((Get-Date) - $start).TotalMilliseconds
                    if ($_.Exception.Message -match "timeout|cancel") {
                        $result.status = "timeout"
                        $result.error  = "Timeout"
                    } else {
                        $result.status = "down"
                        $result.error  = $_.Exception.InnerException?.Message ?? $_.Exception.Message
                    }
                }
            }

            default {
                $result.status = "down"
                $result.error  = "checkType desconocido: $($Target.checkType)"
            }
        }
    } catch {
        $result.status = "down"
        $result.error  = $_.Exception.Message
    }

    return $result
}

# ── Loop principal ────────────────────────────────────────────────────────────────
$consecutiveErrors = 0

while ($true) {
    try {
        # Obtener targets asignados
        $fetchUrl = "$ServerUrl/api/agent/monitor-fetch?agentHost=$AgentHost"
        $resp     = Invoke-RestMethod -Uri $fetchUrl -Headers $BaseHeaders -Method GET -TimeoutSec 15

        $targets = $resp.targets
        Write-Host "[$(Get-Date -f 'HH:mm:ss')] $($targets.Count) targets a chequear" -ForegroundColor Gray

        if ($targets.Count -eq 0) {
            Write-Host "  Sin targets asignados. Esperando 30s..." -ForegroundColor DarkGray
            Start-Sleep -Seconds 30
            continue
        }

        # Ejecutar checks usando runspaces (paralelo, compatible con PS5.1)
        $scriptBlock = {
            param($Target, $AgentHost)
            # Funcion local de check (debe estar inline en el runspace)
            $start  = Get-Date
            $result = [ordered]@{
                targetId   = $Target.id
                status     = "down"
                latency    = $null
                httpStatus = $null
                error      = $null
                checkedAt  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
                checkedBy  = $AgentHost
            }
            try {
                switch ($Target.checkType) {
                    "ping" {
                        $ok = Test-Connection -ComputerName $Target.host -Count 1 -Quiet -ErrorAction SilentlyContinue
                        if ($ok) {
                            $ping = Test-Connection -ComputerName $Target.host -Count 1 -ErrorAction SilentlyContinue
                            $result.status  = "up"
                            $result.latency = if ($ping) { [int]$ping.ResponseTime } else { [int]((Get-Date)-$start).TotalMilliseconds }
                        } else {
                            $result.status = "down"; $result.error = "Sin respuesta ICMP"
                        }
                    }
                    "tcp" {
                        $port  = if ($Target.port) { $Target.port } else { 80 }
                        $tcpOk = (Test-NetConnection -ComputerName $Target.host -Port $port -InformationLevel Quiet -WarningAction SilentlyContinue) 2>$null
                        $elapsed = [int]((Get-Date)-$start).TotalMilliseconds
                        if ($tcpOk) { $result.status = "up"; $result.latency = $elapsed }
                        else        { $result.status = "down"; $result.error = "Puerto $port no accesible" }
                    }
                    { $_ -in "http","https" } {
                        $port    = if ($Target.port) { $Target.port } else { if ($Target.checkType -eq "https") { 443 } else { 80 } }
                        $path    = if ($Target.httpPath) { $Target.httpPath } else { "/" }
                        $url     = "$($Target.checkType)://$($Target.host):$port$path"
                        $timeout = [int]([math]::Max(1, [math]::Ceiling(($Target.timeout ?? 5000)/1000)))
                        try {
                            Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue
                            $handler = New-Object System.Net.Http.HttpClientHandler
                            $handler.ServerCertificateCustomValidationCallback = { $true }
                            $client  = New-Object System.Net.Http.HttpClient($handler)
                            $client.Timeout = [TimeSpan]::FromSeconds($timeout)
                            $response = $client.GetAsync($url).GetAwaiter().GetResult()
                            $elapsed  = [int]((Get-Date)-$start).TotalMilliseconds
                            $result.httpStatus = [int]$response.StatusCode
                            $result.latency    = $elapsed
                            $result.status     = if ([int]$response.StatusCode -lt 500) { "up" } else { "down" }
                            if ($result.status -eq "down") { $result.error = "HTTP $($response.StatusCode)" }
                            $client.Dispose(); $handler.Dispose()
                        } catch {
                            $result.status = if ($_.Exception.Message -match "timeout|cancel") { "timeout" } else { "down" }
                            $result.error  = $_.Exception.InnerException?.Message ?? $_.Exception.Message
                        }
                    }
                }
            } catch {
                $result.status = "down"; $result.error = $_.Exception.Message
            }
            return $result
        }

        # Pool de 10 runspaces paralelos
        $pool = [runspacefactory]::CreateRunspacePool(1, 10)
        $pool.Open()
        $jobs = @()
        foreach ($t in $targets) {
            $ps = [powershell]::Create()
            $ps.RunspacePool = $pool
            [void]$ps.AddScript($scriptBlock).AddArgument($t).AddArgument($AgentHost)
            $jobs += @{ PS = $ps; Handle = $ps.BeginInvoke() }
        }

        $results = @()
        foreach ($job in $jobs) {
            try   { $results += $job.PS.EndInvoke($job.Handle) }
            catch { Write-Host "  Error en job: $_" -ForegroundColor DarkRed }
            $job.PS.Dispose()
        }
        $pool.Close(); $pool.Dispose()

        # Mostrar resumen en consola
        $up   = ($results | Where-Object { $_.status -eq "up" }).Count
        $down = ($results | Where-Object { $_.status -ne "up" }).Count
        Write-Host "  Resultados: $up UP / $down DOWN" -ForegroundColor $(if ($down -gt 0) { "Yellow" } else { "Green" })

        # Enviar resultados al servidor
        $body = @{ results = $results } | ConvertTo-Json -Depth 5 -Compress
        Invoke-RestMethod -Uri "$ServerUrl/api/agent/monitor-push" -Headers $BaseHeaders -Method POST -Body $body -TimeoutSec 15 | Out-Null

        $consecutiveErrors = 0

    } catch {
        $consecutiveErrors++
        Write-Host "[$(Get-Date -f 'HH:mm:ss')] Error ($consecutiveErrors): $_" -ForegroundColor Red
        if ($consecutiveErrors -ge 5) {
            Write-Host "  Demasiados errores consecutivos. Esperando 5 min..." -ForegroundColor DarkRed
            Start-Sleep -Seconds 300
            $consecutiveErrors = 0
            continue
        }
    }

    # Interval: min entre todos los targets (min 15s, max 300s)
    $minInterval = 60
    if ($targets -and $targets.Count -gt 0) {
        $minInterval = [int]( ($targets | Measure-Object -Property interval -Minimum).Minimum )
    }
    $sleep = [math]::Max(15, [math]::Min($minInterval, 300))
    Write-Host "  Proxima revision en $sleep s" -ForegroundColor DarkGray
    Start-Sleep -Seconds $sleep
}
`.trimStart();

  const BAT_SCRIPT = `@echo off
chcp 65001 > nul
title HelpDesk OS — Monitor Agent
echo.
echo  ██╗  ██╗███████╗██╗     ██████╗ ██████╗ ███████╗███████╗██╗  ██╗
echo  ██║  ██║██╔════╝██║     ██╔══██╗██╔══██╗██╔════╝██╔════╝██║ ██╔╝
echo  ███████║█████╗  ██║     ██████╔╝██║  ██║█████╗  ███████╗█████╔╝
echo  ██╔══██║██╔══╝  ██║     ██╔═══╝ ██║  ██║██╔══╝  ╚════██║██╔═██╗
echo  ██║  ██║███████╗███████╗██║     ██████╔╝███████╗███████║██║  ██╗
echo  ╚═╝  ╚═╝╚══════╝╚══════╝╚═╝     ╚═════╝ ╚══════╝╚══════╝╚═╝  ╚═╝
echo.
echo  Monitor Agent LAN — ${serverUrl}
echo  Presiona Ctrl+C para detener
echo.

:: Extraer script PowerShell a temp
set "PS_FILE=%TEMP%\\helpdesk-monitor.ps1"
powershell -Command "& {$s=[System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('%~dp0monitor.b64')); Set-Content -Path $env:TEMP\\\\helpdesk-monitor.ps1 -Value $s -Encoding UTF8}" 2>nul

:: Ejecutar el script (mantiene la ventana abierta)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_FILE%"

pause
`;

  // Codificar el PS script en base64 para embeber en el .bat (workaround heredoc)
  // En realidad entregamos el .ps1 directamente — más limpio y compatible
  const headers = new Headers({
    "Content-Type": "application/octet-stream",
    "Content-Disposition": 'attachment; filename="helpdesk-monitor.ps1"',
  });

  return new NextResponse(PS_SCRIPT, { status: 200, headers });
}
