"use client";

import { trpc } from "@/trpc/react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

// ─── Configuración visual ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  OPEN:        { label: "Abierto",      badge: "bg-blue-900 text-blue-300 border-blue-800" },
  IN_PROGRESS: { label: "En progreso",  badge: "bg-amber-900 text-amber-300 border-amber-800" },
  WAITING:     { label: "En espera",    badge: "bg-purple-900 text-purple-300 border-purple-800" },
  RESOLVED:    { label: "Resuelto",     badge: "bg-green-900 text-green-300 border-green-800" },
  CLOSED:      { label: "Cerrado",      badge: "bg-slate-700 text-slate-400 border-slate-600" },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW:    { label: "Baja",    color: "text-slate-400" },
  MEDIUM: { label: "Media",   color: "text-blue-400" },
  HIGH:   { label: "Alta",    color: "text-orange-400" },
  URGENT: { label: "Urgente", color: "text-red-400" },
};

const CHANNEL_ICON: Record<string, string> = {
  WEB:      "🌐",
  EMAIL:    "📧",
  WHATSAPP: "💬",
  PHONE:    "📞",
};

const STATUS_OPTIONS = [
  { value: "OPEN",        label: "Abierto" },
  { value: "IN_PROGRESS", label: "En progreso" },
  { value: "WAITING",     label: "En espera" },
  { value: "RESOLVED",    label: "Resuelto" },
  { value: "CLOSED",      label: "Cerrado" },
];

// ─── Página de detalle ────────────────────────────────────────────────────────

export default function TicketDetailPage() {
  const params    = useParams();
  const router    = useRouter();
  const ticketId  = params.id as string;

  const utils = trpc.useUtils();

  const { data: ticket, isLoading } = trpc.tickets.getById.useQuery({ id: ticketId });
  const { data: agents }            = trpc.tickets.listAgents.useQuery();

  const updateStatus = trpc.tickets.updateStatus.useMutation({
    onSuccess: () => utils.tickets.getById.invalidate({ id: ticketId }),
  });
  const assign = trpc.tickets.assign.useMutation({
    onSuccess: () => utils.tickets.getById.invalidate({ id: ticketId }),
  });
  const addMessage = trpc.tickets.addMessage.useMutation({
    onSuccess: () => {
      setReply("");
      utils.tickets.getById.invalidate({ id: ticketId });
    },
  });

  const [reply,      setReply]      = useState("");
  const [isInternal, setIsInternal] = useState(false);

  if (isLoading) {
    return <div className="text-slate-500 text-sm py-12 text-center">Cargando ticket...</div>;
  }
  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-white font-semibold mb-2">Ticket no encontrado</p>
        <Link href="/tickets" className="text-blue-400 text-sm">← Volver a tickets</Link>
      </div>
    );
  }

  const isClosed = ticket.status === "CLOSED";

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-5">
        <Link href="/tickets" className="hover:text-slate-300 transition-colors">Tickets</Link>
        <span>/</span>
        <span className="text-slate-400">#{String(ticket.number).padStart(3, "0")}</span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* ── Columna principal (hilo) ── */}
        <div className="col-span-2 space-y-4">
          {/* Cabecera del ticket */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-xl font-bold text-white leading-snug">{ticket.title}</h1>
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full border flex-shrink-0 ${STATUS_CONFIG[ticket.status].badge}`}>
                {STATUS_CONFIG[ticket.status].label}
              </span>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
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

          {/* Mensajes */}
          <div className="space-y-3">
            {ticket.messages.map((msg) => (
              <div
                key={msg.id}
                className={`rounded-2xl border p-4 ${
                  msg.isInternal
                    ? "bg-amber-950/30 border-amber-900/50"
                    : "bg-slate-900 border-slate-800"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">
                    {(msg.user?.name ?? "?")[0].toUpperCase()}
                  </div>
                  <span className="text-slate-200 text-sm font-medium">{msg.user?.name ?? "Sistema"}</span>
                  <span className="text-slate-600 text-xs">
                    {CHANNEL_ICON[msg.channel]} ·{" "}
                    {new Date(msg.createdAt).toLocaleString("es-CO", {
                      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                  {msg.isInternal && (
                    <span className="ml-auto text-xs font-medium text-amber-400 bg-amber-900/50 px-2 py-0.5 rounded-full">
                      Nota interna
                    </span>
                  )}
                </div>
                <p className="text-slate-300 text-sm whitespace-pre-wrap leading-relaxed pl-9">
                  {msg.body}
                </p>
              </div>
            ))}
          </div>

          {/* Formulario de respuesta */}
          {!isClosed ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-slate-300">Agregar respuesta</h3>
                <button
                  onClick={() => setIsInternal((v) => !v)}
                  className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
                    isInternal
                      ? "border-amber-700 bg-amber-900/40 text-amber-300"
                      : "border-slate-700 text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {isInternal ? "🔒 Nota interna" : "🌐 Respuesta pública"}
                </button>
              </div>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                placeholder={isInternal ? "Nota interna (solo visible para el equipo)..." : "Escribe tu respuesta..."}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              {addMessage.error && (
                <p className="text-red-400 text-xs mt-2">{addMessage.error.message}</p>
              )}
              <button
                onClick={() => addMessage.mutate({ ticketId, body: reply, isInternal })}
                disabled={reply.trim().length === 0 || addMessage.isPending}
                className="mt-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm"
              >
                {addMessage.isPending ? "Enviando..." : "Enviar respuesta"}
              </button>
            </div>
          ) : (
            <div className="text-center py-4 text-slate-600 text-sm border border-slate-800 rounded-2xl">
              Este ticket está cerrado. <button onClick={() => updateStatus.mutate({ id: ticketId, status: "OPEN" })} className="text-blue-400 hover:underline">Reabrir</button>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">
          {/* Estado */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Estado</h3>
            <div className="space-y-1.5">
              {STATUS_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => updateStatus.mutate({ id: ticketId, status: opt.value as "OPEN" | "IN_PROGRESS" | "WAITING" | "RESOLVED" | "CLOSED" })}
                  disabled={updateStatus.isPending}
                  className={`w-full text-left px-3 py-2 rounded-xl text-sm transition-colors ${
                    ticket.status === opt.value
                      ? `font-semibold ${STATUS_CONFIG[opt.value].badge} border`
                      : "text-slate-400 hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Prioridad */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Prioridad</h3>
            <span className={`font-semibold text-sm ${PRIORITY_CONFIG[ticket.priority].color}`}>
              {PRIORITY_CONFIG[ticket.priority].label}
            </span>
          </div>

          {/* Asignado a */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Asignado a</h3>
            <select
              value={ticket.assignedToId ?? ""}
              onChange={(e) => assign.mutate({ id: ticketId, userId: e.target.value || null })}
              disabled={assign.isPending}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Sin asignar</option>
              {agents?.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Info */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Información</h3>
            <div>
              <p className="text-slate-600 text-xs">Creado</p>
              <p className="text-slate-300 text-sm">
                {new Date(ticket.createdAt).toLocaleDateString("es-CO", {
                  day: "2-digit", month: "long", year: "numeric",
                })}
              </p>
            </div>
            <div>
              <p className="text-slate-600 text-xs">Última actualización</p>
              <p className="text-slate-300 text-sm">
                {new Date(ticket.updatedAt).toLocaleDateString("es-CO", {
                  day: "2-digit", month: "long", year: "numeric",
                })}
              </p>
            </div>
            {ticket.closedAt && (
              <div>
                <p className="text-slate-600 text-xs">Cerrado</p>
                <p className="text-slate-300 text-sm">
                  {new Date(ticket.closedAt).toLocaleDateString("es-CO", {
                    day: "2-digit", month: "long", year: "numeric",
                  })}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
