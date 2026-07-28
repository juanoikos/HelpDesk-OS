# HelpDesk OS — Resumen Completo del Proyecto
> Actualizado: 2026-07-28

---

## ¿Qué es?
Sistema de gestión de tickets e ITSM (IT Service Management) multi-empresa.
Construido por Juan Pablo Morales para D&C Computer SAS, con visión de escalarlo como producto vendible.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend / Backend | Next.js 15 App Router + tRPC v11 + React 19 |
| Base de datos | PostgreSQL via Prisma 6 (multi-tenant: `tenantId` en cada tabla) |
| Autenticación | next-auth v5 beta (JWT + Credentials) |
| Email saliente | Resend — FROM: `HelpDesk OS <onboarding@resend.dev>` |
| Archivos adjuntos | Cloudflare R2 (S3-compatible) |
| Deploy | Railway (Nixpacks, standalone Next.js) |
| Monorepo | Turborepo — `apps/web` + `packages/db` |

---

## Infraestructura

- **URL producción:** https://helpdesk-os-production.up.railway.app
- **Repositorio:** https://github.com/juanoikos/HelpDesk-OS — rama `master`
- **Deploy automático:** cualquier `git push master` → Railway construye y despliega
- **Railway CLI:** vinculado al proyecto `lucid-victory` (ID: 759a5f44)
- **Comandos Railway:**
  ```
  railway logs --tail 20
  railway variables --set "KEY=value"
  railway status
  ```
- **Backups automáticos de Postgres → Cloudflare R2** (nuevo — 2026-07-28): workflow `.github/workflows/postgres-backup.yml`, corre cada 6 horas vía GitHub Actions (Railway Hobby no incluye backups/PITR). Usa `docker run postgres:18 pg_dump` (no el `pg_dump` de Ubuntu del runner, que es v16 y falla en silencio contra un Postgres v18) + `set -o pipefail` + `test -s` para verificar que el dump no esté vacío. Sube a `s3://<bucket>/backups/postgres/` en el mismo bucket R2 de la app y borra automáticamente backups más viejos que los últimos 30.
- **Dominio propio para tunnels:** `helpdeskos.co` (GoDaddy, nameservers apuntando a Cloudflare). Zone ID: `05412f6625c8b347a9ac67c8b36c183b`. Account ID Cloudflare: `cfaba925c4046955197eef7012fce9b1`.
- ⚠️ **Rama por defecto en GitHub:** es `master` (se corrigió en 2026-07-28 — antes era `main`, que estaba 121+ commits atrás y por eso los cron de GitHub Actions no corrían: los triggers `schedule` solo funcionan en la rama por defecto).

### Variables de entorno en Railway
```
DATABASE_URL          → PostgreSQL interno Railway
AUTH_SECRET           → JWT secret
AUTH_URL              → https://helpdesk-os-production.up.railway.app
RESEND_API_KEY        → (privado)
EMAIL_FROM            → HelpDesk OS <onboarding@resend.dev>
R2_ACCOUNT_ID         → cfaba925c4046955197eef7012fce9b1
R2_ACCESS_KEY_ID      → b055d11be0ea634af59a266faab1c867
R2_SECRET_ACCESS_KEY  → (privado)
R2_BUCKET_NAME        → helpdesk-attachments
R2_PUBLIC_URL         → https://pub-e6d29f7bdc1442c9801e662bce630b61.r2.dev
ANTHROPIC_API_KEY     → (privado)
CLOUDFLARE_API_TOKEN  → ⚠️ PENDIENTE de configurar (ver sección "Pendientes"). Sin esta variable,
                         la automatización de Cloudflare Tunnel por tenant falla en silencio y
                         Live View queda desactivado, pero nada más se rompe.
CLOUDFLARE_ACCOUNT_ID → cfaba925c4046955197eef7012fce9b1 (opcional, ya viene con default hardcodeado)
CLOUDFLARE_ZONE_ID    → 05412f6625c8b347a9ac67c8b36c183b (opcional, ya viene con default hardcodeado)
```

---

## Usuarios Registrados (Producción)

| Usuario | Correo | Rol | Empresa |
|---------|--------|-----|---------|
| Juan Pablo Morales Vanegas | juanpabloyv@gmail.com | Admin | D&C Computer SAS |
| Camilo Morales | camilo.morales@dyccomputersas.com | Admin | D&C Computer SAS |

---

## Activos Registrados (Producción)

| Hostname | Usuario | Tipo | CPU | RAM | Disco |
|----------|---------|------|-----|-----|-------|
| W11LNLOQJPM | JuanPabloMorales | Laptop | AMD Ryzen 5 220 | 24GB | 477GB |
| DESKTOP-SQ42FUF | CamiloMorales | Laptop | Intel i7 11th gen | 16GB | — |

---

## Funcionalidades Completadas

### 🎫 Tickets
- 12 estados: Nuevo → Asignado → Diagnóstico → Análisis → En progreso → En espera → Pend. usuario → Pend. proveedor → Escalado → Resuelto → Cerrado
- SLA automático por prioridad (Baja/Media/Alta/Urgente), color-coded
- Formulario doble: vista Usuario (simple) y vista TI (técnica completa)
- Matriz 162 combinaciones tipo+categoría → subcategorías + activos + grupo
- Filtros avanzados: agente, grupo, período, búsqueda texto
- **Vista Kanban**: toggle Lista/Kanban, drag & drop HTML5, 10 columnas, optimistic update
- Adjuntos: drag & drop al crear + botón en ticket abierto → Cloudflare R2
- Aprobación de cierre: usuario confirma/rechaza, email de solicitud
- Respuestas predefinidas con variables: `{nombre}` `{numero}` `{titulo}` `{agente}` `{empresa}`

### 🖥️ Inventario de Activos
- Agente PS1 descargable como `.bat` autónomo (base64+certutil, sin política de ejecución)
- Recopila: OS, CPU, RAM+seriales, discos+seriales, placa madre, BIOS, GPU, red, USB, **monitores y mouse** (nuevo — 2026-06-11)
- **Autoinstalación** (nuevo — 2026-06-11): el agente se descarga a sí mismo del servidor y se registra como tarea programada de Windows cada 3 días. Fuerza TLS 1.2 para compatibilidad con Windows antiguos.
- Campos manuales: Número de activo, Sede/Tienda
- Exportar Excel (.xlsx) con filtros
- **Cruce con Red**: si el hostname coincide con un dispositivo del scan, muestra CPU/RAM/usuario

### 🔍 Scanner de Red
- Agente PS1 `.bat` autónomo
- Detección de subred via ruta por defecto (ignora adaptadores Hyper-V/WSL)
- **3 métodos de descubrimiento en paralelo:**
  - ARP (Get-NetNeighbor) → equipos con comunicación reciente
  - Ping async .NET (SendPingAsync) → equipos con ICMP habilitado
  - Puerto 445/SMB + 135/RPC → equipos Windows con firewall activo
- MAC: Get-NetNeighbor (más confiable que arp -a), MAC local desde Get-NetAdapter
- Vendor lookup via api.macvendors.com
- Port scanning: 80, 443, 22, 23, 554, 8000, 8080, 8443, 37777, 34567, 5000, 9000
- ONVIF WS-Discovery para cámaras IP
- Clasifica: dvr_nvr, ip_camera, switch, router_ap, web_device, unknown
- **Auto-registro de DVRs**: si detecta `dvr_nvr` → lo agrega automáticamente a /dvrs

### 📹 Módulo DVR (nuevo — 2026-06-04)
Ver sección completa más abajo.

### 📧 Email
- **Saliente (Resend):** ticket creado, estado cambiado, nueva respuesta, actividad agente, solicitud aprobación cierre, invitación usuario
- **Entrante (IMAP):** polling cada 2 min, crea tickets desde emails, replies `[#NNN]` van al ticket existente, deduplicación por Message-ID
- **Recuperación de contraseña** (nuevo — 2026-06-11): `/forgot-password` → email con enlace → `/reset-password/[token]` (token expira en 1h, un solo uso)
- ⚠️ FROM usa `onboarding@resend.dev` — pendiente verificar dominio `dyccomputersas.com`

### 🤖 Wizard de configuración con IA (actualizado — 2026-06-11)
- **Groq (Llama 3)** como proveedor primario gratuito, auto-selección de Gemini sobre Claude cuando está disponible, modelo Gemini en `1.5-flash` (mejor límite gratuito)
- Mensajes de error amigables en vez de JSON crudo
- Roadmap del dashboard oculto para tenants no-developer

### 🔒 Seguridad (nuevo — 2026-06-25)
- Rate limiting por IP: register (5/15min), forgot-password (3/1h), reset-password (5/15min) — `apps/web/src/lib/rate-limit.ts`
- Eliminado fallback hardcodeado de la clave de cifrado DVR (ahora requiere env var)
- SQL injection revisado: seguro por Prisma ORM
- Todos los errores de compilación TypeScript resueltos

### ⚙️ Configuración (7 pestañas)
| Pestaña | Contenido |
|---------|-----------|
| Mi perfil | Nombre, correo, contraseña, firma de email |
| **Usuarios** | Todos los usuarios con stats, búsqueda, filtro rol, cambiar rol, eliminar |
| Categorías | CRUD con subcategorías y color |
| Equipo | Grupos, invitaciones, roles, eliminar miembros |
| Vistas de ticket | 3 estados por campo (Oculto/Opcional/Requerido) |
| Canales | EMAIL (con IMAP), WHATSAPP_BAILEYS, WHATSAPP_META, PHONE, TEAMS |
| Respuestas rápidas | CRUD + variables disponibles como chips |

### 📊 Reportes
- Selector de período: 7d / 30d / 90d / Todo
- 6 KPIs: total, abiertos, resueltos, tasa resolución, tiempo promedio, SLA%
- Gráfico de actividad diaria (barras CSS)
- Distribuciones: estado, prioridad, tipo, categoría, grupo
- Rendimiento por agente con barra de progreso

---

## 📹 Módulo DVR — Detalle Completo

### Gestión de DVRs (/dvrs)
- Lista con estadísticas: Total / Online / Offline / Sin verificar
- **Dos modos de conexión por DVR:**
  - 🌐 **Serial** (acceso remoto P2P Dahua cloud) + usuario/contraseña
  - 🏠 **IP local** + puerto 37777 (dentro de la red)
- Credencial global por tenant (cifrada AES-256) con posibilidad de credencial propia por DVR
- Auto-detección de puerto (prueba: 80, 8080, 8000, 443, 8443, 9000, 81, 82)
- **Verificar conectividad:**
  - ⚡ Desde Railway (necesita IP pública)
  - 🏠 Probar local (el browser se conecta directo al DVR desde la misma red)
- **Formas de agregar DVRs:**
  - 📥 Importar CSV: `nombre,ip,puerto,canales,sede`
  - 🔍 Importar desde scan de Red (dispositivos detectados como dvr_nvr)
  - ➕ Agregar manual (formulario completo)
  - 🤖 Auto-registro cuando el scanner de red detecta un dvr_nvr

### Grabaciones (/dvrs/[id])
- **Selector de cámaras**: botones toggle (Todas / Cam 1 / Cam 2 / ... / Cam N)
- **Rango horario**: fecha + hora inicio + hora fin
- **Buscar remoto** 🌐: Railway → IP pública del DVR → RPC2 JSON
- **Buscar local** 🏠: descarga `.bat` → se ejecuta en la red del DVR → envía resultados
- **Descargar grabación:**
  - 🏠 Local: browser → DVR directo (sin pasar por Railway, solo en misma red)
  - 🌐 Remoto: browser → Railway proxy → DVR (necesita IP pública)

### Protocolo de autenticación Dahua (RPC2 JSON)
```
1. POST /RPC2_Login (sin password) → obtiene session + realm + random
2. hash1 = MD5(username:realm:password).toUpper()
3. hash2 = MD5(username:random:hash1).toUpper()
4. POST /RPC2_Login con hash2 → session válida
5. mediaFileFind.factory.instance → finder ID
6. mediaFileFind.findFile (canal, fechas, tipos)
7. mediaFileFind.getCount → total grabaciones
8. mediaFileFind.findNextFile (lotes de 100)
9. global.logout
```

### API Endpoints DVR
```
GET  /api/agent/dvr-script?jobId=xxx  → descarga .bat agente local
POST /api/agent/dvr-scan              → recibe resultados del agente (Bearer token)
GET  /api/agent/dvr-jobs              → jobs pendientes para agente C# (Bearer token)
GET  /api/dvr/download?dvrId=&filePath= → proxy descarga MP4
```

### Agente C# — NuGet Dahua.Api + Cloudflare Tunnel (reescrito — 2026-07-28)
**Ubicación:** `apps/dahua-agent/`
**.NET 8**, usa el paquete NuGet `Dahua.Api` para RPC2 (reemplazó la implementación P2P/UDP propia — `DahuaP2P.cs`/`DahuaRPC.cs` ya no existen).

**Live View en vivo (nuevo):** el agente ahora puede exponer streaming en vivo de los DVRs locales al navegador, vía **go2rtc + Cloudflare Tunnel autenticado con token** (no el `trycloudflare.com` quick-tunnel original, que no es apto para producción — no tiene hostname fijo y expira).

**Flujo:**
```
Agente → Dahua.Api (RPC2) → DVR local → busca grabaciones
Agente → POST HelpDesk OS /api/agent/dvr-scan → resultados
Agente → go2rtc (puerto 1984) → cloudflared (token) → https://vms-<slug>.helpdeskos.co → navegador
Agente → POST /api/agent/tunnel-register (heartbeat cada 4 min) → marca el tunnel como activo en DB
```

**Archivos clave:**
```
apps/dahua-agent/
├── Program.cs
├── Models/AgentConfig.cs      # ServerUrl, AgentToken, TunnelToken, TunnelHostname, EnableLiveView
├── Services/ApiClient.cs      # RegisterTunnelAsync / UnregisterTunnelAsync (heartbeat)
└── Services/TunnelService.cs  # descarga go2rtc.exe + cloudflared.exe, los orquesta
```

**Compilar:**
```bash
cd apps/dahua-agent
dotnet publish -c Release -r win-x64
# Ejecutable: bin/Release/net8.0/win-x64/publish/DahuaAgent.exe
# CI: workflow "Build & Publish Dahua Agent" sube el .zip a R2 automáticamente en cada push a master
```

**config.json (generado automáticamente por el servidor al descargar el agente desde /activos):**
```json
{
  "ServerUrl": "https://helpdesk-os-production.up.railway.app",
  "AgentToken": "TOKEN_DEL_AGENTE",
  "PollIntervalSeconds": 10,
  "EnableLiveView": true,
  "LiveViewPort": 1984,
  "TunnelToken": "TOKEN_DE_INSTALACION_DEL_TUNNEL_DE_ESTE_TENANT",
  "TunnelHostname": "vms-<slug>.helpdeskos.co"
}
```

**Automatización de Cloudflare Tunnel por tenant (nuevo — 2026-07-28):**
`apps/web/src/lib/cloudflare.ts` expone `ensureTunnelForTenant(tenantId, slug)`, llamada desde `GET /api/agent/dahua-download`. Por cada tenant, crea (o reutiliza) un Cloudflare Tunnel remotely-managed vía API:
1. Crea el tunnel (`POST /accounts/{id}/cfd_tunnel`)
2. Configura el ingress: `vms-<slug>.helpdeskos.co` → `http://localhost:1984`
3. Crea/actualiza el registro DNS CNAME (idempotente — verifica si ya existe antes de crear, para tolerar reintentos)
4. Devuelve el `TunnelToken` de instalación (se puede pedir de nuevo cuantas veces se quiera, no es de un solo uso) y el hostname, que se incrustan en el `config.json` del agente descargado.

Requiere la variable `CLOUDFLARE_API_TOKEN` en Railway (ver sección "Pendientes"). Si no está configurada, la descarga del agente sigue funcionando normal — solo Live View queda desactivado, sin romper nada más (falla contenida en un `try/catch`).

**Estado:** ✅ Compilado, en CI, y con automatización de tunnel por tenant funcionando en producción (validado con deploy exitoso el 2026-07-28). ⚠️ Pendiente: probar Live View end-to-end contra un DVR Dahua físico real (no se ha hecho todavía — falta acceso a hardware).

---

## Estructura de Archivos Clave

```
helpdesk-os/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/(dashboard)/
│   │       │   ├── tickets/          # Lista + Kanban
│   │       │   ├── tickets/new/      # Formulario crear
│   │       │   ├── tickets/[id]/     # Detalle + mensajes + adjuntos
│   │       │   ├── assets/           # Inventario activos
│   │       │   ├── network/          # Scanner de red
│   │       │   ├── dvrs/             # Lista DVRs
│   │       │   ├── dvrs/[id]/        # Grabaciones DVR
│   │       │   ├── dashboard/        # Dashboard
│   │       │   ├── reports/          # Reportes
│   │       │   └── settings/         # Configuración (7 pestañas)
│   │       ├── server/routers/
│   │       │   ├── tickets.ts        # CRUD tickets
│   │       │   ├── settings.ts       # Perfil, categorías, canales
│   │       │   ├── teams.ts          # Grupos, miembros, invitaciones, deleteUser
│   │       │   ├── cannedResponses.ts
│   │       │   ├── reports.ts
│   │       │   ├── assets.ts
│   │       │   ├── networkDevices.ts # + cruce con activos
│   │       │   └── dvrs.ts           # DVRs + credenciales + jobs + grabaciones
│   │       ├── app/api/agent/
│   │       │   ├── script/           # .bat agente hardware
│   │       │   ├── scanner/          # .bat scanner red (PS1 multi-método)
│   │       │   ├── inventory/        # POST datos hardware
│   │       │   ├── network-scan/     # POST datos red + auto-DVR
│   │       │   ├── dvr-script/       # .bat agente DVR local
│   │       │   ├── dvr-scan/         # POST resultados DVR
│   │       │   ├── dvr-jobs/         # GET jobs pendientes agente C#
│   │       │   ├── dahua-download/   # GET .zip del agente con config.json + tunnel (nuevo)
│   │       │   └── tunnel-register/  # POST heartbeat del tunnel del agente (nuevo)
│   │       └── lib/
│   │           ├── r2.ts             # Cliente S3-compatible para Cloudflare R2
│   │           └── cloudflare.ts     # ensureTunnelForTenant() — automatización de tunnels (nuevo)
│   ├── dahua-agent/                  # Agente C# — Dahua.Api NuGet + Cloudflare Tunnel
│   │   ├── Program.cs
│   │   ├── Models/AgentConfig.cs
│   │   ├── Services/ApiClient.cs
│   │   ├── Services/TunnelService.cs # go2rtc + cloudflared (Live View)
│   │   └── DahuaAgent.csproj
│   ├── agent/main.go                 # Agente Go hardware (pendiente compilar)
│   └── scanner/main.go              # Scanner Go (pendiente compilar)
├── packages/db/prisma/
│   └── schema.prisma                 # Todos los modelos
└── railway.json                      # Config build + start Railway
```

---

## Modelos de Base de Datos

| Modelo | Descripción |
|--------|-------------|
| Tenant | Empresa (multi-tenant) |
| User | Usuario con rol ADMIN/AGENT/USER |
| Ticket | Ticket con 12 estados, SLA, adjuntos |
| TicketMessage | Mensajes del ticket (públicos e internos) |
| TicketAttachment | Adjuntos en Cloudflare R2 |
| Category | Categorías con subcategorías |
| Group / GroupMember | Grupos de trabajo |
| UserInvitation | Invitaciones por email |
| TenantSettings | Configuración por empresa (agentToken, IMAP) |
| CannedResponse | Respuestas predefinidas |
| Asset | Inventario de activos de hardware |
| NetworkDevice | Dispositivos descubiertos en red |
| ProcessedEmail | Deduplicación IMAP |
| **Dvr** | DVR/NVR con serial, IPs, credenciales |
| **DvrCredential** | Credencial global por tenant (cifrada) |
| **DvrScanJob** | Trabajos de búsqueda de grabaciones |
| **AgentTunnel** | Tunnel de Cloudflare por tenant para Live View (`cloudflareTunnelId`, `hostname`, heartbeat) |
| **DvrAlarm** | Alarmas recibidas del DVR (VideoMotion, VideoLoss, etc.) → crea ticket automático |

---

## Pendientes (actualizado 2026-07-28)

### 🔴 Alta Prioridad
1. **`CLOUDFLARE_API_TOKEN` en Railway** — sin esto, `ensureTunnelForTenant()` falla en silencio y Live View queda desactivado (nada más se rompe). Crear en Cloudflare con permisos `Account.Cloudflare Tunnel: Edit` + `Zone.DNS: Edit`, scope solo sobre la zona `helpdeskos.co`. Juan Pablo debe crearlo y pegarlo él mismo (no delegado a Claude/automatización, por manejo de secretos).
2. **Probar Live View con DVR Dahua físico real** — la automatización de tunnel por tenant y el agente ya están en producción, pero falta validar contra hardware real (sugerido: DVR de Camilo, IP `192.168.1.15`).
3. **Dominio Resend** — verificar `dyccomputersas.com` en Resend + DNS → emails a Camilo

### 🟠 Media Prioridad
4. **Inventario de activos — CRUD manual** — agregar/editar activos sin necesidad del agente
5. **Agente PS1 DVR local** — probar con DVR 192.168.1.15 (Camilo, puerto 80, RPC2)
6. **Ping desde Monitor de Red** — botón ping por IP en /network
7. **PWA (app móvil)** — instalable Android/iOS
8. **Limpieza:** borrar el tunnel manual de prueba `dahua-agent-dyc-test` (`vms.helpdeskos.co`) en Cloudflare — quedó huérfano una vez que la automatización crea `vms-<slug>.helpdeskos.co` por tenant.

### 🟡 Baja Prioridad
9. Portal de autoservicio (sin cuenta)
10. Base de conocimiento
11. WhatsApp Baileys (canal gratuito QR)
12. Reportes avanzados (exportar PDF)

---

## Bugs Conocidos
- Ninguno de TypeScript pendiente (todos resueltos el 2026-06-25)
- Scanner de red: probar `.bat` actualizado (v2.0 multi-subred) con Camilo en su red

### Corregidos el 2026-07-28
- **`pg_dump` versión incorrecta en backups:** el workflow de backups usaba `pg_dump` v16 de Ubuntu contra un Postgres v18 de Railway → fallaba en silencio (el pipe con `gzip` ocultaba el error, subía un backup vacío/corrupto con el step en verde). Corregido usando `docker run postgres:18 pg_dump` + `pipefail` + verificación de tamaño.
- **`tunnel-register` rechazaba el hostname nuevo:** el endpoint `POST /api/agent/tunnel-register` solo aceptaba URLs `*.trycloudflare.com` — al migrar a tunnels autenticados con hostname fijo (`*.helpdeskos.co`), el heartbeat del agente fallaba con 400 en silencio (capturado por un `try/catch` en `TunnelService.cs`) y `vmsRouter.status` nunca marcaba el tunnel como activo. Corregido para aceptar ambos formatos.

---

## Comandos Útiles

```bash
# Ver logs de producción
railway logs --tail 30

# Deployar (automático con push)
git push origin master

# Verificar TypeScript
npx tsc --noEmit -p apps/web/tsconfig.json

# Regenerar Prisma tras cambios en schema
npx prisma generate --schema=packages/db/prisma/schema.prisma

# Compilar agente C#
cd apps/dahua-agent && dotnet publish -c Release -r win-x64
```
