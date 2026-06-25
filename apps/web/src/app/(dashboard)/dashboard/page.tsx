import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const tenantId = session.user.tenantId;

  // Carga datos reales de la BD
  const OPEN_STATUSES = ["NEW","ASSIGNED","IN_DIAGNOSIS","IN_ANALYSIS","IN_PROGRESS","WAITING","PENDING_USER","PENDING_PROVIDER","ESCALATED"] as const;
  const today = new Date(); today.setHours(0,0,0,0);

  const [categoriesCount, openCount, inProgressCount, resolvedTodayCount] = await Promise.all([
    prisma.category.count({ where: { tenantId } }),
    prisma.ticket.count({ where: { tenantId, status: { in: [...OPEN_STATUSES] } } }),
    prisma.ticket.count({ where: { tenantId, status: "IN_PROGRESS" } }),
    prisma.ticket.count({ where: { tenantId, status: "RESOLVED", updatedAt: { gte: today } } }),
  ]);

  const isConfigured = categoriesCount > 0;

  return (
    <div>
      {/* Bienvenida */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Bienvenido, {session.user.name?.split(" ")[0]} 👋
        </h1>
        <p className="text-slate-400 mt-1">
          {session.user.tenantName} ·{" "}
          {session.user.role === "ADMIN"
            ? "Administrador"
            : session.user.role === "AGENT"
              ? "Agente"
              : "Usuario"}
        </p>
      </div>

      {/* Banner de configuración pendiente */}
      {!isConfigured && (
        <div className="bg-blue-950 border border-blue-800 rounded-xl p-5 mb-6 flex items-center justify-between">
          <div>
            <p className="text-blue-200 font-medium">Tu empresa aún no está configurada</p>
            <p className="text-blue-400 text-sm mt-0.5">
              El wizard de IA configura categorías, canales y más en segundos.
            </p>
          </div>
          <Link
            href="/wizard"
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors whitespace-nowrap ml-4"
          >
            Configurar ahora →
          </Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Tickets abiertos", value: openCount,        href: "/tickets?status=open",        color: "text-blue-400" },
          { label: "En progreso",       value: inProgressCount, href: "/tickets?status=IN_PROGRESS",  color: "text-amber-400" },
          { label: "Resueltos hoy",     value: resolvedTodayCount, href: "/tickets?status=RESOLVED",  color: "text-green-400" },
          { label: "Categorías",        value: categoriesCount, href: "/settings",                   color: "text-slate-200" },
        ].map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className="bg-slate-900 rounded-xl border border-slate-800 p-5 hover:border-slate-600 hover:bg-slate-800/60 transition-colors group"
          >
            <p className="text-slate-400 text-sm mb-2 group-hover:text-slate-300 transition-colors">{stat.label}</p>
            <p className={`text-3xl font-bold ${stat.value === 0 ? "text-slate-600" : stat.color}`}>
              {stat.value === 0 ? "—" : stat.value}
            </p>
          </Link>
        ))}
      </div>

      {/* Hoja de ruta — solo visible para el tenant desarrollador */}
      {session.user.tenantSlug === "d-c-computer-sas" && <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h2 className="text-white font-semibold mb-1">Hoja de ruta</h2>
        <p className="text-slate-500 text-xs mb-5">Estado real del sistema al {new Date().toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}</p>

        {/* Completado */}
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">✅ Completado</p>
        <div className="space-y-2 mb-6">
          {[
            "Wizard de configuración con IA (Groq / Gemini / Claude)",
            "Gestión completa de tickets (dos formularios: usuario y TI)",
            "12 estados de ticket con flujo de trabajo",
            "SLA automático por prioridad (colores en lista)",
            "Adjuntos de archivos (Cloudflare R2)",
            "Notificaciones email en cada evento del ticket",
            "Aprobación de cierre por el usuario solicitante",
            "Gestión de equipo: grupos, roles, invitaciones",
            "Configuración avanzada (categorías, canales, vistas, respuestas rápidas)",
            "Firma de email por agente",
            "Filtros avanzados en lista de tickets",
            "Deploy automático en Railway",
            "Recepción de tickets por email (IMAP entrante)",
            "Vista Kanban de tickets",
            "Reportes y métricas (tiempo de resolución, SLA, por agente)",
            "Respuestas predefinidas con variables dinámicas ({nombre}, {numero}, {agente}...)",
            "Inventario de activos — agente automático (.bat + tarea programada cada 3 días)",
            "Detección de monitores y mouse en inventario de activos",
            "Scanner de red con detección de dispositivos y cámaras IP",
            "Módulo DVR/CCTV completo (búsqueda de grabaciones Dahua RPC2)",
            "Recuperación de contraseña por email (enlace de un solo uso)",
            "Seguridad: rate limiting por IP + secrets en variables de entorno",
          ].map((item) => (
            <div key={item} className="flex items-center gap-3 text-sm">
              <span className="text-green-500 flex-shrink-0">✓</span>
              <span className="text-slate-300">{item}</span>
            </div>
          ))}
        </div>

        {/* En progreso */}
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">🔄 En progreso</p>
        <div className="space-y-2 mb-6">
          {[
            { nombre: "App móvil (PWA — instalable en Android e iOS)", desc: "Próximo" },
          ].map((item) => (
            <div key={item.nombre} className="flex items-center gap-3 text-sm">
              <span className="text-blue-400 flex-shrink-0">→</span>
              <span className="text-slate-300">{item.nombre}</span>
              <span className="ml-auto text-xs text-blue-400">{item.desc}</span>
            </div>
          ))}
        </div>

        {/* Pendiente */}
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">⏳ Pendiente</p>
        <div className="space-y-2">
          {[
            "Inventario de activos — CRUD manual (agregar/editar activos sin agente)",
            "WhatsApp (Baileys — canal gratuito)",
            "Portal de autoservicio para usuarios finales",
            "Base de conocimiento / FAQ desde soluciones",
          ].map((item) => (
            <div key={item} className="flex items-center gap-3 text-sm">
              <span className="text-slate-600 flex-shrink-0">○</span>
              <span className="text-slate-500">{item}</span>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}
