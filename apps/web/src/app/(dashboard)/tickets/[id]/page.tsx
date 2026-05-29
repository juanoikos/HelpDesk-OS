"use client";

import { trpc } from "@/trpc/react";
import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

// ─── Configuración visual ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  NEW:               { label: "Nuevo",                  badge: "bg-slate-700 text-slate-200 border-slate-600" },
  ASSIGNED:          { label: "Asignado",               badge: "bg-blue-900 text-blue-300 border-blue-800" },
  IN_DIAGNOSIS:      { label: "En diagnóstico",         badge: "bg-cyan-900 text-cyan-300 border-cyan-800" },
  IN_ANALYSIS:       { label: "En análisis",            badge: "bg-indigo-900 text-indigo-300 border-indigo-800" },
  IN_PROGRESS:       { label: "En progreso",            badge: "bg-amber-900 text-amber-300 border-amber-800" },
  WAITING:           { label: "En espera",              badge: "bg-purple-900 text-purple-300 border-purple-800" },
  PENDING_USER:      { label: "Pendiente de usuario",   badge: "bg-orange-900 text-orange-300 border-orange-800" },
  PENDING_PROVIDER:  { label: "Pendiente de proveedor", badge: "bg-rose-900 text-rose-300 border-rose-800" },
  ESCALATED:         { label: "Escalado",               badge: "bg-red-900 text-red-300 border-red-800" },
  RESOLVED:          { label: "Resuelto",               badge: "bg-green-900 text-green-300 border-green-800" },
  CLOSED:            { label: "Cerrado",                badge: "bg-slate-800 text-slate-500 border-slate-700" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW:    { label: "Baja",    color: "text-slate-400" },
  MEDIUM: { label: "Media",   color: "text-blue-400"  },
  HIGH:   { label: "Alta",    color: "text-orange-400" },
  URGENT: { label: "Urgente", color: "text-red-400"   },
};

const TYPE_CONFIG: Record<string, { label: string; icon: string }> = {
  INCIDENT:           { label: "Incidente",         icon: "🔴" },
  REQUEST:            { label: "Requerimiento",     icon: "🔵" },
  ACCESS_PERMISSIONS: { label: "Acceso y permisos", icon: "🔐" },
  PURCHASE:           { label: "Compra / Insumo",   icon: "🛒" },
  QUERY:              { label: "Consulta",          icon: "❓" },
  PROBLEM:            { label: "Problema",          icon: "⚠️" },
  CHANGE:             { label: "Cambio",            icon: "🟡" },
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
  { value: "NEW",              label: "Nuevo" },
  { value: "ASSIGNED",         label: "Asignado" },
  { value: "IN_DIAGNOSIS",     label: "En diagnóstico" },
  { value: "IN_ANALYSIS",      label: "En análisis" },
  { value: "IN_PROGRESS",      label: "En progreso" },
  { value: "WAITING",          label: "En espera" },
  { value: "PENDING_USER",     label: "Pendiente de usuario" },
  { value: "PENDING_PROVIDER", label: "Pendiente de proveedor" },
  { value: "ESCALATED",        label: "Escalado" },
  { value: "RESOLVED",         label: "Resuelto" },
  { value: "CLOSED",           label: "Cerrado" },
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

  const [reply,        setReply]        = useState("");
  const [isInternal,   setIsInternal]   = useState(false);
  const [solution,     setSolution]     = useState("");
  const [showSolution, setShowSolution] = useState(false);
  const [closeWarning, setCloseWarning] = useState(false);

  if (isLoading) return <div className="text-slate-500 text-sm py-16 text-center">Cargando ticket...</div>;
  if (!ticket)   return (
    <div className="text-center py-16">
      <p className="text-white font-semibold mb-2">Ticket no encontrado</p>
      <Link href="/tickets" className="text-blue-400 text-sm">← Volver a tickets</Link>
    </div>
  );

  const isClosed = ticket.status === "CLOSED";

  // Filas de detalle que tengan valor
  const detailRows = [
    { label: "Sede",         value: ticket.siteType === "POS" ? "🏪 Punto de Venta" : ticket.siteType === "OFFICE" ? "🏢 Oficina Central" : null },
    { label: "Ubicación",    value: ticket.location },
    { label: "Área",         value: ticket.area },
    { label: "Categoría TI", value: ticket.techCategory },
    { label: "Subcategoría", value: ticket.subcategory },
    { label: "Activo / CI",  value: ticket.affectedAsset },
    { label: "Grupo",        value: ticket.assignedGroup },
    { label: "Equipo",       value: ticket.equipmentName },
    { label: "Componente",   value: ticket.deviceType },
    { label: "Detalle",      value: ticket.deviceDetail },
    { label: "Sistema",      value: ticket.affectedSystem },
    { label: "Versión",      value: ticket.appVersion },
    { label: "Urgencia",     value: ticket.urgency },
    { label: "Diagnóstico",  value: ticket.diagnosis },
  ].filter((r) => r.value);

  return (
    <div className="max-w-4xl mx-auto space-y-4 pb-10">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/tickets" className="hover:text-slate-300">Tickets</Link>
        <span>/</span>
        <span className="text-slate-300 font-mono">#{String(ticket.number).padStart(3, "0")}</span>
      </div>

      {/* ── 1. Cabecera ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4 mb-3">
          <h1 className="text-xl font-bold text-white leading-snug">{ticket.title}</h1>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 ${STATUS_CONFIG[ticket.status]?.badge ?? ""}`}>
            {STATUS_CONFIG[ticket.status]?.label ?? ticket.status}
          </span>
        </div>
        <SlaIndicator deadline={ticket.slaDeadline} breached={ticket.slaBreached} />
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
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── 2. Barra de acciones ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">

        {/* Estado — pills horizontales */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Estado</p>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((opt) => {
              const needsSolution = opt.value === "CLOSED" && !ticket.solution;
              return (
                <button key={opt.value}
                  onClick={() => {
                    if (needsSolution) { setCloseWarning(true); return; }
                    setCloseWarning(false);
                    updateStatus.mutate({ id: ticketId, status: opt.value as "NEW"|"ASSIGNED"|"IN_DIAGNOSIS"|"IN_ANALYSIS"|"IN_PROGRESS"|"WAITING"|"PENDING_USER"|"PENDING_PROVIDER"|"ESCALATED"|"RESOLVED"|"CLOSED" });
                  }}
                  disabled={updateStatus.isPending}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    ticket.status === opt.value
                      ? STATUS_CONFIG[opt.value]?.badge
                      : needsSolution
                        ? "border-slate-700 text-slate-600 cursor-not-allowed"
                        : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                  }`}>
                  {opt.label}
                </button>
              );
            })}
          </div>
          {/* Aviso: solución obligatoria para cerrar */}
          {closeWarning && (
            <div className="mt-2 flex items-start gap-2 bg-amber-950/50 border border-amber-800/50 rounded-xl px-3 py-2.5">
              <span className="text-amber-400 text-sm flex-shrink-0">⚠</span>
              <div>
                <p className="text-amber-300 text-xs font-medium">Se requiere solución para cerrar el ticket</p>
                <p className="text-amber-500 text-xs mt-0.5">
                  Registra la solución primero — esto alimenta la base de conocimiento que usará la IA para sugerir diagnósticos.
                </p>
                <button
                  onClick={() => { setShowSolution(true); setCloseWarning(false); }}
                  className="mt-2 text-xs text-amber-400 underline hover:text-amber-300">
                  Ir a registrar solución →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Asignar + Prioridad/Impacto en la misma fila */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-slate-800">
          <div>
            <p className="text-xs text-slate-500 mb-1">Asignado a</p>
            <select value={ticket.assignedToId ?? ""}
              onChange={(e) => assign.mutate({ id: ticketId, userId: e.target.value || null })}
              disabled={assign.isPending}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="">Sin asignar</option>
              {agents?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Prioridad</p>
            <p className={`text-sm font-semibold ${PRIORITY_CONFIG[ticket.priority]?.color}`}>
              {PRIORITY_CONFIG[ticket.priority]?.label}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Impacto</p>
            <p className="text-sm text-slate-300">{IMPACT_CONFIG[ticket.impact] ?? ticket.impact}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-1">Fechas</p>
            <p className="text-xs text-slate-400">
              {new Date(ticket.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
            {ticket.closedAt && (
              <p className="text-xs text-slate-600">
                Cerrado: {new Date(ticket.closedAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── 3. Info: solicitante + detalles técnicos ── */}
      {(ticket.requesterName || ticket.requesterContact || detailRows.length > 0) && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Información del ticket</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
            {ticket.requesterName && (
              <div>
                <p className="text-slate-600 text-xs">Solicitante</p>
                <p className="text-slate-300 text-sm font-medium">{ticket.requesterName}</p>
              </div>
            )}
            {ticket.requesterContact && (
              <div>
                <p className="text-slate-600 text-xs">Contacto</p>
                <p className="text-slate-300 text-sm">{ticket.requesterContact}</p>
              </div>
            )}
            {(ticket.requesterName || ticket.requesterContact) && (
              <div>
                <p className="text-slate-600 text-xs">Registrado por</p>
                <p className="text-slate-300 text-sm">{ticket.createdBy.name}</p>
              </div>
            )}
            {detailRows.map((row) => (
              <div key={row.label}>
                <p className="text-slate-600 text-xs">{row.label}</p>
                <p className="text-slate-300 text-sm">{row.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. Mensajes ── */}
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

      {/* ── 5. Solución registrada ── */}
      {ticket.solution && (
        <div className="bg-green-950/40 border border-green-900/50 rounded-2xl p-4">
          <p className="text-xs font-semibold text-green-400 mb-2">✓ Solución registrada</p>
          <p className="text-slate-300 text-sm whitespace-pre-wrap">{ticket.solution}</p>
        </div>
      )}

      {/* ── 6. Respuesta / solución ── */}
      {!isClosed ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
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
  );
}
