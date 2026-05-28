# HelpDesk OS — Diseño del Sistema
**Fecha:** 2026-05-28  
**Estado:** Aprobado por Juan Pablo Morales

---

## Visión

Sistema de gestión de soporte e inventario TI, multi-empresa, con onboarding guiado por IA.  
Deployable en la nube (SaaS) o en servidores propios (self-hosted).  
Diferenciador clave: wizard de configuración en lenguaje natural — describes tu empresa y el sistema se configura solo.

---

## Decisiones de diseño

| Decisión | Elección | Razón |
|----------|----------|-------|
| Target | Multi-empresa, empieza con la propia | Escala a producto vendible |
| Deployment | Cloud SaaS + Self-hosted (Docker) | Flexibilidad para distintos clientes |
| Stack | TypeScript full-stack | Un solo lenguaje, más fácil de mantener solo |
| WhatsApp | Baileys (informal) + Meta API (oficial) | Ambas según tamaño del cliente |
| Wizard | IA con Claude API | Diferenciador principal del producto |
| Multi-tenancy | Row Level Security en PostgreSQL | Más seguro que filtrar solo en código |
| Equipo | Solo developer | Fases secuenciales, sin paralelismo forzado |

---

## Stack tecnológico

```
Monorepo:     Turborepo
Frontend:     Next.js 15 + TypeScript strict + Tailwind v4 + shadcn/ui
API:          tRPC (type-safe end-to-end)
Validación:   Zod (compartida frontend/backend)
ORM:          Prisma
DB:           PostgreSQL + Row Level Security
Auth:         Auth.js v5 (NextAuth)
Colas:        BullMQ + Redis
Email out:    Resend
Email in:     IMAP polling → BullMQ
WhatsApp:     Baileys + Meta Cloud API
AI (wizard):  Anthropic Claude API
Self-hosted:  Docker Compose
Cloud:        Railway
```

---

## Estructura del monorepo

```
apps/
  web/          ← Next.js 15 (frontend + API routes + tRPC)
  workers/      ← procesamiento de emails, WhatsApp, colas BullMQ
packages/
  db/           ← Prisma schema + cliente compartido
  types/        ← tipos TypeScript compartidos
  ui/           ← componentes shadcn/ui compartidos
```

---

## Modelo de datos principal

| Tabla | Descripción |
|-------|-------------|
| `tenants` | Empresas que usan el sistema |
| `users` | Personas con acceso (admin, agente, usuario) |
| `tickets` | Casos de soporte |
| `ticket_messages` | Conversación dentro de cada ticket |
| `assets` | Equipos de inventario |
| `licenses` | Licencias de software |
| `categories` | Tipos de tickets |
| `notifications` | Cola de correos/alertas |
| `channels` | Configuración email/WhatsApp por empresa |

Multi-tenancy: todas las tablas tienen `tenant_id` + Row Level Security en PostgreSQL.

---

## Pantallas principales

1. **Wizard de configuración** — caja de texto libre, IA propone config, usuario confirma
2. **Dashboard** — métricas del día (tickets abiertos, pendientes, urgentes)
3. **Lista de tickets** — filtros por estado, agente, canal, fecha
4. **Detalle de ticket** — hilo de conversación + info lateral (estado, agente, equipo)
5. **Inventario** — lista de equipos con vinculación a tickets
6. **Notificación email** — correo automático al usuario con estado del ticket

---

## Fases de implementación

### Fase 1 — MVP (15 semanas)

| Bloque | Contenido | Semanas |
|--------|-----------|---------|
| 0 | Instalar herramientas (Node, VS Code, Git, Docker, GitHub) | 1 |
| 1 | Esqueleto del proyecto (Turborepo + Next.js + DB) | 1-2 |
| 2 | Login y registro de empresa | 3-4 |
| 3 | Wizard de configuración con IA | 5-6 |
| 4 | Gestión de tickets (crear, ver, asignar, cerrar) | 7-8 |
| 5 | Recibir tickets por email (IMAP + Resend) | 9-10 |
| 6 | Notificaciones automáticas por email | 11 |
| 7 | WhatsApp (Baileys) | 12-13 |
| 8 | Inventario básico | 14 |
| 9 | Deploy en Railway | 15 |

### Fase 2 — Expansión (3 meses post-MVP)
- WhatsApp oficial (Meta Business API)
- Gestión de licencias
- Reportes y dashboards
- Portal de autoservicio para usuarios finales

### Fase 3 — Producto vendible (3 meses post-Fase 2)
- Empaquetado self-hosted con Docker
- Planes y pagos con Stripe
- Mantenimientos programados
- App móvil básica

---

## Primer paso concreto

Instalar las herramientas del Bloque 0:
1. Node.js — https://nodejs.org (versión LTS)
2. VS Code — https://code.visualstudio.com
3. Git — https://git-scm.com
4. Docker Desktop — https://www.docker.com/products/docker-desktop
5. Cuenta GitHub — https://github.com
6. Cuenta Anthropic — https://console.anthropic.com
