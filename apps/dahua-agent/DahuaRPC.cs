using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace DahuaAgent
{
    /// <summary>
    /// Cliente HTTP para la API RPC2 JSON de Dahua.
    /// Maneja autenticación MD5 challenge-response y búsqueda de grabaciones.
    /// </summary>
    public class DahuaRpcClient : IDisposable
    {
        private readonly HttpClient _http;
        private readonly string     _base;
        private string?             _session;

        public DahuaRpcClient(string ip, int port = 80)
        {
            _base = $"http://{ip}:{port}";
            _http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        }

        // ─── Autenticación ────────────────────────────────────────────────────

        public async Task<bool> LoginAsync(string username, string password)
        {
            // Paso 1: login inicial → obtener challenge
            var r1 = await RpcAsync("/RPC2_Login", new
            {
                method  = "global.login",
                id      = 1,
                session = "",
                @params = new { userName = username, password = "", clientType = "Web3.0", loginType = "Direct", authorityType = "Default" }
            });

            if (r1 == null) return false;

            var session = r1["session"]?.GetValue<string>() ?? "";
            var realm   = r1["params"]?["realm"]?.GetValue<string>() ?? "";
            var random  = r1["params"]?["random"]?.GetValue<string>() ?? "";

            // Paso 2: calcular hash MD5 y autenticar
            var h1   = Md5($"{username}:{realm}:{password}");
            var h2   = Md5($"{username}:{random}:{h1}");

            var r2 = await RpcAsync("/RPC2_Login", new
            {
                method  = "global.login",
                id      = 2,
                session,
                @params = new { userName = username, password = h2, clientType = "Web3.0", authorityType = "Default" }
            });

            if (r2 == null || r2["result"]?.GetValue<bool>() != true) return false;

            _session = r2["session"]?.GetValue<string>();
            return _session != null;
        }

        public async Task LogoutAsync()
        {
            if (_session == null) return;
            await RpcAsync("/RPC2", new { method = "global.logout", id = 99, session = _session, @params = new { } });
            _session = null;
        }

        // ─── Búsqueda de grabaciones ──────────────────────────────────────────

        public async Task<List<RecordingInfo>> FindRecordingsAsync(
            int channel, string startTime, string endTime)
        {
            var results = new List<RecordingInfo>();
            if (_session == null) return results;

            // 1. Crear instancia finder
            var fi = await RpcAsync("/RPC2", new
            {
                method  = "mediaFileFind.factory.instance",
                id      = 10, session = _session,
                @params = new { }
            });

            var finderId = fi?["result"];
            if (finderId == null) return results;

            // 2. Definir búsqueda
            await RpcAsync("/RPC2", new
            {
                method  = "mediaFileFind.findFile",
                id      = 11, session = _session,
                @object = finderId,
                @params = new
                {
                    channel   = channel,
                    startTime,
                    endTime,
                    dirs      = new[] { "/mnt/dvr/", "/mnt/sd/" },
                    types     = new[] { "dav", "mp4" },
                    events    = new[] { "General", "Alarm", "Motion" },
                    streamType = "Main"
                }
            });

            // 3. Obtener cantidad
            var cntResp = await RpcAsync("/RPC2", new
            {
                method  = "mediaFileFind.getCount",
                id      = 12, session = _session,
                @object = finderId,
                @params = new { }
            });

            int total = cntResp?["params"]?["count"]?.GetValue<int>() ?? 0;

            // 4. Traer archivos en lotes
            int fetched = 0;
            while (fetched < total)
            {
                var nextResp = await RpcAsync("/RPC2", new
                {
                    method  = "mediaFileFind.findNextFile",
                    id      = 13, session = _session,
                    @object = finderId,
                    @params = new { count = 100 }
                });

                var infos = nextResp?["params"]?["infos"]?.AsArray();
                if (infos == null || infos.Count == 0) break;

                foreach (var info in infos)
                {
                    if (info == null) continue;
                    results.Add(new RecordingInfo
                    {
                        Channel  = channel,
                        Start    = (info["StartTime"]?.GetValue<string>() ?? "").Replace("/", "-"),
                        End      = (info["EndTime"]?.GetValue<string>()   ?? "").Replace("/", "-"),
                        Size     = info["Length"]?.GetValue<long>() ?? 0,
                        FilePath = info["FilePath"]?.GetValue<string>() ?? "",
                    });
                }

                fetched += infos.Count;
                if (infos.Count < 100) break;
            }

            // 5. Cerrar finder
            await RpcAsync("/RPC2", new { method = "mediaFileFind.close",   id = 14, session = _session, @object = finderId, @params = new { } });
            await RpcAsync("/RPC2", new { method = "mediaFileFind.destroy", id = 15, session = _session, @object = finderId, @params = new { } });

            return results;
        }

        // ─── Helper HTTP ──────────────────────────────────────────────────────

        private async Task<JsonObject?> RpcAsync(string path, object body)
        {
            var json    = JsonSerializer.Serialize(body);
            var content = new StringContent(json, Encoding.UTF8, "application/json");
            var resp    = await _http.PostAsync(_base + path, content);
            if (!resp.IsSuccessStatusCode) return null;
            var text = await resp.Content.ReadAsStringAsync();
            return JsonNode.Parse(text) as JsonObject;
        }

        private static string Md5(string input)
        {
            var bytes = MD5.HashData(Encoding.UTF8.GetBytes(input));
            return Convert.ToHexString(bytes); // ya en mayúsculas
        }

        public void Dispose() => _http.Dispose();
    }

    public class RecordingInfo
    {
        public int    Channel  { get; set; }
        public string Start    { get; set; } = "";
        public string End      { get; set; } = "";
        public long   Size     { get; set; }
        public string FilePath { get; set; } = "";
    }
}
