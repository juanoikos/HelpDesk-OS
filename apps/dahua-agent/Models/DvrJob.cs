namespace DahuaAgent.Models;

public class DvrJob
{
    public string   JobId     { get; set; } = "";
    public string   DvrName   { get; set; } = "";
    public string   DvrIp     { get; set; } = "";
    public int      DvrPort   { get; set; } = 37777;
    public string   DvrUser   { get; set; } = "admin";
    public string   DvrPass   { get; set; } = "";
    public int[]    Channels  { get; set; } = Array.Empty<int>();
    public string   StartDate { get; set; } = "";   // "YYYY-MM-DD HH:MM:SS"
    public string   EndDate   { get; set; } = "";
    public string   Action    { get; set; } = "search"; // "search" | "download"
}
