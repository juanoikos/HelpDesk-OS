namespace DahuaAgent.Models;

public class AgentConfig
{
    public string ServerUrl { get; set; } = "https://helpdesk-os-production.up.railway.app";
    public string AgentToken { get; set; } = "PEGAR_AQUI_EL_TOKEN_DEL_AGENTE";
    public int PollIntervalSeconds { get; set; } = 10;

    // ── Live View (go2rtc + cloudflared tunnel) ──────────────────────────────
    // Activar en true para habilitar Live View desde HelpDesk OS.
    // Al activar, el agente descarga go2rtc.exe y cloudflared.exe (~40 MB total)
    // y crea un tunnel HTTPS autenticado para acceder a los DVRs en la red local.
    public bool EnableLiveView { get; set; } = false;
    public int LiveViewPort { get; set; } = 1984;

    // Token del Cloudflare Tunnel (Zero Trust -> Tunnels -> token de instalacion)
    public string TunnelToken { get; set; } = "PEGAR_AQUI_EL_TUNNEL_TOKEN";
    // Hostname publico ya enrutado a este tunnel en Cloudflare (ej. vms.helpdeskos.co)
    public string TunnelHostname { get; set; } = "vms.helpdeskos.co";
}
