using System.Diagnostics;
using System.Text.RegularExpressions;

namespace DahuaAgent.Services;

/// <summary>
/// Servicio de tunnel para Live View:
/// 1. Descarga go2rtc.exe (convierte RTSP → HLS localmente, puerto 1984)
/// 2. Descarga cloudflared.exe (expone go2rtc a internet via tunnel HTTPS)
/// 3. Registra la URL pública del tunnel en HelpDesk OS
/// 4. Mantiene el registro actualizado cada 4 minutos
/// </summary>
public sealed class TunnelService : IAsyncDisposable
{
    private readonly ApiClient _api;
    private readonly int       _port;
    private readonly string    _dir;

    private Process? _go2rtcProcess;
    private Process? _cloudflaredProcess;
    private string?  _tunnelUrl;
    private Timer?   _heartbeat;

    public string? TunnelUrl => _tunnelUrl;

    public TunnelService(ApiClient api, int port = 1984)
    {
        _api  = api;
        _port = port;
        _dir  = AppContext.BaseDirectory;
    }

    // ─── Arranque ──────────────────────────────────────────────────────────────

    public async Task StartAsync(CancellationToken ct)
    {
        Log("Iniciando módulo Live View...");

        try
        {
            await EnsureGo2rtcAsync(ct);
            await EnsureCloudflaredAsync(ct);
        }
        catch (Exception ex)
        {
            Log($"⚠️  No se pudieron descargar las dependencias: {ex.Message}");
            Log("   Live View desactivado para esta sesión.");
            return;
        }

        StartGo2rtc();
        await Task.Delay(2500, ct); // esperar que go2rtc arranque

        _tunnelUrl = await StartCloudflaredAsync(ct);

        if (_tunnelUrl is not null)
        {
            try
            {
                await _api.RegisterTunnelAsync(_tunnelUrl);
                Log($"✅ Tunnel activo → {_tunnelUrl}");
            }
            catch (Exception ex)
            {
                Log($"⚠️  No se pudo registrar tunnel: {ex.Message}");
            }

            // Heartbeat cada 4 min para mantener el registro activo
            _heartbeat = new Timer(async _ =>
            {
                if (_tunnelUrl is null) return;
                try { await _api.RegisterTunnelAsync(_tunnelUrl); }
                catch { /* ignorar fallos del heartbeat */ }
            }, null, TimeSpan.FromMinutes(4), TimeSpan.FromMinutes(4));
        }
        else
        {
            Log("⚠️  No se obtuvo URL del tunnel — Live View no disponible.");
        }
    }

    // ─── go2rtc ────────────────────────────────────────────────────────────────

    private void StartGo2rtc()
    {
        var exe = Path.Combine(_dir, "go2rtc.exe");
        if (!File.Exists(exe)) { Log("go2rtc.exe no encontrado"); return; }

        // Configuración mínima para go2rtc
        var cfg = Path.Combine(_dir, "go2rtc.yaml");
        if (!File.Exists(cfg))
            File.WriteAllText(cfg, $"api:\n  listen: \":{_port}\"\nlog:\n  level: warn\n");

        _go2rtcProcess = Process.Start(new ProcessStartInfo
        {
            FileName               = exe,
            Arguments              = $"-config \"{cfg}\"",
            UseShellExecute        = false,
            CreateNoWindow         = true,
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
        });

        if (_go2rtcProcess is not null)
            Log($"go2rtc iniciado (PID {_go2rtcProcess.Id}, puerto {_port})");
    }

    // ─── cloudflared ──────────────────────────────────────────────────────────

    private async Task<string?> StartCloudflaredAsync(CancellationToken ct)
    {
        var exe = Path.Combine(_dir, "cloudflared.exe");
        if (!File.Exists(exe)) { Log("cloudflared.exe no encontrado"); return null; }

        var tcs = new TaskCompletionSource<string?>(TaskCreationOptions.RunContinuationsAsynchronously);

        // Regex para capturar la URL del tunnel
        var urlRegex = new Regex(@"https://[\w\-]+\.trycloudflare\.com", RegexOptions.Compiled);

        _cloudflaredProcess = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName               = exe,
                Arguments              = $"tunnel --url http://localhost:{_port} --no-autoupdate",
                UseShellExecute        = false,
                CreateNoWindow         = true,
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
            },
            EnableRaisingEvents = true,
        };

        // La URL aparece en stderr de cloudflared
        _cloudflaredProcess.ErrorDataReceived += (_, e) =>
        {
            if (e.Data is null || tcs.Task.IsCompleted) return;
            var m = urlRegex.Match(e.Data);
            if (m.Success) tcs.TrySetResult(m.Value);
        };

        _cloudflaredProcess.Exited += (_, _) =>
            tcs.TrySetResult(null);

        Log("Iniciando cloudflared... (puede tardar 15-30 segundos)");
        _cloudflaredProcess.Start();
        _cloudflaredProcess.BeginErrorReadLine();

        // Timeout de 45 segundos para obtener la URL
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(45));
        using var linked  = CancellationTokenSource.CreateLinkedTokenSource(ct, timeout.Token);

        try
        {
            return await tcs.Task.WaitAsync(linked.Token);
        }
        catch (OperationCanceledException)
        {
            Log("Timeout esperando URL de cloudflared");
            return null;
        }
    }

    // ─── Descarga de dependencias ─────────────────────────────────────────────

    private async Task EnsureGo2rtcAsync(CancellationToken ct)
    {
        var exe = Path.Combine(_dir, "go2rtc.exe");
        if (File.Exists(exe)) return;

        Log("Descargando go2rtc.exe (~10 MB)...");
        using var http = CreateHttpClient();
        var url   = "https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_win64.exe";
        var bytes = await http.GetByteArrayAsync(url, ct);
        await File.WriteAllBytesAsync(exe, bytes, ct);
        Log($"go2rtc.exe descargado ({bytes.Length / 1024:N0} KB)");
    }

    private async Task EnsureCloudflaredAsync(CancellationToken ct)
    {
        var exe = Path.Combine(_dir, "cloudflared.exe");
        if (File.Exists(exe)) return;

        Log("Descargando cloudflared.exe (~30 MB)...");
        using var http = CreateHttpClient();
        var url   = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe";
        var bytes = await http.GetByteArrayAsync(url, ct);
        await File.WriteAllBytesAsync(exe, bytes, ct);
        Log($"cloudflared.exe descargado ({bytes.Length / 1024:N0} KB)");
    }

    private static HttpClient CreateHttpClient()
    {
        var handler = new HttpClientHandler { AllowAutoRedirect = true, MaxAutomaticRedirections = 5 };
        var http    = new HttpClient(handler) { Timeout = TimeSpan.FromMinutes(3) };
        http.DefaultRequestHeaders.Add("User-Agent", "DahuaAgent/2.0");
        return http;
    }

    // ─── Cleanup ──────────────────────────────────────────────────────────────

    public async ValueTask DisposeAsync()
    {
        _heartbeat?.Dispose();

        // Notificar al servidor que el tunnel se cierra
        try { await _api.UnregisterTunnelAsync(); } catch { }

        // Matar procesos hijos
        foreach (var p in new[] { _cloudflaredProcess, _go2rtcProcess })
        {
            try { p?.Kill(entireProcessTree: true); p?.Dispose(); } catch { }
        }

        Log("Tunnel cerrado.");
    }

    private static void Log(string msg) =>
        Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] [TUNNEL] {msg}");
}
