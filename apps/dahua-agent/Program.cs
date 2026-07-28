using System.Text.Json;
using DahuaAgent.Models;
using DahuaAgent.Services;

// ─── Graceful shutdown con Ctrl+C ──────────────────────────────────────────────
var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    Console.WriteLine("\n[SHUTDOWN] Cerrando agente...");
    cts.Cancel();
};

// ─── Configuración ──────────────────────────────────────────────
var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");

if (!File.Exists(configPath))
{
    var def = new AgentConfig();
    File.WriteAllText(configPath, JsonSerializer.Serialize(def,
                                                           new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine("✅ config.json generado. Edítalo con tu ServerUrl y AgentToken.");
    Console.WriteLine($"   Ruta: {configPath}");
    Console.ReadKey();
    return;
}

var config = JsonSerializer.Deserialize<AgentConfig>(
    File.ReadAllText(configPath),
    new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

if (config.AgentToken == "PEGAR_AQUI_EL_TOKEN_DEL_AGENTE")
{
    Console.WriteLine("❌ Edita config.json y pon tu AgentToken antes de continuar.");
    Console.ReadKey();
    return;
}

// ─── Banner ────────────────────────────────────────────────────
Console.WriteLine();
Console.WriteLine("  ╔═══════════════════════════════╗");
Console.WriteLine("  ║      HelpDesk OS — Agente Dahua (Dahua.Api)      ║");
Console.WriteLine("  ╚═══════════════════════════════╝");
Console.WriteLine($"  🔗 Servidor    : {config.ServerUrl}");
Console.WriteLine($"  ⏱ Polling     : cada {config.PollIntervalSeconds}s");
Console.WriteLine($"  📺 Live View   : {(config.EnableLiveView ? "ACTIVADO" : "desactivado")}");
Console.WriteLine($"  📅 {DateTime.Now:yyyy-MM-dd HH:mm:ss}");
Console.WriteLine();

// ─── Inicializar SDK Dahua ──────────────────────────────────────
DvrService.Init();

// ─── Clientes ────────────────────────────────────────────────────
var api = new ApiClient(config.ServerUrl, config.AgentToken);

// ─── Tunnel Live View (opcional) ─────────────────────────────────────
TunnelService? tunnel = null;
if (config.EnableLiveView)
{
    tunnel = new TunnelService(api, config.TunnelToken, config.TunnelHostname, config.LiveViewPort);
    await tunnel.StartAsync(cts.Token);
}

Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] Esperando trabajos...\n");

// ─── Bucle principal ────────────────────────────────────────────
int backoff = config.PollIntervalSeconds;

while (!cts.Token.IsCancellationRequested)
{
    try
    {
        var jobs = await api.GetPendingJobsAsync();

        if (jobs.Count > 0)
        {
            backoff = config.PollIntervalSeconds; // reset backoff
            Console.WriteLine($"[{DateTime.Now:HH:mm:ss}] {jobs.Count} trabajo(s) pendiente(s)");

            foreach (var job in jobs)
            {
                Console.WriteLine($"\n[{DateTime.Now:HH:mm:ss}] ── Procesando: {job.JobId}");
                Console.WriteLine($"  DVR    : {job.DvrName} ({job.DvrIp}:{job.DvrPort})");
                Console.WriteLine($"  Rango  : {job.StartDate} → {job.EndDate}");
                Console.WriteLine($"  Acción : {job.Action.ToUpper()}");

                JobResult result;
                if (job.Action == "search")
                    result = await DvrService.SearchRecordingsAsync(job);
                else
                {
                    result = new JobResult
                    {
                        JobId = job.JobId,
                        Success = false,
                        ErrorMessage = $"Acción '{job.Action}' no implementada aún.",
                    };
                }

                Console.Write($"[{DateTime.Now:HH:mm:ss}] Enviando resultado... ");
                bool sent = await api.PostResultAsync(result);
                Console.WriteLine(sent ? "✅ OK" : "❌ Error al enviar");
            }
        }
        else
        {
            Console.Write($"\r[{DateTime.Now:HH:mm:ss}] Sin trabajos. Siguiente poll en {backoff}s... ");
        }

        await Task.Delay(backoff * 1000, cts.Token);
    }
    catch (OperationCanceledException)
    {
        break;
    }
    catch (Exception ex)
    {
        Console.WriteLine($"\n[{DateTime.Now:HH:mm:ss}] ⚠️ Error: {ex.Message}");
        // Backoff exponencial hasta 60s
        backoff = Math.Min(backoff * 2, 60);
        Console.WriteLine($"   Reintentando en {backoff}s...");
        try { await Task.Delay(backoff * 1000, cts.Token); } catch { break; }
    }
}

// ─── Cleanup ────────────────────────────────────────────────────
if (tunnel is not null) await tunnel.DisposeAsync();
DvrService.Cleanup();
Console.WriteLine($"\n[{DateTime.Now:HH:mm:ss}] Agente detenido. ¡Hasta luego!");
