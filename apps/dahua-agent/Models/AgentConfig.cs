namespace DahuaAgent.Models;

public class AgentConfig
{
    public string ServerUrl           { get; set; } = "https://helpdesk-os-production.up.railway.app";
    public string AgentToken          { get; set; } = "PEGAR_AQUI_EL_TOKEN_DEL_AGENTE";
    public int    PollIntervalSeconds { get; set; } = 10;

    // ── Live View (go2rtc + cloudflared tunnel) ──────────────────────────────
    // Activar en true para habilitar Live View desde HelpDesk OS.
    // Al activar, el agente descarga go2rtc.exe y cloudflared.exe (~40 MB total)
    // y crea un tunnel HTTPS para acceder a los DVRs en la red local.
    public bool EnableLiveView  { get; set; } = false;
    public int  LiveViewPort    { get; set; } = 1984;
}
