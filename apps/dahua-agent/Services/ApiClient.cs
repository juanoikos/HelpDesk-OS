using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using DahuaAgent.Models;

namespace DahuaAgent.Services;

public class ApiClient
{
    private readonly HttpClient _http;
    private readonly string     _baseUrl;
    private static readonly JsonSerializerOptions _json = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy        = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition      = JsonIgnoreCondition.WhenWritingNull,
    };

    public ApiClient(string baseUrl, string token)
    {
        _baseUrl = baseUrl.TrimEnd('/');
        _http    = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        _http.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", token);
    }

    /// <summary>Obtiene los trabajos pendientes del servidor.</summary>
    public async Task<List<DvrJob>> GetPendingJobsAsync()
    {
        var resp = await _http.GetAsync($"{_baseUrl}/api/agent/dvr-jobs");
        if (!resp.IsSuccessStatusCode) return new List<DvrJob>();

        var json = await resp.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<List<DvrJob>>(json, _json) ?? new List<DvrJob>();
    }

    /// <summary>Envía el resultado de un trabajo al servidor.</summary>
    public async Task<bool> PostResultAsync(JobResult result)
    {
        var payload = JsonSerializer.Serialize(new
        {
            jobId      = result.JobId,
            recordings = result.Recordings,
            error      = result.ErrorMessage,
        }, _json);

        var content  = new StringContent(payload, Encoding.UTF8, "application/json");
        var resp     = await _http.PostAsync($"{_baseUrl}/api/agent/dvr-scan", content);
        return resp.IsSuccessStatusCode;
    }
}
