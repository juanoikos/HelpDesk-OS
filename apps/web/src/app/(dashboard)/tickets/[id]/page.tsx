"use client";

import { trpc } from "@/trpc/react";
import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

// ─── Configuración visual ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  NEW:         { label: "Nuevo",        badge: "bg-slate-700 text-slate-200 border-slate-600" },
  IN_ANALYSIS: { label: "En análisis",  badge: "bg-indigo-900 text-indigo-300 border-indigo-800" },
  IN_PROGRESS: { label: "En progreso",  badge: "bg-amber-900 text-amber-300 border-amber-800" },
  WAITING:     { label: "En espera",    badge: "bg-purple-900 text-purple-300 border-purple-800" },
  ESCALATED:   { label: "Escalado",     badge: "bg-red-900 text-red-300 border-red-800" },
  RESOLVED:    { label: "Resuelto",     badge: "bg-green-900 text-green-300 border-green-800" },
  CLOSED:      { label: "Cerrado",      badge: "bg-slate-800 text-slate-500 border-slate-700" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW:    { label: "Baja",    color: "text-slate-400" },
  MEDIUM: { label: "Media",   color: "text-blue-400"  },
  HIGH:   { label: "Alta",    color: "text-orange-400" },
  URGENT: { label: "Urgente", color: "text-red-400"   },
};

const TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
  INCIDENT: { label: "Incidente",    icon: "🔴" },
  REQUEST:  { label: "Requerimiento", icon: "🔵" },
  CHANGE:   { label: "Cambio",       icon: "🟡" },
};

const IMPACT_CONFIG: Record<string, string> = {
  LOW:      "Solo el usuario",
  MEDIUM:   "Área / departamento",
  HIGH:     "Múltiples áreas",
  CRITICAL: "Toda la empresa",
};

const CHANNEL_ICON: Record<string, string> = {
  WEB: "🌐", EMAIL: "📧", WHATSAPP: "💬", PHONE: "📞",
};

const STATUS_OPTIONS = [
  { value: "NEW",         label: "Nuevo" },
  { value: "IN_ANALYSIS", label: "En análisis" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "WAITING",     label: "En espera" },
  { value: "ESCALATED",   label: "Escalado" },
  { value: "RESOLVED",    label: "Resuelto" },
  { value: "CLOSED",      label: "Cerrado" },
];

// ─── SLA helper ───────────────────────────────────────────────────────────────

function SlaIndicator({ deadline, breached }: { deadline: Date | null; breached: boolean }) {
  if (!deadline) return null;
  const now       = new Date();
  const deadlineD = new Date(deadline);
  const diffMs    = deadlineD.getTime() - now.getTime();
  const diffH     = Math.round(diffMs / 3600000);
  const isOver    = diffMs < 0;

  if (breached || isOver) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-red-400 bg-red-950 border border-red-900 rounded-lg px-2.5 py-1.5">
        <span>⚠</span>
        <span>SLA vencido · {deadlineD.toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 ${
      diffH <= 2 ? "text-orange-400 bg-orange-950 border border-orange-900" : "text-green-400 bg-green-950 border border-green-900"
    }`}>
      <span>🕐</span>
      <span>SLA: {diffH <= 0 ? "menos de 1h" : `${diffH}h restantes`} · {deadlineD.toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const params   = useParams();
  const ticketId = params.id as string;
  const utils    = trpc.useUtils();

  const { data: ticket, isLoading } = trpc.tickets.getById.useQuery({ id: ticketId });
  const { data: agents }            = trpc.tickets.listAgents.useQuery();

  const invalidate = () => utils.tickets.getById.invalidate({ id: ticketId });

  const updateStatus  = trpc.tickets.updateStatus.useMutation({ onSuccess: invalidate });
  const assign        = trpc.tickets.assign.useMutation({ onSuccess: invalidate });
  const saveSolution  = trpc.tickets.saveSolution.useMutation({ onSuccess: invalidate });
  const addMessage    = trpc.tickets.addMessage.useMutation({
    onSuccess: () => { setReply(""); invalidate(); },
  });

  const [reply,      setReply]      = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [solution,   setSolution]   = useState("");
  const [showSolution, setShowSolution] = useState(false);

  if (isLoading) return <div className="text-slate-500 text-sm py-16 text-center">Cargando ticket...</div>;
  if (!ticket)   return (
    <div className="text-center py-16">
      <p className="text-white font-semibold mb-2">Ticket no encontrado</p>
      <Link href="/tickets" className="text-blue-400 text-sm">← Volver a tickets</Link>
    </div>
  );

  const isClosed = ticket.status === "CLOSED";

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-5">
        <Link href="/tickets" className="hover:text-slate-300">Tickets</Link>
        <span>/</span>
        <span className="text-slate-300 font-mono">#{String(ticket.number).padStart(3, "0")}</span>
      </div>

      <div className="grid grid-cols-3 gap-6">

        {/* ── Columna principal ── */}
        <div className="col-span-2 space-y-4">

          {/* Cabecera */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <h1 className="text-xl font-bold text-white leading-snug">{ticket.title}</h1>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${STATUS_CONFIG[ticket.status]?.badge ?? ""}`}>
                {STATUS_CONFIG[ticket.status]?.label ?? ticket.status}
              </span>
            </div>

            {/* SLA */}
            <SlaIndicator deadline={ticket.slaDeadline} breached={ticket.slaBreached} />

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
              <span>{TYPE_CONFIG[ticket.type]?.icon} {TYPE_CONFIG[ticket.type]?.label}</span>
              <span>·</span>
              <span>Creado por <span className="text-slate-300">{ticket.createdBy.name}</span></span>
              <span>·</span>
              <span>{new Date(ticket.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}</span>
              {ticket.category && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: ticket.category.color ?? "#64748b" }} />
                    {ticket.category.name}
                    {ticket.subcategory && <span className="text-slate-600"> / {ticket.subcategory}</span>}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Mensajes */}
          <div className="space-y-3">
            {ticket.messages.map((msg) => (
              <div key={msg.id}
                className={`rounded-2xl border p-4 ${msg.isInternal ? "bg-amber-950/30 border-amber-900/40" : "bg-slate-900 border-slate-800"}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">
                    {(msg.user?.name ?? "?")[0].toUpperCase()}
                  </div>
                  <span className="text-slate-200 text-sm font-medium">{msg.user?.name ?? "Sistema"}</span>
                  <span className="text-slate-600 text-xs">
                    {CHANNEL_ICON[msg.channel]} · {new Date(msg.createdAt).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  {msg.isInternal && (
                    <span className="ml-auto text-xs font-medium text-amber-400 bg-amber-900/50 px-2 py-0.5 rounded-full">Nota interna</span>
                  )}
                </div>
                <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed pl-9">{msg.body}</p>
              </div>
            ))}
          </div>

          {/* Solución */}
          {ticket.solution && (
            <div className="bg-green-950/40 border border-green-900/50 rounded-2xl p-4">
              <p className="text-xs font-semibold text-green-400 mb-2">✓ Solución registrada</p>
              <p className="text-slate-300 text-sm whitespace-pre-wrap">{ticket.solution}</p>
            </div>
          )}

          {/* Formulario de respuesta */}
          {!isClosed ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
              {/* Tabs: respuesta / solución */}
              <div className="flex gap-2">
                <button onClick={() => setShowSolution(false)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${!showSolution ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}>
                  💬 Respuesta
                </button>
                <button onClick={() => setShowSolution(true)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${showSolution ? "bg-green-900 text-green-300" : "text-slate-400 hover:text-slate-200"}`}>
                  ✓ Registrar solución
                </button>
              </div>

              {!showSolution ? (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Escribir respuesta</span>
                    <button onClick={() => setIsInternal((v) => !v)}
                      className={`text-xs px-3 py-1 rounded-lg border transition-colors ${isInternal
                        ? "border-amber-700 bg-amber-900/40 text-amber-300"
                        : "border-slate-700 text-slate-500 hover:text-slate-300"}`}>
                      {isInternal ? "🔒 Nota interna" : "🌐 Respuesta pública"}
                    </button>
                  </div>
                  <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4}
                    placeholder={isInternal ? "Nota interna (solo visible para el equipo)..." : "Escribe tu respuesta al usuario..."}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                  {addMessage.error && <p className="text-red-400 text-xs">{addMessage.error.message}</p>}
                  <button onClick={() => addMessage.mutate({ ticketId, body: reply, isInternal })}
                    disabled={reply.trim().length === 0 || addMessage.isPending}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm">
                    {addMessage.isPending ? "Enviando..." : "Enviar respuesta"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-slate-500">Describe cómo se resolvió el problema. El ticket pasará a estado "Resuelto".</p>
                  <textarea value={solution} onChange={(e) => setSolution(e.target.value)} rows={4}
                    placeholder="Describe la solución aplicada..."
                    className="w-full bg-slate-800 border border-green-900/50 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-600 resize-none" />
                  <button onClick={() => saveSolution.mutate({ id: ticketId, solution })}
                    disabled={solution.trim().length === 0 || saveSolution.isPending}
                    className="bg-green-700 hover:bg-green-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm">
                    {saveSolution.isPending ? "Guardando..." : "✓ Guardar solución y resolver"}
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="text-center py-4 text-slate-600 text-sm border border-slate-800 rounded-2xl">
              Ticket cerrado.{" "}
              <button onClick={() => updateStatus.mutate({ id: ticketId, status: "NEW" })} className="text-blue-400 hover:underline">
                Reabrir
              </button>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">

          {/* Estado */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Estado</h3>
            <div className="space-y-1">
              {STATUS_OPTIONS.map((opt) => (
                <button key={opt.value}
                  onClick={() => updateStatus.mutate({ id: ticketId, status: opt.value as "NEW" | "IN_ANALYSIS" | "IN_PROGRESS" | "WAITING" | "ESCALATED" | "RESOLVED" | "CLOSED" })}
                  disabled={updateStatus.isPending}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                    ticket.status === opt.value
                      ? `font-semibold ${STATUS_CONFIG[opt.value]?.badge} border`
                      : "text-slate-400 hover:bg-slate-800"
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prioridad e Impacto */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Prioridad / Impacto</h3>
            <div>
              <span className={`font-semibold text-sm ${PRIORITY_CONFIG[ticket.priority]?.color}`}>
                {PRIORITY_CONFIG[ticket.priority]?.label}
              </span>
              <span className="text-slate-600 text-xs ml-2">prioridad</span>
            </div>
            <div>
              <span className="text-slate-300 text-sm">{IMPACT_CONFIG[ticket.impact] ?? ticket.impact}</span>
              <span className="text-slate-600 text-xs ml-2">impacto</span>
            </div>
          </div>

          {/* Asignado a */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Asignado a</h3>
            <select value={ticket.assignedToId ?? ""}
              onChange={(e) => assign.mutate({ id: ticketId, userId: e.target.value || null })}
              disabled={assign.isPending}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Sin asignar</option>
              {agents?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          {/* Solicitante */}
          {(ticket.requesterName || ticket.requesterContact) && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Solicitante</h3>
              {ticket.requesterName && (
                <div>
                  <p className="text-slate-600 text-xs">Nombre</p>
                  <p className="text-slate-300 text-sm font-medium">{ticket.requesterName}</p>
                </div>
              )}
              {ticket.requesterContact && (
                <div>
                  <p className="text-slate-600 text-xs">Contacto</p>
                  <p className="text-slate-300 text-sm">{ticket.requesterContact}</p>
                </div>
              )}
              <div>
                <p className="text-slate-600 text-xs">Registrado por</p>
                <p className="text-slate-300 text-sm">{ticket.createdBy.name}</p>
              </div>
            </div>
          )}

          {/* Detalles técnicos */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Detalles</h3>
            {[
              { label: "Tipo de sede",   value: ticket.siteType === "POS" ? "🏪 Punto de Venta" : ticket.siteType === "OFFICE" ? "🏢 Oficina Central" : null },
              { label: "Área",           value: ticket.area },
              { label: "Sede / Ubicación", value: ticket.location },
              { label: "Equipo",         value: ticket.equipmentName },
              { label: "Componente",     value: ticket.deviceType },
              { label: "Sistema",        value: ticket.affectedSystem },
              { label: "Versión",        value: ticket.appVersion },
              { label: "Subcategoría",   value: ticket.subcategory },
            ].filter((r) => r.value).map((row) => (
              <div key={row.label}>
                <p className="text-slate-600 text-xs">{row.label}</p>
                <p className="text-slate-300 text-sm">{row.value}</p>
              </div>
            ))}
            {!ticket.area && !ticket.location && !ticket.affectedSystem && (
              <p className="text-slate-600 text-xs">Sin detalles adicionales</p>
            )}
          </div>

          {/* Fechas */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Fechas</h3>
            <div>
              <p className="text-slate-600 text-xs">Creación</p>
              <p className="text-slate-300 text-sm">{new Date(ticket.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}</p>
            </div>
            <div>
              <p className="text-slate-600 text-xs">Última actualización</p>
              <p className="text-slate-300 text-sm">{new Date(ticket.updatedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}</p>
            </div>
            {ticket.closedAt && (
              <div>
                <p className="text-slate-600 text-xs">Cierre</p>
                <p className="text-slate-300 text-sm">{new Date(ticket.closedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "long", year: "numeric" })}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
