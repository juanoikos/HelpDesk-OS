# HelpDesk OS — Agente Dahua P2P

Agente C# que conecta DVRs Dahua via serial (P2P cloud) y busca grabaciones.

## Requisitos
- Windows 10/11 x64
- .NET 8 SDK (https://dotnet.microsoft.com/download)
- SmartPSS instalado (proporciona las DLLs de Dahua)

## Configuración

1. Compilar:
   ```
   dotnet build -c Release
   ```
   O abrir `DahuaAgent.csproj` en Visual Studio y compilar.

2. Ejecutar por primera vez — genera `config.json`:
   ```
   DahuaAgent.exe
   ```

3. Editar `config.json`:
   ```json
   {
     "HelpdeskUrl": "https://helpdesk-os-production.up.railway.app",
     "AgentToken": "TU_TOKEN_AQUI",
     "SdkDllPath": "C:\\Program Files\\SmartPSS",
     "PollIntervalSec": 10
   }
   ```
   - `AgentToken`: el token del agente en HelpDesk OS (Activos → Token del agente)
   - `SdkDllPath`: ruta donde están las DLLs de Dahua (carpeta de SmartPSS)

4. Ejecutar de nuevo — el agente copia las DLLs y empieza a hacer polling.

## Cómo funciona

1. El agente hace polling a HelpDesk OS cada 10 segundos
2. Cuando hay un trabajo de búsqueda pendiente (con serial), lo procesa
3. Conecta al DVR via P2P usando el serial + usuario + contraseña
4. Busca las grabaciones del rango de fecha/hora y canales especificados
5. Envía los resultados a HelpDesk OS
6. La página de grabaciones muestra los resultados automáticamente

## Flujo desde HelpDesk OS

```
Usuario hace clic en "🌐 Buscar remoto (P2P)"
    ↓
HelpDesk OS crea un DvrScanJob en la BD
    ↓
Este agente detecta el job en polling
    ↓
Conecta al DVR via serial (Dahua P2P cloud)
    ↓
Busca grabaciones con CLIENT_QueryRecordFile
    ↓
Postea resultados a /api/agent/dvr-scan
    ↓
La página actualiza automáticamente
```
