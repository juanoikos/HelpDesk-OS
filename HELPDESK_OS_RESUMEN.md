# HelpDesk OS — Resumen Completo del Proyecto
> Actualizado: 2026-06-05

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

### Variables de entorno en Railway
```
DATABASE_URL          → PostgreSQL interno Railway
AUTH_SECRET           → JWT secret
AUTH_URL              → https://helpdesk-os-production.up.railway.app
RESEND_API_KEY        → re_e9wPUNkD_NwDM9f9xduFovtFovbjsByMv
EMAIL_FROM            → HelpDesk OS <onboarding@resend.dev>
R2_ACCOUNT_ID         → cfaba925c4046955197eef7012fce9b1
R2_ACCESS_KEY_ID      → b055d11be0ea634af59a266faab1c867
R2_SECRET_ACCESS_KEY  → (privado)
R2_BUCKET_NAME        → helpdesk-attachments
R2_PUBLIC_URL         → https://pub-e6d29f7bdc1442c9801e662bce630b61.r2.dev
ANTHROPIC_API_KEY     → (privado)
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
- Recopila: OS, CPU, RAM+seriales, discos+seriales, placa madre, BIOS, GPU, red, USB
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
- ⚠️ FROM usa `onboarding@resend.dev` — pendiente verificar dominio `dyccomputersas.com`

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

### Agente C# — Acceso Remoto via P2P
**Ubicación:** `apps/dahua-agent/`
**Sin dependencias externas** — solo .NET 8

**Flujo:**
```
Agente → UDP → dev.easy4ip.com:3000 (serial) → IP actual del DVR
Agente → HTTP RPC2 → DVR (auth MD5) → busca grabaciones
Agente → POST HelpDesk OS /api/agent/dvr-scan → resultados
```

**Compilar:**
```bash
cd apps/dahua-agent
dotnet publish -c Release -r win-x64
# Ejecutable: bin/Release/net8.0/win-x64/publish/DahuaAgent.exe
```

**config.json:**
```json
{
  "HelpdeskUrl": "https://helpdesk-os-production.up.railway.app",
  "AgentToken": "TOKEN_DEL_AGENTE",
  "PollIntervalSec": 10
}
```

**Estado:** ⚠️ Pendiente compilar y probar (2026-06-05)
- Opción A (recomendada): usar DLLs del Dahua NetSDK — descargar zip de dahuasecurity.com
- Opción B (actual): implementación P2P propia via UDP (puede no ser 100% compatible)

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
│   │       └── app/api/agent/
│   │           ├── script/           # .bat agente hardware
│   │           ├── scanner/          # .bat scanner red (PS1 multi-método)
│   │           ├── inventory/        # POST datos hardware
│   │           ├── network-scan/     # POST datos red + auto-DVR
│   │           ├── dvr-script/       # .bat agente DVR local
│   │           ├── dvr-scan/         # POST resultados DVR
│   │           └── dvr-jobs/         # GET jobs pendientes agente C#
│   ├── dahua-agent/                  # Agente C# P2P
│   │   ├── Program.cs
│   │   ├── DahuaP2P.cs              # Resolución IP via Easy4IP UDP
│   │   ├── DahuaRPC.cs              # RPC2 JSON + auth MD5
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

---

## Pendientes

### 🔴 Alta Prioridad
1. **Dominio Resend** — verificar `dyccomputersas.com` en Resend + DNS → emails a Camilo
2. **Agente C# Dahua** — compilar y probar acceso P2P via serial
   - Recomendado: usar DLLs del Dahua NetSDK (Opción A)
   - Descargar de: dahuasecurity.com/support → General SDK → Windows → C#

### 🟠 Media Prioridad
3. **Agente PS1 DVR local** — probar con DVR 192.168.1.15 (Camilo, puerto 80, RPC2)
4. **Firma de email** — implementada, sin probar
5. **Respuestas rápidas con variables** — implementadas, sin probar en producción
6. **PWA (app móvil)** — instalable Android/iOS

### 🟡 Baja Prioridad
7. Portal de autoservicio (sin cuenta)
8. Base de conocimiento
9. WhatsApp Baileys (canal gratuito QR)
10. Reportes avanzados (exportar PDF)
11. Inventario activos CRUD (UI manual)

---

## Bugs Conocidos
- `email.ts`: errores TS no críticos (FROM function type) — pre-existentes
- `tickets.ts`: `createdById` puede ser undefined — TS warning pre-existente
- Scanner de red: probar `.bat` actualizado con Camilo en su red

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
