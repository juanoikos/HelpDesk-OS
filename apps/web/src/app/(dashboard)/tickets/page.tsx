"use client";

import { trpc } from "@/trpc/react";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";

// ─── Configuración visual ─────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  NEW:               { label: "Nuevo",                  badge: "bg-slate-700 text-slate-200" },
  ASSIGNED:          { label: "Asignado",               badge: "bg-blue-900 text-blue-300" },
  IN_DIAGNOSIS:      { label: "En diagnóstico",         badge: "bg-cyan-900 text-cyan-300" },
  IN_ANALYSIS:       { label: "En análisis",            badge: "bg-indigo-900 text-indigo-300" },
  IN_PROGRESS:       { label: "En progreso",            badge: "bg-amber-900 text-amber-300" },
  WAITING:           { label: "En espera",              badge: "bg-purple-900 text-purple-300" },
  PENDING_USER:      { label: "Pendiente usuario",      badge: "bg-orange-900 text-orange-300" },
  PENDING_PROVIDER:  { label: "Pendiente proveedor",    badge: "bg-rose-900 text-rose-300" },
  ESCALATED:         { label: "Escalado",               badge: "bg-red-900 text-red-300" },
  RESOLVED:          { label: "Resuelto",               badge: "bg-green-900 text-green-300" },
  CLOSED:            { label: "Cerrado",                badge: "bg-slate-800 text-slate-500" },
};

const TYPE_LABEL: Record<string, string> = {
  INCIDENT:           "🔴 Incidencia",
  REQUEST:            "🔵 Solicitud",
  ACCESS_PERMISSIONS: "🔑 Acceso y permisos",
  PURCHASE:           "🛒 Compra / insumo",
  QUERY:              "💬 Consulta",
  PROBLEM:            "🔶 Problema",
  CHANGE:             "🟡 Cambio",
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  LOW:    { label: "Baja",    color: "text-slate-400" },
  MEDIUM: { label: "Media",   color: "text-blue-400" },
  HIGH:   { label: "Alta",    color: "text-orange-400" },
  URGENT: { label: "Urgente", color: "text-red-400" },
};

const STATUS_TABS = [
  { value: undefined,          label: "Todos" },
  { value: "open",             label: "Abiertos" },
  { value: "NEW",              label: "Nuevos" },
  { value: "ASSIGNED",         label: "Asignados" },
  { value: "IN_DIAGNOSIS",     label: "En diagnóstico" },
  { value: "IN_ANALYSIS",      label: "En análisis" },
  { value: "IN_PROGRESS",      label: "En progreso" },
  { value: "WAITING",          label: "En espera" },
  { value: "PENDING_USER",     label: "Pend. usuario" },
  { value: "PENDING_PROVIDER", label: "Pend. proveedor" },
  { value: "ESCALATED",        label: "Escalados" },
  { value: "RESOLVED",         label: "Resueltos" },
  { value: "CLOSED",           label: "Cerrados" },
];

// ─── Página ───────────────────────────────────────────────────────────────────

const OPEN_STATUSES = ["NEW","ASSIGNED","IN_DIAGNOSIS","IN_ANALYSIS","IN_PROGRESS","WAITING","PENDING_USER","PENDING_PROVIDER","ESCALATED"];

export default function TicketsPage() {
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  // Leer filtro inicial desde URL (?status=IN_PROGRESS o ?status=open)
  useEffect(() => {
    const s = searchParams.get("status");
    if (s === "open" || s === null) setStatusFilter(s === "open" ? "open" : undefined);
    else setStatusFilter(s);
  }, [searchParams]);

  // "open" es un filtro especial del dashboard → no se pasa al router (se filtra en cliente)
  const queryStatus = (!statusFilter || statusFilter === "open")
    ? undefined
    : statusFilter as "NEW"|"ASSIGNED"|"IN_DIAGNOSIS"|"IN_ANALYSIS"|"IN_PROGRESS"|"WAITING"|"PENDING_USER"|"PENDING_PROVIDER"|"ESCALATED"|"RESOLVED"|"CLOSED";

  const { data: rawTickets, isLoading } = trpc.tickets.list.useQuery(
    queryStatus ? { status: queryStatus } : undefined
  );

  // Si el filtro es "open", filtrar en cliente los estados abiertos
  const tickets = statusFilter === "open"
    ? rawTickets?.filter((t) => OPEN_STATUSES.includes(t.status))
    : rawTickets;

  // Conteos para los tabs
  const { data: all } = trpc.tickets.list.useQuery(undefined);
  const counts = (all ?? []).reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tickets de soporte</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {all?.length ?? 0} tickets en total
          </p>
        </div>
        <Link
          href="/tickets/new"
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          + Nuevo ticket
        </Link>
      </div>

      {/* Tabs de filtro */}
      <div className="flex gap-1 mb-6 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit flex-wrap">
        {STATUS_TABS.map((tab) => {
          const count = !tab.value
            ? (all?.length ?? 0)
            : tab.value === "open"
              ? (all ?? []).filter((t) => OPEN_STATUSES.includes(t.status)).length
              : (counts[tab.value] ?? 0);
          return (
            <button
              key={tab.label}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                statusFilter === tab.value
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  statusFilter === tab.value ? "bg-slate-600 text-slate-200" : "bg-slate-800 text-slate-500"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      {isLoading ? (
        <div className="text-slate-500 text-sm py-8 text-center">Cargando tickets...</div>
      ) : !tickets?.length ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">🎫</div>
          <p className="text-white font-semibold text-lg">No hay tickets</p>
          <p className="text-slate-500 text-sm mt-1 mb-6">
            {statusFilter ? "No hay tickets con ese estado." : "Crea el primer ticket con el botón de arriba."}
          </p>
          {!statusFilter && (
            <Link
              href="/tickets/new"
              className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2.5 rounded-xl text-sm transition-colors"
            >
              + Crear primer ticket
            </Link>
          )}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3 w-16">#</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">Título / Descripción</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">Tipo · Categoría</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">Prioridad</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">Estado</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-4 py-3">SLA</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">Reportado por</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">Asignado a</th>
                <th className="text-left text-xs font-medium text-slate-500 uppercase tracking-wide px-5 py-3">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className={`border-b border-slate-800 last:border-0 transition-colors ${
                    ticket.status === "CLOSED"
                      ? "bg-slate-800/60 opacity-60 hover:opacity-80"
                      : "hover:bg-slate-800/40"
                  }`}
                >
                  <td className="px-5 py-4">
                    <Link href={`/tickets/${ticket.id}`} className="font-mono text-slate-500 text-sm hover:text-slate-300">
                      #{String(ticket.number).padStart(3, "0")}
                    </Link>
                  </td>
                  <td className="px-5 py-4 max-w-xs">
                    <Link href={`/tickets/${ticket.id}`} className="text-white text-sm font-medium hover:text-blue-400 transition-colors block">
                      {ticket.title}
                    </Link>
                    {/* Descripción: subcategoría técnica o whatNeeded */}
                    {(ticket.subcategory || ticket.whatNeeded) && (
                      <span className="text-slate-500 text-xs mt-0.5 block truncate">
                        {ticket.subcategory ?? ticket.whatNeeded}
                      </span>
                    )}
                    {ticket._count.messages > 0 && (
                      <span className="text-slate-600 text-xs mt-0.5 block">
                        💬 {ticket._count.messages} mensaje{ticket._count.messages > 1 ? "s" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    {/* Tipo de ticket */}
                    <span className="text-xs text-slate-400 block">
                      {TYPE_LABEL[ticket.type] ?? ticket.type}
                    </span>
                    {/* Categoría: primero la categoría BD, si no la técnica */}
                    {ticket.category ? (
                      <span className="flex items-center gap-1.5 text-sm text-slate-300 mt-0.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: ticket.category.color ?? "#64748b" }} />
                        {ticket.category.name}
                      </span>
                    ) : ticket.techCategory ? (
                      <span className="text-slate-400 text-xs mt-0.5 block">{ticket.techCategory}</span>
                    ) : (
                      <span className="text-slate-700 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-semibold ${PRIORITY_CONFIG[ticket.priority].color}`}>
                      {PRIORITY_CONFIG[ticket.priority].label}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_CONFIG[ticket.status].badge}`}>
                      {STATUS_CONFIG[ticket.status].label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {ticket.slaDeadline ? (() => {
                      const now = new Date();
                      const deadline = new Date(ticket.slaDeadline);
                      const hoursLeft = Math.round((deadline.getTime() - now.getTime()) / 36e5);
                      if (ticket.slaBreached || hoursLeft < 0) {
                        return <span className="text-red-400 font-medium">⚠ Vencido</span>;
                      }
                      if (hoursLeft < 4) {
                        return <span className="text-amber-400 font-medium">⏱ {hoursLeft}h</span>;
                      }
                      return <span className="text-slate-500">{hoursLeft}h</span>;
                    })() : <span className="text-slate-700">—</span>}
                  </td>
                  {/* Reportado por: solicitante si existe, si no quien lo creó */}
                  <td className="px-5 py-4">
                    <span className="text-slate-300 text-sm block">
                      {ticket.requesterName ?? ticket.createdBy.name}
                    </span>
                    {ticket.requesterName && (
                      <span className="text-slate-600 text-xs">vía {ticket.createdBy.name}</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-slate-400 text-sm">
                    {ticket.assignedTo?.name ?? <span className="text-slate-600">Sin asignar</span>}
                  </td>
                  <td className="px-5 py-4 text-slate-500 text-xs whitespace-nowrap">
                    {new Date(ticket.createdAt).toLocaleDateString("es-CO", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
