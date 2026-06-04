# HelpDesk OS — Agente Dahua

Agente Windows que conecta DVRs Dahua localmente y busca grabaciones.
Usa el paquete NuGet **`Dahua.Api`** — las DLLs se descargan automáticamente, sin instalar nada.

## Requisitos
- Windows 10/11 x64
- .NET 8 Runtime: https://dotnet.microsoft.com/download/dotnet/8.0

## Instalación y configuración

### 1. Compilar
```bash
cd apps/dahua-agent
dotnet restore          # descarga Dahua.Api + DLLs nativas automáticamente
dotnet build -c Release
```

O generar `.exe` standalone:
```bash
dotnet publish -c Release -r win-x64 --self-contained true
# Ejecutable: bin/Release/net8.0/win-x64/publish/DahuaAgent.exe
```

### 2. Primera ejecución — genera config.json
```bash
DahuaAgent.exe
```

### 3. Editar config.json
```json
{
  "ServerUrl": "https://helpdesk-os-production.up.railway.app",
  "AgentToken": "TU_TOKEN_AQUI",
  "PollIntervalSeconds": 10
}
```
- **AgentToken**: HelpDesk OS → Activos → Token del agente

### 4. Ejecutar
```bash
DahuaAgent.exe
```

## Cómo funciona

1. Polling cada 10s a HelpDesk OS buscando trabajos pendientes
2. Cuando hay un trabajo:
   - Conecta al DVR via `Dahua.Api.Login(ip, 37777, user, pass)`
   - Busca grabaciones por canal y rango de fechas
   - Envía resultados a HelpDesk OS
3. La página de grabaciones muestra los resultados automáticamente

## Flujo desde HelpDesk OS

```
Clic en "🏠 Buscar local" → crea DvrScanJob
       ↓
DahuaAgent.exe detecta el job (polling)
       ↓
Dahua.Api.Login → FindFiles → resultados
       ↓
POST /api/agent/dvr-scan → HelpDesk OS
       ↓
La página actualiza automáticamente
```
