using System.Diagnostics;

namespace DahuaAgent.Services;

public sealed class TunnelService : IAsyncDisposable
{
private readonly ApiClient _api;
private readonly int _port;
private readonly string _dir;
private readonly string _tunnelToken;
private readonly string _tunnelHostname;

private Process? _go2rtcProcess;
private Process? _cloudflaredProcess;
private Timer? _heartbeat;

public string TunnelUrl => $"https://{_tunnelHostname}";

public TunnelService(ApiClient api, string tunnelToken, string tunnelHostname, int port = 1984)
{
_api = api;
_port = port;
_dir = AppContext.BaseDirectory;
_tunnelToken = tunnelToken;
_tunnelHostname = tunnelHostname;
}

public async Task StartAsync(CancellationToken ct)
{
Log("Iniciando modulo Live View...");

if (string.IsNullOrWhiteSpace(_tunnelToken) || string.IsNullOrWhiteSpace(_tunnelHostname))
{
Log("Advertencia: TunnelToken o TunnelHostname vacios en config.json - Live View desactivado.");
return;
}

try
{
await EnsureGo2rtcAsync(ct);
await EnsureCloudflaredAsync(ct);
}
catch (Exception ex)
{
Log($"Advertencia: no se pudieron descargar las dependencias: {ex.Message}");
Log("Live View desactivado para esta sesion.");
return;
}

StartGo2rtc();
await Task.Delay(2500, ct);

var connected = await StartCloudflaredAsync(ct);

if (connected)
{
try
{
await _api.RegisterTunnelAsync(TunnelUrl);
Log($"Tunnel activo -> {TunnelUrl}");
}
catch (Exception ex)
{
Log($"Advertencia: no se pudo registrar tunnel: {ex.Message}");
}

_heartbeat = new Timer(async _ =>
{
try { await _api.RegisterTunnelAsync(TunnelUrl); }
catch { }
}, null, TimeSpan.FromMinutes(4), TimeSpan.FromMinutes(4));
}
else
{
Log("Advertencia: cloudflared no pudo conectar - Live View no disponible.");
}
}

private void StartGo2rtc()
{
var exe = Path.Combine(_dir, "go2rtc.exe");
if (!File.Exists(exe)) { Log("go2rtc.exe no encontrado"); return; }

var cfg = Path.Combine(_dir, "go2rtc.yaml");
if (!File.Exists(cfg))
File.WriteAllText(cfg, $"api:\n  listen: \":{_port}\"\nlog:\n  level: warn\n");

_go2rtcProcess = Process.Start(new ProcessStartInfo
{
FileName = exe,
Arguments = $"-config \"{cfg}\"",
UseShellExecute = false,
CreateNoWindow = true,
RedirectStandardOutput = true,
RedirectStandardError = true,
});

if (_go2rtcProcess is not null)
Log($"go2rtc iniciado (PID {_go2rtcProcess.Id}, puerto {_port})");
}

private async Task<bool> StartCloudflaredAsync(CancellationToken ct)
{
var exe = Path.Combine(_dir, "cloudflared.exe");
if (!File.Exists(exe)) { Log("cloudflared.exe no encontrado"); return false; }

var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

_cloudflaredProcess = new Process
{
StartInfo = new ProcessStartInfo
{
FileName = exe,
Arguments = $"tunnel --no-autoupdate run --token {_tunnelToken}",
UseShellExecute = false,
CreateNoWindow = true,
RedirectStandardOutput = true,
RedirectStandardError = true,
},
EnableRaisingEvents = true,
};

void OnOutput(object sender, DataReceivedEventArgs e)
{
if (e.Data is null) return;
if (e.Data.Contains("Registered tunnel connection", StringComparison.OrdinalIgnoreCase))
tcs.TrySetResult(true);
if (e.Data.Contains("error", StringComparison.OrdinalIgnoreCase))
Log($"[cloudflared] {e.Data}");
}

_cloudflaredProcess.OutputDataReceived += OnOutput;
_cloudflaredProcess.ErrorDataReceived += OnOutput;

_cloudflaredProcess.Start();
_cloudflaredProcess.BeginOutputReadLine();
_cloudflaredProcess.BeginErrorReadLine();

Log($"cloudflared iniciado (PID {_cloudflaredProcess.Id}) -> {_tunnelHostname}");

using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
timeoutCts.CancelAfter(TimeSpan.FromSeconds(20));
var timeoutTask = Task.Delay(Timeout.Infinite, timeoutCts.Token);

try
{
var completed = await Task.WhenAny(tcs.Task, timeoutTask);
return completed == tcs.Task && await tcs.Task;
}
catch (OperationCanceledException)
{
return _cloudflaredProcess is { HasExited: false };
}
}

private async Task EnsureGo2rtcAsync(CancellationToken ct)
{
var exe = Path.Combine(_dir, "go2rtc.exe");
if (File.Exists(exe)) return;

Log("Descargando go2rtc...");
using var http = new HttpClient();
var bytes = await http.GetByteArrayAsync(
"https://github.com/AlexxIT/go2rtc/releases/latest/download/go2rtc_win64.exe", ct);
await File.WriteAllBytesAsync(exe, bytes, ct);
}

private async Task EnsureCloudflaredAsync(CancellationToken ct)
{
var exe = Path.Combine(_dir, "cloudflared.exe");
if (File.Exists(exe)) return;

Log("Descargando cloudflared...");
using var http = new HttpClient();
var bytes = await http.GetByteArrayAsync(
"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe", ct);
await File.WriteAllBytesAsync(exe, bytes, ct);
}

public async ValueTask DisposeAsync()
{
_heartbeat?.Dispose();

try { await _api.UnregisterTunnelAsync(); } catch { }

foreach (var p in new[] { _cloudflaredProcess, _go2rtcProcess })
{
if (p is { HasExited: false })
{
try { p.Kill(entireProcessTree: true); } catch { }
}
}
}

private static void Log(string msg) =>
Console.WriteLine($"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] [Tunnel] {msg}");
}
