namespace DahuaAgent.Models;

public class JobResult
{
    public string          JobId        { get; set; } = "";
    public bool            Success      { get; set; }
    public RecordingItem[] Recordings   { get; set; } = Array.Empty<RecordingItem>();
    public string?         ErrorMessage { get; set; }
}

public class RecordingItem
{
    public int    Channel  { get; set; }
    public string Start    { get; set; } = "";
    public string End      { get; set; } = "";
    public long   Size     { get; set; }
    public string FilePath { get; set; } = "";
    public string Duration { get; set; } = "";
}
