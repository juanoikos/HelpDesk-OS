using System;
using System.Collections.Generic;
using System.IO;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using DahuaAgent;

// ─── Configuración ────────────────────────────────────────────────────────────

var configPath = Path.Combine(AppContext.BaseDirectory, "config.json");
if (!File.Exists(configPath))
{
    var defaultConfig = new AgentConfig
    {
        HelpdeskUrl   = "https://helpdesk-os-production.up.railway.app",
        AgentToken    = "PEGAR_AQUI_EL_TOKEN_DEL_AGENTE",
        SdkDllPath    = @"C:\Program Files\SmartPSS",
        PollIntervalSec = 10,
    };
    File.WriteAllText(configPath, JsonSerializer.Serialize(defaultConfig, new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine("✅ Archivo config.json creado. Edítalo con tu token y ruta de SmartPSS.");
    Console.WriteLine($"   Ruta: {configPath}");
    Console.ReadKey();
    return;
}

var config = JsonSerializer.Deserialize<AgentConfig>(File.ReadAllText(configPath))!;

// ─── Copiar DLLs del SDK al directorio del exe ────────────────────────────────

var requiredDlls = new[] { "dhnetsdk.dll", "dhconfigsdk.dll", "StreamMedia.dll", "avnetsdk.dll", "SuperRender.dll" };
var exeDir = AppContext.BaseDirectory;

foreach (var dll in requiredDlls)
{
    var src  = Path.Combine(config.SdkDllPath, dll);
    var dest = Path.Combine(exeDir, dll);
    if (File.Exists(src) && !File.Exists(dest))
    {
        File.Copy(src, dest);
        Console.WriteLine($"  📦 Copiada: {dll}");
    }
}

// ─── Inicializar SDK ──────────────────────────────────────────────────────────

Console.WriteLine();
Console.WriteLine("  ╔══════════════════════════════════════╗");
Console.WriteLine("  ║   HelpDesk OS — Agente Dahua P2P    ║");
Console.WriteLine("  ╚══════════════════════════════════════╝");
Console.WriteLine();

DahuaSDKNative.fDisConnect disconnectCallback = (id, ip, port, user) =>
    Console.WriteLine($"  [!] DVR desconectado: {ip}");

if (!DahuaSDKNative.CLIENT_Init(disconnectCallback, IntPtr.Zero))
{
    Console.WriteLine("  ❌ No se pudo inicializar el SDK de Dahua.");
    Console.WriteLine($"     Verifica que 'dhnetsdk.dll' esté en: {config.SdkDllPath}");
    Console.ReadKey();
    return;
}

DahuaSDKNative.CLIENT_SetConnectTime(5000, 3);
Console.WriteLine("  ✅ SDK Dahua inicializado");
Console.WriteLine($"  🔗 Servidor: {config.HelpdeskUrl}");
Console.WriteLine($"  ⏱  Polling cada {config.PollIntervalSec} segundos");
Console.WriteLine();

// ─── Bucle principal ──────────────────────────────────────────────────────────

using var http = new HttpClient();
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", config.AgentToken);

Console.WriteLine("  Esperando trabajos de búsqueda...\n");

while (true)
{
    try
    {
        // Obtener trabajos pendientes
        var resp = await http.GetAsync($"{config.HelpdeskUrl}/api/agent/dvr-jobs");
        if (resp.IsSuccessStatusCode)
        {
            var json = await resp.Content.ReadAsStringAsync();
            var jobs = JsonSerializer.Deserialize<List<DvrJob>>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new();

            foreach (var job in jobs)
            {
                Console.WriteLine($"  📋 Trabajo: {job.Id} | DVR: {job.DvrName} | Serial: {job.Serial} | {job.Date} {job.StartTime}-{job.EndTime}");
                await ProcessJob(job, http, config.HelpdeskUrl);
            }
        }
    }
    catch (Exception ex)
    {
        Console.WriteLine($"  ⚠️  Error de polling: {ex.Message}");
    }

    await Task.Delay(config.PollIntervalSec * 1000);
}

// ─── Procesar un trabajo ──────────────────────────────────────────────────────

async Task ProcessJob(DvrJob job, HttpClient http, string baseUrl)
{
    IntPtr loginHandle = IntPtr.Zero;

    try
    {
        Console.Write($"  🔌 Conectando via P2P al DVR '{job.DvrName}' (serial: {job.Serial})...");

        var inParam = new NET_IN_LOGINBY_SERIAL_NO
        {
            dwSize        = (uint)Marshal.SizeOf<NET_IN_LOGINBY_SERIAL_NO>(),
            szDevSerialNo = job.Serial,
            szUserName    = job.Username,
            szPassword    = job.Password,
            nPort         = 37777,
            byReserved    = new byte[128],
        };
        var outParam = new NET_OUT_LOGINBY_SERIAL_NO
        {
            dwSize     = (uint)Marshal.SizeOf<NET_OUT_LOGINBY_SERIAL_NO>(),
            byReserved = new byte[128],
        };

        loginHandle = DahuaSDKNative.CLIENT_LoginBySerialNo(ref inParam, ref outParam, 10000);

        if (loginHandle == IntPtr.Zero)
        {
            var errCode = DahuaSDKNative.CLIENT_GetLastError();
            throw new Exception($"Login fallido (error: 0x{errCode:X8})");
        }

        Console.WriteLine(" ✅ Conectado");

        var recordings = new List<RecordingResult>();
        var channels   = job.Channels.Length > 0 ? job.Channels : GetAllChannels(outParam.stuDeviceInfo.nChanNum);

        foreach (var ch in channels)
        {
            Console.Write($"     Canal {ch}...");

            var start = ParseDate(job.Date, job.StartTime);
            var end   = ParseDate(job.Date, job.EndTime);

            const int MAX_FILES = 1000;
            int fileSize  = Marshal.SizeOf<NET_RECORDFILE_INFO>();
            IntPtr buffer = Marshal.AllocHGlobal(fileSize * MAX_FILES);
            int fileCount = 0;

            try
            {
                bool ok = DahuaSDKNative.CLIENT_QueryRecordFile(
                    loginHandle,
                    ch - 1,   // 0-based
                    0,        // 0 = all types
                    ref start,
                    ref end,
                    null,
                    buffer,
                    MAX_FILES,
                    ref fileCount,
                    10000,
                    false);

                Console.WriteLine(ok ? $" {fileCount} grabaciones" : " sin resultados");

                for (int i = 0; i < fileCount; i++)
                {
                    IntPtr ptr  = IntPtr.Add(buffer, i * fileSize);
                    var    info = Marshal.PtrToStructure<NET_RECORDFILE_INFO>(ptr);

                    recordings.Add(new RecordingResult
                    {
                        Channel  = ch,
                        Start    = FormatTime(info.starttime),
                        End      = FormatTime(info.endtime),
                        Size     = (long)info.size,
                        FilePath = info.filename,
                    });
                }
            }
            finally
            {
                Marshal.FreeHGlobal(buffer);
            }
        }

        // Enviar resultados
        Console.WriteLine($"\n  📤 Enviando {recordings.Count} grabaciones a HelpDesk OS...");
        var payload = JsonSerializer.Serialize(new { jobId = job.Id, recordings });
        var content = new StringContent(payload, Encoding.UTF8, "application/json");
        var postResp = await http.PostAsync($"{baseUrl}/api/agent/dvr-scan", content);
        Console.WriteLine(postResp.IsSuccessStatusCode
            ? $"  ✅ Enviado correctamente\n"
            : $"  ❌ Error al enviar: {postResp.StatusCode}\n");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"\n  ❌ Error: {ex.Message}");
        var errPayload = JsonSerializer.Serialize(new { jobId = job.Id, error = ex.Message });
        var errContent = new StringContent(errPayload, Encoding.UTF8, "application/json");
        await http.PostAsync($"{baseUrl}/api/agent/dvr-scan", errContent);
    }
    finally
    {
        if (loginHandle != IntPtr.Zero)
            DahuaSDKNative.CLIENT_Logout(loginHandle);
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

static int[] GetAllChannels(int count) =>
    count > 0 ? System.Linq.Enumerable.Range(1, count).ToArray() : new[] { 1, 2, 3, 4, 5, 6, 7, 8 };

static NET_TIME ParseDate(string date, string time)
{
    var d = date.Split('-');
    var t = time.Split(':');
    return new NET_TIME(int.Parse(d[0]), int.Parse(d[1]), int.Parse(d[2]),
                        int.Parse(t[0]), t.Length > 1 ? int.Parse(t[1]) : 0, 0);
}

static string FormatTime(NET_TIME t) =>
    $"{t.dwYear:D4}-{t.dwMonth:D2}-{t.dwDay:D2} {t.dwHour:D2}:{t.dwMinute:D2}:{t.dwSecond:D2}";

// ─── Modelos ──────────────────────────────────────────────────────────────────

class AgentConfig
{
    public string HelpdeskUrl      { get; set; } = "";
    public string AgentToken       { get; set; } = "";
    public string SdkDllPath       { get; set; } = @"C:\Program Files\SmartPSS";
    public int    PollIntervalSec  { get; set; } = 10;
}

class DvrJob
{
    public string   Id        { get; set; } = "";
    public string   DvrName   { get; set; } = "";
    public string   Serial    { get; set; } = "";
    public string   Username  { get; set; } = "";
    public string   Password  { get; set; } = "";
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
