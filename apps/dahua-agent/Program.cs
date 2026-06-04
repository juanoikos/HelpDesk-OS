using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using DahuaAgent;

// ─── Config ───────────────────────────────────────────────────────────────────

var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
if (!File.Exists(configPath))
{
    var def = new AgentConfig
    {
        HelpdeskUrl     = "https://helpdesk-os-production.up.railway.app",
        AgentToken      = "PEGAR_AQUI_EL_TOKEN_DEL_AGENTE",
        PollIntervalSec = 10,
    };
    File.WriteAllText(configPath, JsonSerializer.Serialize(def, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine("✅ Archivo config.json creado.");
    Console.WriteLine($"   Edítalo con tu AgentToken y vuelve a ejecutar.");
    Console.WriteLine($"   Ruta: {configPath}");
    Console.ReadKey();
    return;
}

var config = JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(configPath))!;

if (config.AgentToken == "PEGAR_AQUI_EL_TOKEN_DEL_AGENTE")
{
    Console.WriteLine("❌ Configura el AgentToken en config.json primero.");
    Console.ReadKey();
    return;
}

// ─── Banner ───────────────────────────────────────────────────────────────────

Console.WriteLine();
Console.WriteLine("  ╔══════════════════════════════════════════════╗");
Console.WriteLine("  ║   HelpDesk OS — Agente Dahua P2P (sin SDK)  ║");
Console.WriteLine("  ╚══════════════════════════════════════════════╝");
Console.WriteLine($"  🔗 Servidor : {config.HelpdeskUrl}");
Console.WriteLine($"  ⏱  Polling  : cada {config.PollIntervalSec} segundos");
Console.WriteLine();

// ─── HTTP hacia HelpDesk OS ───────────────────────────────────────────────────

using var http = new HttpClient();
http.DefaultRequestHeaders.Authorization =
    new AuthenticationHeaderValue("Bearer", config.AgentToken);

Console.WriteLine("  Esperando trabajos de búsqueda...\n");

// ─── Bucle principal de polling ───────────────────────────────────────────────

while (true)
{
    try
    {
        var resp = await http.GetAsync($"{config.HelpdeskUrl}/api/agent/dvr-jobs");
        if (resp.IsSuccessStatusCode)
        {
            var json = await resp.Content.ReadAsStringAsync();
            var jobs = JsonSerializer.Deserialize<List<DvrJob>>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
                ?? new List<DvrJob>();

            foreach (var job in jobs)
                await ProcessJobAsync(job, http, config.HelpdeskUrl);
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"  ⚠️  Polling error: {ex.Message}");
    }

    await Task.Delay(config.PollIntervalSec * 1000);
}

// ─── Procesar un trabajo ──────────────────────────────────────────────────────

async Task ProcessJobAsync(DvrJob job, HttpClient http, string baseUrl)
{
    Console.WriteLine($"  📋 Trabajo: {job.Id}");
    Console.WriteLine($"     DVR   : {job.DvrName} | Serial: {job.Serial}");
    Console.WriteLine($"     Fecha : {job.Date}  {job.StartTime} → {job.EndTime}");

    string? dvrIp   = null;
    int     dvrPort = 80;

    // ── Paso 1: resolver IP via P2P ─────────────────────────────────────────
    Console.Write("  🌐 Resolviendo IP via P2P cloud Dahua...");
    try
    {
        var resolved = await DahuaP2P.ResolveAsync(job.Serial);
        if (resolved.HasValue)
        {
            dvrIp   = resolved.Value.ip;
            dvrPort = resolved.Value.port > 0 ? resolved.Value.port : 80;
            Console.WriteLine($" ✅ {dvrIp}:{dvrPort}");
        }
        else
        {
            Console.WriteLine(" ⚠️  No resuelto vía P2P, intentando IP local...");
            // Fallback a IP local si está configurada
            if (!string.IsNullOrEmpty(job.LocalIp))
            {
                dvrIp   = job.LocalIp;
                dvrPort = job.LocalPort > 0 ? job.LocalPort : 80;
                Console.WriteLine($"     Usando IP local: {dvrIp}:{dvrPort}");
            }
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($" ❌ {ex.Message}");
    }

    if (dvrIp == null)
    {
        await SendErrorAsync(http, baseUrl, job.Id, "No se pudo resolver la IP del DVR (P2P fallido y sin IP local)");
        return;
    }

    // ── Paso 2: conectar y autenticar via RPC2 ──────────────────────────────
    Console.Write($"  🔌 Conectando a {dvrIp}:{dvrPort}...");
    using var rpc = new DahuaRpcClient(dvrIp, dvrPort);

    bool loggedIn = await rpc.LoginAsync(job.Username, job.Password);
    if (!loggedIn)
    {
        Console.WriteLine(" ❌ Login fallido");
        await SendErrorAsync(http, baseUrl, job.Id, $"Login fallido en {dvrIp}:{dvrPort}");
        return;
    }
    Console.WriteLine(" ✅ Autenticado");

    // ── Paso 3: buscar grabaciones por canal ────────────────────────────────
    var allRecordings = new List<RecordingResult>();
    var channels = job.Channels.Length > 0
        ? job.Channels
        : new[] { 1, 2, 3, 4, 5, 6, 7, 8 };

    string start = $"{job.Date} {job.StartTime}:00";
    string end   = $"{job.Date} {job.EndTime}:59";

    foreach (var ch in channels)
    {
        Console.Write($"     Canal {ch}...");
        try
        {
            var recs = await rpc.FindRecordingsAsync(ch, start, end);
            Console.WriteLine($" {recs.Count} grabaciones");
            foreach (var r in recs)
                allRecordings.Add(new RecordingResult
                {
                    Channel  = r.Channel,
                    Start    = r.Start,
                    End      = r.End,
                    Size     = r.Size,
                    FilePath = r.FilePath,
                });
        }
        catch (Exception ex)
        {
            Console.WriteLine($" Error: {ex.Message}");
        }
    }

    await rpc.LogoutAsync();

    // ── Paso 4: enviar resultados ───────────────────────────────────────────
    Console.WriteLine($"\n  📤 Enviando {allRecordings.Count} grabaciones...");
    var payload = JsonSerializer.Serialize(new { jobId = job.Id, recordings = allRecordings });
    var content = new StringContent(payload, Encoding.UTF8, "application/json");
    var postResp = await http.PostAsync($"{baseUrl}/api/agent/dvr-scan", content);

    if (postResp.IsSuccessStatusCode)
        Console.WriteLine("  ✅ Enviado correctamente\n");
    else
        Console.WriteLine($"  ❌ Error al enviar: {postResp.StatusCode}\n");
}

async Task SendErrorAsync(HttpClient http, string baseUrl, string jobId, string error)
{
    Console.WriteLine($"  ❌ {error}");
    var payload = JsonSerializer.Serialize(new { jobId, error });
    var content = new StringContent(payload, Encoding.UTF8, "application/json");
    await http.PostAsync($"{baseUrl}/api/agent/dvr-scan", content);
    Console.WriteLine();
}

// ─── Modelos ──────────────────────────────────────────────────────────────────

class AgentConfig
{
    public string HelpdeskUrl      { get; set; } = "";
    public string AgentToken       { get; set; } = "";
    public int    PollIntervalSec  { get; set; } = 10;
}

class DvrJob
{
    public string   Id        { get; set; } = "";
    public string   DvrName   { get; set; } = "";
    public string   Serial    { get; set; } = "";
    public string   Username  { get; set; } = "";
    public string   Password  { get; set; } = "";
    public string   LocalIp   { get; set; } = "";
    public int      LocalPort { get; set; } = 80;
    public int[]    Channels  { get; set; } = Array.Empty<int>();
    public string   Date      { get; set; } = "";
    public string   StartTime { get; set; } = "00:00";
    public string   EndTime   { get; set; } = "23:59";
}

class RecordingResult
{
    public int    Channel  { get; set; }
    public string Start    { get; set; } = "";
    public string End      { get; set; } = "";
    public long   Size     { get; set; }
    public string FilePath { get; set; } = "";
}
