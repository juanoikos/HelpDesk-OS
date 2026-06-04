"use client";

import { trpc } from "@/trpc/react";
import { useState, useEffect } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(date: Date | string | null): string {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours   = Math.floor(diff / 3600000);
  if (diff < 60000)  return "ahora";
  if (minutes < 60)  return `hace ${minutes} min`;
  if (hours < 24)    return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

function defaultPort(checkType: string): number {
  switch (checkType) {
    case "https": return 443;
    case "http":  return 80;
    case "tcp":   return 80;
    default:      return 0;
  }
}

// ── Status components ─────────────────────────────────────────────────────────

function StatusDot({ status, pulse }: { status: string; pulse?: boolean }) {
  const colors: Record<string, string> = {
    up:      "bg-green-500",
    down:    "bg-red-500",
    timeout: "bg-orange-500",
    unknown: "bg-slate-600",
  };
  const color = colors[status] ?? colors.unknown;
  return (
    <span className="relative inline-flex h-2.5 w-2.5">
      {pulse && status === "up" && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />
    </span>
  );
}

function UptimeBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate-600 text-xs">—</span>;
  const color = pct >= 99 ? "text-green-400" : pct >= 95 ? "text-yellow-400" : "text-red-400";
  return <span className={`text-xs font-mono font-semibold ${color}`}>{pct}%</span>;
}

function CheckTypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    http:  "bg-blue-900/50 text-blue-300 border-blue-800",
    https: "bg-green-900/50 text-green-300 border-green-800",
    tcp:   "bg-purple-900/50 text-purple-300 border-purple-800",
    ping:  "bg-slate-700 text-slate-300 border-slate-600",
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border ${colors[type] ?? colors.ping}`}>
      {type.toUpperCase()}
    </span>
  );
}

function NetworkBadge({ type }: { type: string }) {
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border ${
      type === "wan"
        ? "bg-orange-900/40 text-orange-300 border-orange-800"
        : "bg-cyan-900/40 text-cyan-300 border-cyan-800"
    }`}>
      {type.toUpperCase()}
    </span>
  );
}

// Mini timeline de últimos N checks (puntos de colores)
function CheckTimeline({ checks }: { checks: { status: string }[] }) {
  if (checks.length === 0) return <span className="text-slate-700 text-xs">Sin datos</span>;
  const reversed = [...checks].reverse(); // mostrar más antiguo a la izquierda
  return (
    <div className="flex items-center gap-0.5">
      {reversed.map((c, i) => (
        <span
          key={i}
          className={`inline-block w-1.5 h-4 rounded-sm ${
            c.status === "up"      ? "bg-green-500" :
            c.status === "timeout" ? "bg-orange-500" :
            c.status === "down"    ? "bg-red-500" :
            "bg-slate-700"
          }`}
          title={c.status}
        />
      ))}
    </div>
  );
}

// ── Formulario add/edit ───────────────────────────────────────────────────────

interface TargetForm {
  name:        string;
  host:        string;
  checkType:   "http" | "https" | "tcp" | "ping";
  port:        string;
  httpPath:    string;
  interval:    number;
  timeout:     number;
  retries:     number;
  networkType: "lan" | "wan";
  agentHost:   string;
}

const EMPTY_FORM: TargetForm = {
  name:        "",
  host:        "",
  checkType:   "http",
  port:        "",
  httpPath:    "/",
  interval:    60,
  timeout:     5000,
  retries:     2,
  networkType: "wan",
  agentHost:   "",
};

function TargetFormModal({
  initial,
  agents,
  onClose,
  onSave,
  saving,
}: {
  initial:  TargetForm;
  agents:   string[];
  onClose:  () => void;
  onSave:   (form: TargetForm) => void;
  saving:   boolean;
}) {
  const [form, setForm] = useState<TargetForm>(initial);

  function set(key: keyof TargetForm, val: string | number) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg mx-4 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-800">
          <h2 className="text-white font-semibold">{initial.name ? "Editar target" : "Nuevo target de monitoreo"}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Nombre descriptivo</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Router sede norte, DVR bodega, Portal web..."
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Host */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">Host (IP o dominio)</label>
            <input
              type="text"
              value={form.host}
              onChange={(e) => set("host", e.target.value)}
              placeholder="192.168.1.1  /  192.168.0.50  /  empresa.com"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
            />
          </div>

          {/* Tipo de check */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Tipo de check</label>
            <div className="grid grid-cols-4 gap-2">
              {(["http", "https", "tcp", "ping"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => set("checkType", t)}
                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${
                    form.checkType === t
                      ? "bg-blue-600 border-blue-500 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
            <p className="text-slate-600 text-xs mt-1.5">
              {form.checkType === "http"  && "Verifica que el puerto 80 responde con código HTTP < 500"}
              {form.checkType === "https" && "Verifica que el puerto 443 responde con HTTPS válido"}
              {form.checkType === "tcp"   && "Verifica que el puerto TCP esté abierto y acepte conexiones"}
              {form.checkType === "ping"  && "Envía ICMP echo request — no requiere puerto abierto"}
            </p>
          </div>

          {/* Puerto + path */}
          <div className="flex gap-3">
            <div className="w-32">
              <label className="block text-xs text-slate-400 mb-1">Puerto</label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => set("port", e.target.value)}
                placeholder={String(defaultPort(form.checkType) || "—")}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 font-mono"
                disabled={form.checkType === "ping"}
              />
            </div>
            {(form.checkType === "http" || form.checkType === "https") && (
              <div className="flex-1">
                <label className="block text-xs text-slate-400 mb-1">Path HTTP</label>
                <input
                  type="text"
                  value={form.httpPath}
                  onChange={(e) => set("httpPath", e.target.value)}
                  placeholder="/health"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 font-mono"
                />
              </div>
            )}
          </div>

          {/* Intervalo + timeout */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-slate-400 mb-1">Intervalo entre checks</label>
              <select
                value={form.interval}
                onChange={(e) => set("interval", Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value={15}>15 segundos</option>
                <option value={30}>30 segundos</option>
                <option value={60}>1 minuto</option>
                <option value={120}>2 minutos</option>
                <option value={300}>5 minutos</option>
                <option value={600}>10 minutos</option>
                <option value={1800}>30 minutos</option>
              </select>
            </div>
            <div className="w-36">
              <label className="block text-xs text-slate-400 mb-1">Timeout</label>
              <select
                value={form.timeout}
                onChange={(e) => set("timeout", Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value={2000}>2 s</option>
                <option value={5000}>5 s</option>
                <option value={10000}>10 s</option>
                <option value={15000}>15 s</option>
                <option value={30000}>30 s</option>
              </select>
            </div>
            <div className="w-28">
              <label className="block text-xs text-slate-400 mb-1">Reintentos</label>
              <select
                value={form.retries}
                onChange={(e) => set("retries", Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {[0, 1, 2, 3, 5].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Tipo de red */}
          <div>
            <label className="block text-xs text-slate-400 mb-2">Dónde se ejecuta el check</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set("networkType", "wan")}
                className={`py-3 px-3 rounded-lg text-sm border transition-colors text-left ${
                  form.networkType === "wan"
                    ? "bg-orange-900/40 border-orange-700 text-orange-200"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                }`}
              >
                <div className="font-semibold mb-0.5">🌐 WAN</div>
                <div className="text-xs opacity-70">El servidor HelpDesk chequea directamente — ideal para IPs públicas, dominios, sitios web</div>
              </button>
              <button
                type="button"
                onClick={() => set("networkType", "lan")}
                className={`py-3 px-3 rounded-lg text-sm border transition-colors text-left ${
                  form.networkType === "lan"
                    ? "bg-cyan-900/40 border-cyan-700 text-cyan-200"
                    : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white"
                }`}
              >
                <div className="font-semibold mb-0.5">🏢 LAN</div>
                <div className="text-xs opacity-70">El agente LAN instalado en la sede chequea — para IPs privadas, equipos internos</div>
              </button>
            </div>
          </div>

          {/* Agente LAN */}
          {form.networkType === "lan" && (
            <div>
              <label className="block text-xs text-slate-400 mb-1">Agente LAN (opcional)</label>
              {agents.length > 0 ? (
                <select
                  value={form.agentHost}
                  onChange={(e) => set("agentHost", e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="">Cualquier agente disponible</option>
                  {agents.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              ) : (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-sm text-slate-500">
                  No hay agentes LAN registrados aún.{" "}
                  <a href="/api/agent/monitor-agent" className="text-blue-400 hover:underline">
                    Descarga el agente
                  </a>{" "}
                  y ejecútalo en un equipo de la red.
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-slate-800">
          <button onClick={onClose} className="text-slate-400 hover:text-white text-sm px-4 py-2 rounded-lg hover:bg-slate-800 transition-colors">
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || !form.name || !form.host}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg font-medium transition-colors"
          >
            {saving ? "Guardando…" : "Guardar target"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function MonitoringPage() {
  const utils = trpc.useUtils();

  const targetsQ = trpc.monitoring.listTargets.useQuery(undefined, { refetchInterval: 15_000 });
  const agentsQ  = trpc.monitoring.listAgents.useQuery();

  const createMut = trpc.monitoring.createTarget.useMutation({
    onSuccess: () => { utils.monitoring.listTargets.invalidate(); setShowForm(false); },
  });
  const toggleMut = trpc.monitoring.toggleTarget.useMutation({
    onSuccess: () => utils.monitoring.listTargets.invalidate(),
  });
  const deleteMut = trpc.monitoring.deleteTarget.useMutation({
    onSuccess: () => utils.monitoring.listTargets.invalidate(),
  });
  const triggerMut = trpc.monitoring.triggerCheck.useMutation({
    onSuccess: () => utils.monitoring.listTargets.invalidate(),
  });

  const [showForm,   setShowForm]   = useState(false);
  const [activeTab,  setActiveTab]  = useState<"all" | "lan" | "wan" | "down">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const targets = targetsQ.data ?? [];
  const agents  = agentsQ.data  ?? [];

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total   = targets.length;
  const upCount = targets.filter((t) => t.status === "up").length;
  const downCount = targets.filter((t) => t.status === "down" || t.status === "timeout").length;
  const lanCount  = targets.filter((t) => t.networkType === "lan").length;
  const wanCount  = targets.filter((t) => t.networkType === "wan").length;

  // ── Filtrado ───────────────────────────────────────────────────────────────
  const filtered = targets.filter((t) => {
    if (activeTab === "lan")  return t.networkType === "lan";
    if (activeTab === "wan")  return t.networkType === "wan";
    if (activeTab === "down") return t.status === "down" || t.status === "timeout";
    return true;
  });

  // Auto-refresh title indicator
  useEffect(() => {
    if (downCount > 0) {
      document.title = `⚠ ${downCount} caído${downCount > 1 ? "s" : ""} — Monitor`;
    } else {
      document.title = "Monitor — HelpDesk OS";
    }
    return () => { document.title = "HelpDesk OS"; };
  }, [downCount]);

  function handleSave(form: TargetForm) {
    createMut.mutate({
      name:        form.name,
      host:        form.host,
      checkType:   form.checkType,
      port:        form.port ? Number(form.port) : undefined,
      httpPath:    form.httpPath || "/",
      interval:    form.interval,
      timeout:     form.timeout,
      retries:     form.retries,
      networkType: form.networkType,
      agentHost:   form.agentHost || undefined,
    });
  }

  return (
    <div>
      {/* ── Modal agregar ────────────────────────────────────────────────────── */}
      {showForm && (
        <TargetFormModal
          initial={EMPTY_FORM}
          agents={agents}
          onClose={() => setShowForm(false)}
          onSave={handleSave}
          saving={createMut.isPending}
        />
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-semibold">📡 Monitor de Red</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {total} target{total !== 1 ? "s" : ""} monitoreados — {upCount} activos
            {downCount > 0 && (
              <span className="text-red-400 font-medium ml-1">· ⚠ {downCount} caído{downCount > 1 ? "s" : ""}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/agent/monitor-agent"
            download="helpdesk-monitor.ps1"
            className="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5"
          >
            ⬇ Agente LAN
          </a>
          <button
            onClick={() => setShowForm(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-1.5"
          >
            + Agregar target
          </button>
        </div>
      </div>

      {/* ── Stats cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total targets",   value: total,     color: "text-white" },
          { label: "Activos (UP)",     value: upCount,   color: "text-green-400" },
          { label: "Caídos / Timeout", value: downCount, color: downCount > 0 ? "text-red-400" : "text-slate-500" },
          { label: "LAN / WAN",        value: `${lanCount} / ${wanCount}`, color: "text-slate-300", isText: true },
        ].map(({ label, value, color, isText }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className={`${isText ? "text-2xl" : "text-3xl"} font-bold ${color}`}>{value}</div>
            <div className="text-slate-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-4 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
        {(["all", "lan", "wan", "down"] as const).map((tab) => {
          const counts = { all: total, lan: lanCount, wan: wanCount, down: downCount };
          const labels = { all: "Todos", lan: "🏢 LAN", wan: "🌐 WAN", down: "🔴 Caídos" };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                activeTab === tab
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}
            >
              {labels[tab]}
              {counts[tab] > 0 && (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab ? "bg-slate-600 text-slate-200" : "bg-slate-800 text-slate-500"
                }`}>
                  {counts[tab]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Lista de targets ─────────────────────────────────────────────────── */}
      {targetsQ.isLoading ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-500">
          Cargando…
        </div>
      ) : total === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-16 text-center">
          <div className="text-4xl mb-4">📡</div>
          <p className="text-slate-300 text-lg font-medium mb-2">Sin targets configurados</p>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-6">
            Agrega dispositivos, servidores, cámaras, routers o sitios web para monitorearlos
            en tiempo real. Recibirás alertas cuando un dispositivo caiga.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2.5 rounded-lg font-medium transition-colors"
          >
            + Agregar primer target
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-500">
          Sin targets en esta categoría.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((target) => {
            const isExpanded = expandedId === target.id;
            const latency = target.lastLatency;
            const latencyColor = !latency ? "text-slate-500" :
              latency < 100  ? "text-green-400" :
              latency < 500  ? "text-yellow-400" :
              "text-orange-400";

            return (
              <div
                key={target.id}
                className={`bg-slate-900 border rounded-xl overflow-hidden transition-colors ${
                  target.status === "down" || target.status === "timeout"
                    ? "border-red-900/50"
                    : "border-slate-800"
                }`}
              >
                {/* ── Fila principal ──────────────────────────────────────────── */}
                <div
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-slate-800/40 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : target.id)}
                >
                  {/* Status dot */}
                  <div className="flex-shrink-0">
                    <StatusDot status={target.status} pulse />
                  </div>

                  {/* Nombre + host */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium text-sm">{target.name}</span>
                      <CheckTypeBadge type={target.checkType} />
                      <NetworkBadge type={target.networkType} />
                      {!target.enabled && (
                        <span className="text-xs px-1.5 py-0.5 rounded border bg-slate-800 text-slate-500 border-slate-700">
                          PAUSADO
                        </span>
                      )}
                    </div>
                    <div className="text-slate-500 font-mono text-xs mt-0.5 truncate">
                      {target.host}
                      {target.port && `:${target.port}`}
                      {(target.checkType === "http" || target.checkType === "https") && target.httpPath !== "/" && (
                        <span className="text-slate-600">{target.httpPath}</span>
                      )}
                      {target.networkType === "lan" && target.agentHost && (
                        <span className="text-cyan-700 ml-2">via {target.agentHost}</span>
                      )}
                    </div>
                  </div>

                  {/* Timeline checks */}
                  <div className="hidden sm:block flex-shrink-0">
                    <CheckTimeline checks={target.checks} />
                  </div>

                  {/* Uptime % */}
                  <div className="flex-shrink-0 w-12 text-right">
                    <UptimeBadge pct={target.uptime} />
                  </div>

                  {/* Latencia */}
                  <div className="flex-shrink-0 w-16 text-right">
                    {latency !== null && latency !== undefined ? (
                      <span className={`text-xs font-mono ${latencyColor}`}>{latency} ms</span>
                    ) : (
                      <span className="text-slate-700 text-xs">— ms</span>
                    )}
                  </div>

                  {/* Última vez */}
                  <div className="flex-shrink-0 w-24 text-right text-slate-600 text-xs">
                    {relativeTime(target.lastChecked)}
                  </div>

                  {/* Acciones rápidas */}
                  <div className="flex-shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {target.networkType === "wan" && (
                      <button
                        onClick={() => triggerMut.mutate({ targetId: target.id })}
                        disabled={triggerMut.isPending}
                        className="text-slate-600 hover:text-blue-400 transition-colors text-xs px-1.5 py-1 rounded hover:bg-slate-800"
                        title="Chequear ahora"
                      >
                        ↺
                      </button>
                    )}
                    <button
                      onClick={() => toggleMut.mutate({ id: target.id, enabled: !target.enabled })}
                      className={`text-xs px-1.5 py-1 rounded hover:bg-slate-800 transition-colors ${
                        target.enabled ? "text-slate-600 hover:text-yellow-400" : "text-yellow-600 hover:text-yellow-400"
                      }`}
                      title={target.enabled ? "Pausar" : "Reanudar"}
                    >
                      {target.enabled ? "⏸" : "▶"}
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`¿Eliminar "${target.name}"?`)) {
                          deleteMut.mutate({ id: target.id });
                        }
                      }}
                      className="text-slate-700 hover:text-red-400 transition-colors text-sm px-1.5 py-1 rounded hover:bg-slate-800"
                      title="Eliminar"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* ── Panel expandido: historial detallado ─────────────────── */}
                {isExpanded && <ExpandedDetail targetId={target.id} status={target.status} error={target.lastError} />}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Leyenda ─────────────────────────────────────────────────────────── */}
      {total > 0 && (
        <div className="mt-6 flex items-center gap-4 text-xs text-slate-600 justify-center">
          <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-4 rounded-sm bg-green-500" /> UP</span>
          <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-4 rounded-sm bg-red-500" /> DOWN</span>
          <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-4 rounded-sm bg-orange-500" /> TIMEOUT</span>
          <span className="flex items-center gap-1"><span className="inline-block w-1.5 h-4 rounded-sm bg-slate-700" /> DESCONOCIDO</span>
          <span className="text-slate-700">— Columna timeline: últimos 40 checks (izq=antiguo, der=reciente)</span>
        </div>
      )}
    </div>
  );
}

// ── Panel expandido (historial) ───────────────────────────────────────────────

function ExpandedDetail({ targetId, status, error }: { targetId: string; status: string; error: string | null }) {
  const checksQ = trpc.monitoring.getChecks.useQuery({ targetId, limit: 100 });
  const statsQ  = trpc.monitoring.getUptimeStats.useQuery({ targetId });

  const checks = checksQ.data ?? [];
  const stats  = statsQ.data;

  return (
    <div className="border-t border-slate-800 bg-slate-950/50 px-4 py-4">
      {/* Stats de uptime */}
      {stats && (
        <div className="flex items-center gap-6 mb-4">
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-0.5">Última 1h</div>
            <UptimeBadge pct={stats.h1} />
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-0.5">Últimas 24h</div>
            <UptimeBadge pct={stats.h24} />
          </div>
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-0.5">Últimos 7 días</div>
            <UptimeBadge pct={stats.d7} />
          </div>
          {status === "down" && error && (
            <div className="flex items-center gap-2 bg-red-900/20 border border-red-900/40 rounded-lg px-3 py-1.5 ml-4">
              <span className="text-red-400 text-xs font-medium">Último error:</span>
              <span className="text-red-300 text-xs font-mono">{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Tabla de últimos checks */}
      {checksQ.isLoading ? (
        <div className="text-slate-600 text-sm">Cargando historial…</div>
      ) : checks.length === 0 ? (
        <div className="text-slate-600 text-sm">Sin historial de checks aún.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="pr-4 pb-1 font-medium">Hora</th>
                <th className="pr-4 pb-1 font-medium">Estado</th>
                <th className="pr-4 pb-1 font-medium">Latencia</th>
                <th className="pr-4 pb-1 font-medium">HTTP</th>
                <th className="pr-4 pb-1 font-medium">Revisado por</th>
                <th className="pb-1 font-medium">Error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {checks.map((c) => (
                <tr key={c.id} className="hover:bg-slate-800/20">
                  <td className="py-1 pr-4 text-slate-500 whitespace-nowrap font-mono">
                    {new Date(c.checkedAt).toLocaleString("es-CO", {
                      month: "numeric", day: "numeric",
                      hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </td>
                  <td className="py-1 pr-4">
                    <span className={`font-semibold ${
                      c.status === "up"      ? "text-green-400" :
                      c.status === "timeout" ? "text-orange-400" :
                      "text-red-400"
                    }`}>
                      {c.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-1 pr-4 font-mono">
                    {c.latency !== null ? (
                      <span className={c.latency < 100 ? "text-green-400" : c.latency < 500 ? "text-yellow-400" : "text-orange-400"}>
                        {c.latency} ms
                      </span>
                    ) : (
                      <span className="text-slate-700">—</span>
                    )}
                  </td>
                  <td className="py-1 pr-4 text-slate-500 font-mono">
                    {c.httpStatus ?? "—"}
                  </td>
                  <td className="py-1 pr-4 text-slate-600 font-mono">
                    {c.checkedBy}
                  </td>
                  <td className="py-1 text-red-400/70 font-mono truncate max-w-[200px]" title={c.error ?? ""}>
                    {c.error ?? ""}
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
