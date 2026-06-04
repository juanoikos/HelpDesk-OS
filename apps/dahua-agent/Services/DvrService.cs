using Dahua.Api;
using DahuaAgent.Models;

namespace DahuaAgent.Services;

public static class DvrService
{
    private static bool _initialized = false;

    public static void Init()
    {
        if (_initialized) return;
        DahuaApi.Init();
        _initialized = true;
        Log("SDK Dahua inicializado (Dahua.Api v1.0.1)");
    }

    public static void Cleanup()
    {
        if (!_initialized) return;
        DahuaApi.Cleanup();
        _initialized = false;
    }

    /// <summary>
    /// Busca grabaciones en un DVR para los canales y rango de fechas especificados.
    /// </summary>
    public static async Task<JobResult> SearchRecordingsAsync(DvrJob job)
    {
        var result = new JobResult { JobId = job.JobId };

        DahuaApi? session = null;
        try
        {
            Log($"Conectando a {job.DvrIp}:{job.DvrPort}...");
            session = DahuaApi.Login(job.DvrIp, job.DvrPort, job.DvrUser, job.DvrPass);
            Log($"✅ Autenticado en {job.DvrName}");

            var start    = DateTime.Parse(job.StartDate);
            var end      = DateTime.Parse(job.EndDate);
            var channels = job.Channels.Length > 0
                ? job.Channels
                : session.AllChannels.Select(c => c.Id).ToArray();

            var recordings = new List<RecordingItem>();

            foreach (var ch in channels)
            {
                Log($"  Canal {ch}...", newLine: false);
                try
                {
                    var files = session.VideoService.FindFiles(start, end, ch);
                    Console.WriteLine($" {files.Count} grabaciones");

                    foreach (var f in files)
                    {
                        // f.Duration es int (segundos) en Dahua.Api v1.0.1
                        var dur = TimeSpan.FromSeconds(Convert.ToDouble(f.Duration));

                        recordings.Add(new RecordingItem
                        {
                            Channel  = ch,
                            Start    = f.Date.ToString("yyyy-MM-dd HH:mm:ss"),
                            End      = f.Date.Add(dur).ToString("yyyy-MM-dd HH:mm:ss"),
                            Size     = 0,
                            FilePath = f.Name,
                            Duration = dur.ToString(@"hh\:mm\:ss"),
                        });
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($" Error: {ex.Message}");
                }
            }

            result.Success    = true;
            result.Recordings = recordings.ToArray();
            Log($"Total: {recordings.Count} grabaciones encontradas");
        }
        catch (Exception ex)
        {
            result.Success      = false;
            result.ErrorMessage = ex.Message;
            Log($"❌ Error: {ex.Message}");
        }
        finally
        {
            try { session?.Logout(); } catch { }
        }

        return await Task.FromResult(result);
    }

    private static void Log(string msg, bool newLine = true)
    {
        var prefix = $"[{DateTime.Now:yyyy-MM-dd HH:mm:ss}] ";
        if (newLine)
            Console.WriteLine(prefix + msg);
        else
            Console.Write(prefix + msg);
    }
}
