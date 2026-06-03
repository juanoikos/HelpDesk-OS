"use client";

import { trpc } from "@/trpc/react";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
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

// ─── Vista Kanban ─────────────────────────────────────────────────────────────

const KANBAN_COLUMNS: { status: string; label: string; color: string; headerColor: string }[] = [
  { status: "NEW",              label: "Nuevos",           color: "border-slate-600",  headerColor: "bg-slate-700" },
  { status: "ASSIGNED",         label: "Asignados",        color: "border-blue-700",   headerColor: "bg-blue-900" },
  { status: "IN_DIAGNOSIS",     label: "Diagnóstico",      color: "border-cyan-700",   headerColor: "bg-cyan-900" },
  { status: "IN_ANALYSIS",      label: "Análisis",         color: "border-indigo-700", headerColor: "bg-indigo-900" },
  { status: "IN_PROGRESS",      label: "En progreso",      color: "border-amber-700",  headerColor: "bg-amber-900" },
  { status: "WAITING",          label: "En espera",        color: "border-purple-700", headerColor: "bg-purple-900" },
  { status: "PENDING_USER",     label: "Pend. usuario",    color: "border-orange-700", headerColor: "bg-orange-900" },
  { status: "PENDING_PROVIDER", label: "Pend. proveedor",  color: "border-rose-700",   headerColor: "bg-rose-900" },
  { status: "ESCALATED",        label: "Escalados",        color: "border-red-700",    headerColor: "bg-red-900" },
  { status: "RESOLVED",         label: "Resueltos",        color: "border-green-700",  headerColor: "bg-green-900" },
];

type TicketItem = {
  id: string;
  number: number;
  title: string;
  status: string;
  priority: string;
  createdAt: Date | string;
  slaDeadline?: Date | string | null;
  slaBreached?: boolean;
  assignedTo?: { id: string; name: string } | null;
  requesterName?: string | null;
  createdBy: { id: string; name: string };
  _count: { messages: number };
};

function KanbanCard({
  ticket,
  onDragStart,
}: {
  ticket: TicketItem;
  onDragStart: (e: React.DragEvent, ticketId: string) => void;
}) {
  const now = new Date();
  const deadline = ticket.slaDeadline ? new Date(ticket.slaDeadline as string) : null;
  const hoursLeft = deadline ? Math.round((deadline.getTime() - now.getTime()) / 36e5) : null;

  const slaBadge = ticket.slaBreached || (hoursLeft !== null && hoursLeft < 0)
    ? <span className="text-red-400 text-xs font-medium">⚠ SLA vencido</span>
    : hoursLeft !== null && hoursLeft < 4
    ? <span className="text-amber-400 text-xs">⏱ {hoursLeft}h</span>
    : null;

  const priorityColors: Record<string, string> = {
    LOW: "text-slate-500", MEDIUM: "text-blue-400", HIGH: "text-orange-400", URGENT: "text-red-400",
  };
  const priorityLabels: Record<string, string> = {
    LOW: "Baja", MEDIUM: "Media", HIGH: "Alta", URGENT: "Urgente",
  };

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, ticket.id)}
      className="bg-slate-800 border border-slate-700 rounded-xl p-3 cursor-grab active:cursor-grabbing hover:border-slate-500 transition-colors select-none"
    >
      <div className="flex items-start justify-between gap-1 mb-2">
        <Link
          href={`/tickets/${ticket.id}`}
          onClick={(e) => e.stopPropagation()}
          className="text-slate-200 text-sm font-medium hover:text-blue-400 transition-colors leading-tight line-clamp-2"
        >
          {ticket.title}
        </Link>
        <span className="text-slate-600 font-mono text-xs shrink-0 mt-0.5">
          #{String(ticket.number).padStart(3, "0")}
        </span>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-2">
        <span className={`text-xs font-semibold ${priorityColors[ticket.priority] ?? "text-slate-400"}`}>
          {priorityLabels[ticket.priority] ?? ticket.priority}
        </span>
        {slaBadge}
        {ticket._count.messages > 0 && (
          <span className="text-slate-600 text-xs">💬 {ticket._count.messages}</span>
        )}
      </div>

      {ticket.assignedTo && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-slate-600 flex items-center justify-center text-[9px] text-slate-300 shrink-0">
            {ticket.assignedTo.name.charAt(0).toUpperCase()}
          </div>
          <span className="text-slate-500 text-xs truncate">{ticket.assignedTo.name}</span>
        </div>
      )}
    </div>
  );
}

function KanbanBoard({ tickets }: { tickets: TicketItem[] }) {
  const utils = trpc.useUtils();
  const updateStatus = trpc.tickets.updateStatus.useMutation({
    onMutate: async ({ id, status }) => {
      // Optimistic update
      await utils.tickets.list.cancel();
      const prev = utils.tickets.list.getData(undefined);
      utils.tickets.list.setData(undefined, (old) =>
        old?.map((t) => t.id === id ? { ...t, status } : t)
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) utils.tickets.list.setData(undefined, ctx.prev);
    },
    onSettled: () => {
      utils.tickets.list.invalidate();
    },
  });

  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const dragTicketId = useRef<string | null>(null);

  function handleDragStart(e: React.DragEvent, ticketId: string) {
    dragTicketId.current = ticketId;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, status: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverCol(status);
  }

  function handleDrop(e: React.DragEvent, status: string) {
    e.preventDefault();
    setDragOverCol(null);
    const id = dragTicketId.current;
    if (!id) return;
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket || ticket.status === status) return;
    updateStatus.mutate({
      id,
      status: status as "NEW"|"ASSIGNED"|"IN_DIAGNOSIS"|"IN_ANALYSIS"|"IN_PROGRESS"|"WAITING"|"PENDING_USER"|"PENDING_PROVIDER"|"ESCALATED"|"RESOLVED"|"CLOSED",
    });
    dragTicketId.current = null;
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOverCol(null);
    }
  }

  const byStatus = KANBAN_COLUMNS.reduce<Record<string, TicketItem[]>>((acc, col) => {
    acc[col.status] = tickets.filter((t) => t.status === col.status);
    return acc;
  }, {});

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex gap-3 min-w-max">
        {KANBAN_COLUMNS.map((col) => {
          const colTickets = byStatus[col.status] ?? [];
          const isOver = dragOverCol === col.status;
          return (
            <div
              key={col.status}
              className={`w-64 flex flex-col rounded-xl border-2 transition-colors ${col.color} ${isOver ? "bg-slate-800/60" : "bg-slate-900/40"}`}
              onDragOver={(e) => handleDragOver(e, col.status)}
              onDrop={(e) => handleDrop(e, col.status)}
              onDragLeave={handleDragLeave}
            >
              {/* Column header */}
              <div className={`flex items-center justify-between px-3 py-2 rounded-t-lg ${col.headerColor}`}>
                <span className="text-white text-xs font-semibold uppercase tracking-wide">{col.label}</span>
                <span className="bg-black/20 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                  {colTickets.length}
                </span>
              </div>

              {/* Cards */}
              <div
                className={`flex-1 p-2 space-y-2 min-h-[120px] rounded-b-lg transition-colors ${isOver ? "bg-slate-700/30" : ""}`}
              >
                {colTickets.length === 0 ? (
                  <div className="flex items-center justify-center h-16 text-slate-700 text-xs">
                    {isOver ? "Suelta aquí" : "Sin tickets"}
                  </div>
                ) : (
                  colTickets.map((ticket) => (
                    <KanbanCard
                      key={ticket.id}
                      ticket={ticket}
                      onDragStart={handleDragStart}
                    />
                  ))
                )}
                {isOver && colTickets.length > 0 && (
                  <div className="h-1 rounded-full bg-blue-500 opacity-60" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function TicketsPage() {
  const searchParams = useSearchParams();
  const [statusFilter,   setStatusFilter]   = useState<string | undefined>(undefined);
  const [search,         setSearch]         = useState("");
  const [assignedToId,   setAssignedToId]   = useState("");
  const [groupId,        setGroupId]        = useState("");
  const [dateRange,      setDateRange]      = useState("");
  const [showFilters,    setShowFilters]    = useState(false);
  const [view,           setView]           = useState<"list" | "kanban">("list");

  const { data: agents } = trpc.tickets.listAgents.useQuery();
  const { data: groups } = trpc.teams.groups.list.useQuery();

  // Leer filtro inicial desde URL (?status=IN_PROGRESS o ?status=open)
  useEffect(() => {
    const s = searchParams.get("status");
    if (s === "open" || s === null) setStatusFilter(s === "open" ? "open" : undefined);
    else setStatusFilter(s);
  }, [searchParams]);

  // Calcular rango de fechas
  const dateFrom = dateRange === "7d"  ? new Date(Date.now() - 7  * 86400000).toISOString()
                 : dateRange === "30d" ? new Date(Date.now() - 30 * 86400000).toISOString()
                 : dateRange === "90d" ? new Date(Date.now() - 90 * 86400000).toISOString()
                 : undefined;

  const queryStatus = (!statusFilter || statusFilter === "open")
    ? undefined
    : statusFilter as "NEW"|"ASSIGNED"|"IN_DIAGNOSIS"|"IN_ANALYSIS"|"IN_PROGRESS"|"WAITING"|"PENDING_USER"|"PENDING_PROVIDER"|"ESCALATED"|"RESOLVED"|"CLOSED";

  const queryInput = {
    ...(queryStatus    ? { status:       queryStatus }    : {}),
    ...(search.trim()  ? { search:       search.trim() }  : {}),
    ...(assignedToId   ? { assignedToId }                 : {}),
    ...(groupId        ? { groupId }                      : {}),
    ...(dateFrom       ? { dateFrom }                     : {}),
  };

  const { data: rawTickets, isLoading } = trpc.tickets.list.useQuery(
    Object.keys(queryInput).length ? queryInput : undefined
  );

  const tickets = statusFilter === "open"
    ? rawTickets?.filter((t) => OPEN_STATUSES.includes(t.status))
    : rawTickets;

  // Conteos para los tabs (sin filtros de búsqueda)
  const { data: all } = trpc.tickets.list.useQuery(undefined);
  const counts = (all ?? []).reduce<Record<string, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {});

  const hasActiveFilters = search || assignedToId || groupId || dateRange;

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Tickets de soporte</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {all?.length ?? 0} tickets en total
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Toggle vista */}
          <div className="flex bg-slate-800 border border-slate-700 rounded-lg p-0.5">
            <button
              onClick={() => setView("list")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === "list"
                  ? "bg-slate-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ☰ Lista
            </button>
            <button
              onClick={() => setView("kanban")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === "kanban"
                  ? "bg-slate-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ⬛ Kanban
            </button>
          </div>
          <Link
            href="/tickets/new"
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
          >
            + Nuevo ticket
          </Link>
        </div>
      </div>

      {/* Barra de búsqueda + filtros avanzados */}
      <div className="mb-4 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título o #número..."
              className="w-full bg-slate-900 border border-slate-700 rounded-xl text-white placeholder-slate-500 pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs">✕</button>
            )}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
              hasActiveFilters
                ? "border-blue-600 bg-blue-950 text-blue-300"
                : "border-slate-700 bg-slate-900 text-slate-400 hover:text-slate-200"
            }`}
          >
            ⚙ Filtros {hasActiveFilters && <span className="bg-blue-600 text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">!</span>}
          </button>
          {hasActiveFilters && (
            <button onClick={() => { setSearch(""); setAssignedToId(""); setGroupId(""); setDateRange(""); }}
              className="px-3 py-2 rounded-xl border border-slate-700 text-slate-500 hover:text-slate-300 text-sm transition-colors">
              Limpiar
            </button>
          )}
        </div>

        {showFilters && (
          <div className="flex gap-3 flex-wrap bg-slate-900 border border-slate-800 rounded-xl p-3">
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs text-slate-500">Agente asignado</label>
              <select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg text-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">Todos</option>
                <option value="unassigned">Sin asignar</option>
                {agents?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs text-slate-500">Grupo</label>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg text-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">Todos</option>
                {groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs text-slate-500">Período</label>
              <select value={dateRange} onChange={(e) => setDateRange(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg text-slate-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="">Todos los tiempos</option>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="90d">Últimos 90 días</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Tabs de filtro — solo en vista Lista */}
      {view === "list" && <div className="flex gap-1 mb-6 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit flex-wrap">
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
      </div>}

      {/* Kanban: ocultar tabs de estado y mostrar board */}
      {view === "kanban" && (
        <>
          {isLoading ? (
            <div className="text-slate-500 text-sm py-8 text-center">Cargando tickets…</div>
          ) : (
            <KanbanBoard tickets={(rawTickets ?? []) as TicketItem[]} />
          )}
        </>
      )}

      {/* Contenido lista */}
      {view === "list" && isLoading ? (
        <div className="text-slate-500 text-sm py-8 text-center">Cargando tickets...</div>
      ) : view === "list" && !tickets?.length ? (
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
      ) : view === "list" && (
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
              {(tickets ?? []).map((ticket) => (
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
