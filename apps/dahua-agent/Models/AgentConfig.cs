namespace DahuaAgent.Models;

public class AgentConfig
{
    public string ServerUrl           { get; set; } = "https://helpdesk-os-production.up.railway.app";
    public string AgentToken          { get; set; } = "PEGAR_AQUI_EL_TOKEN_DEL_AGENTE";
    public int    PollIntervalSeconds { get; set; } = 10;
}
