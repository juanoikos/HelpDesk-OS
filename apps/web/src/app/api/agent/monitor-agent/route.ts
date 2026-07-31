import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";
import { randomUUID } from "crypto";

// GET /api/agent/monitor-agent  → descarga helpdesk-monitor.ps1
// Igual que el scanner: usa sesión del navegador para embeber el token.

export async function GET(req: NextRequest) {
  let token = "";

  // ── Modo Bearer: llamado desde el propio agente (ya tiene token) ────────────
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const t = authHeader.slice(7);
    const s = await prisma.tenantSettings.findFirst({ where: { agentToken: t } });
    if (!s) return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    token = t;
  } else {
    // ── Modo descarga: navegador autenticado → usamos sesión ─────────────────
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const tenantId = session.user.tenantId;

    // Si no tiene token aún lo generamos automáticamente (igual que el scanner)
    let settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
    if (!settings?.agentToken) {
      settings = await prisma.tenantSettings.upsert({
        where:  { tenantId },
        create: { tenantId, agentToken: randomUUID() },
        update: { agentToken: randomUUID() },
      });
    }
    token = settings.agentToken!;
  }

  const serverUrl = process.env.AUTH_URL ?? req.nextUrl.origin;

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
                $timeoutVal = if ($Target.timeout) { $Target.timeout } else { 5000 }
                $timeout = [int]([math]::Max(1, [math]::Ceiling($timeoutVal / 1000)))
                try {
                    # Invoke-WebRequest (sincrono) en vez de HttpClient async: ver nota
                    # en el scriptBlock paralelo mas abajo sobre el deadlock en runspaces.
                    [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
                    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
                    $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec $timeout -UseBasicParsing -ErrorAction Stop
                    $elapsed  = [int]((Get-Date) - $start).TotalMilliseconds

                    $result.httpStatus = [int]$response.StatusCode
                    $result.latency    = $elapsed
                    $result.status     = if ([int]$response.StatusCode -lt 500) { "up" } else { "down" }
                    if ($result.status -eq "down") { $result.error = "HTTP $($response.StatusCode)" }
                } catch [System.Net.WebException] {
                    $elapsed = [int]((Get-Date) - $start).TotalMilliseconds
                    $webResp = $_.Exception.Response
                    if ($webResp) {
                        $status = [int]$webResp.StatusCode
                        $result.httpStatus = $status
                        $result.latency    = $elapsed
                        $result.status     = if ($status -lt 500) { "up" } else { "down" }
                        if ($result.status -eq "down") { $result.error = "HTTP $status" }
                    } elseif ($_.Exception.Message -match "timed out|tiempo de espera") {
                        $result.status = "timeout"
                        $result.error  = "Timeout"
                    } else {
                        $result.status = "down"
                        $result.error  = $_.Exception.Message
                    }
                } catch {
                    $result.status = if ($_.Exception.Message -match "timeout|timed out|tiempo de espera") { "timeout" } else { "down" }
                    $result.error  = $_.Exception.Message
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
                        $timeoutVal = if ($Target.timeout) { $Target.timeout } else { 5000 }
                        $timeout = [int]([math]::Max(1, [math]::Ceiling($timeoutVal / 1000)))
                        try {
                            # Nota: se usa Invoke-WebRequest (sincrono) en vez de HttpClient async.
                            # HttpClient.GetAsync().GetAwaiter().GetResult() se cuelga de forma
                            # consistente al ejecutarse dentro de un runspace de un RunspacePool
                            # (deadlock clasico de async/await en PowerShell), lo que hacia que
                            # TODOS los checks HTTP/HTTPS fallaran con "Se cancelo una tarea"
                            # sin importar el dispositivo.
                            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
                            [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls11 -bor [System.Net.SecurityProtocolType]::Tls
                            $response = Invoke-WebRequest -Uri $url -Method Get -TimeoutSec $timeout -UseBasicParsing -ErrorAction Stop
                            $elapsed  = [int]((Get-Date)-$start).TotalMilliseconds
                            $result.httpStatus = [int]$response.StatusCode
                            $result.latency    = $elapsed
                            $result.status     = if ([int]$response.StatusCode -lt 500) { "up" } else { "down" }
                            if ($result.status -eq "down") { $result.error = "HTTP $($response.StatusCode)" }
                        } catch [System.Net.WebException] {
                            $elapsed = [int]((Get-Date)-$start).TotalMilliseconds
                            $webResp = $_.Exception.Response
                            if ($webResp) {
                                # El dispositivo SI respondio (ej. 401/403/404) -> esta en linea
                                $status = [int]$webResp.StatusCode
                                $result.httpStatus = $status
                                $result.latency    = $elapsed
                                $result.status     = if ($status -lt 500) { "up" } else { "down" }
                                if ($result.status -eq "down") { $result.error = "HTTP $status" }
                            } elseif ($_.Exception.Message -match "timed out|tiempo de espera") {
                                $result.status = "timeout"; $result.error = "Timeout"
                            } else {
                                $result.status = "down"; $result.error = $_.Exception.Message
                            }
                        } catch {
                            $result.status = if ($_.Exception.Message -match "timeout|timed out|tiempo de espera") { "timeout" } else { "down" }
                            $result.error = $_.Exception.Message
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
