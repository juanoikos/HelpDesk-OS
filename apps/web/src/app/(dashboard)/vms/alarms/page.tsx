"use client";

import { trpc } from "@/trpc/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

// ─── Configuración visual de tipos de alarma ──────────────────────────────────

const ALARM_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  VideoLoss:             { label: "Pérdida de señal",   color: "text-red-400",    bg: "bg-red-950/40 border-red-800/50",    icon: "📵" },
  VideoBlind:            { label: "Cámara tapada",      color: "text-orange-400", bg: "bg-orange-950/40 border-orange-800/50", icon: "🙈" },
  AlarmLocal:            { label: "Alarma local",       color: "text-yellow-400", bg: "bg-yellow-950/40 border-yellow-800/50", icon: "🚨" },
  VideoMotion:           { label: "Movimiento",         color: "text-blue-400",   bg: "bg-blue-950/40 border-blue-800/50",  icon: "🏃" },
  CrossLineDetection:    { label: "Cruce de línea",     color: "text-purple-400", bg: "bg-purple-950/40 border-purple-800/50", icon: "🚧" },
  CrossRegionDetection:  { label: "Intrusión de área",  color: "text-purple-400", bg: "bg-purple-950/40 border-purple-800/50", icon: "⚠️" },
  SmartMotionHuman:      { label: "Persona detectada",  color: "text-cyan-400",   bg: "bg-cyan-950/40 border-cyan-800/50",  icon: "🧍" },
  SmartMotionVehicle:    { label: "Vehículo detectado", color: "text-cyan-400",   bg: "bg-cyan-950/40 border-cyan-800/50",  icon: "🚗" },
};

const DEFAULT_CONFIG = { label: "Evento",    color: "text-slate-400", bg: "bg-slate-900 border-slate-700", icon: "🔔" };

function getConfig(code: string) {
  return ALARM_CONFIG[code] ?? DEFAULT_CONFIG;
}

// ─── Componente: tarjeta de alarma ────────────────────────────────────────────

function AlarmCard({
  alarm,
  onAck,
}: {
  alarm: {
    id: string; dvrName: string; channel: number; code: string; action: string;
    snapshotUrl: string | null; ticketId: string | null; acknowledged: boolean;
    createdAt: string | Date;
  };
  onAck: (id: string) => void;
}) {
  const cfg  = getConfig(alarm.code);
  const time = new Date(alarm.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className={`border rounded-xl p-3 flex gap-3 items-start transition-opacity ${cfg.bg} ${alarm.acknowledged ? "opacity-40" : ""}`}>
      {/* Snapshot */}
      {alarm.snapshotUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={alarm.snapshotUrl} alt="snapshot"
          className="w-20 h-14 object-cover rounded-lg shrink-0 border border-slate-700" />
      ) : (
        <div className="w-20 h-14 bg-slate-800 rounded-lg shrink-0 flex items-center justify-center text-2xl">
          {cfg.icon}
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.icon} {cfg.label}</span>
            <p className="text-white text-sm font-medium truncate">{alarm.dvrName} · Canal {alarm.channel}</p>
          </div>
          <span className="text-slate-600 text-xs shrink-0">{time}</span>
        </div>

        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          {alarm.ticketId && (
            <Link href={`/tickets/${alarm.ticketId}`}
              className="text-xs text-blue-400 hover:text-blue-300 bg-blue-900/30 border border-blue-800 px-2 py-0.5 rounded-full transition-colors">
              🎫 Ver ticket
            </Link>
          )}
          {!alarm.acknowledged && (
            <button onClick={() => onAck(alarm.id)}
              className="text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 px-2 py-0.5 rounded-full transition-colors">
              ✓ Reconocer
            </button>
          )}
          {alarm.acknowledged && (
            <span className="text-xs text-slate-600">✓ Reconocido</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function AlarmsPage() {
  const utils = trpc.useUtils();
  const { data: stats,  refetch: refetchStats } = trpc.vms.alarmStats.useQuery();
  const [filterCode, setFilterCode] = useState("");
  const [onlyNew,    setOnlyNew]    = useState(false);

  const { data: alarms, refetch: refetchAlarms } = trpc.vms.listAlarms.useQuery({
    limit:   100,
    code:    filterCode || undefined,
    onlyNew,
  });

  const ack    = trpc.vms.acknowledgeAlarm.useMutation({ onSuccess: () => { refetchAlarms(); refetchStats(); } });
  const ackAll = trpc.vms.acknowledgeAll.useMutation({ onSuccess: () => { refetchAlarms(); refetchStats(); } });

  // ── SSE — recibir alarmas en tiempo real ──────────────────────────────────
  const [realtimeCount, setRealtimeCount] = useState(0);
  // Usar ref para callbacks — evita que el EventSource se reconecte en cada re-render
  const cbRef = useRef({ refetchAlarms, refetchStats });
  useEffect(() => { cbRef.current = { refetchAlarms, refetchStats }; });

  useEffect(() => {
    const es = new EventSource("/api/vms/events");

    es.onmessage = (e) => {
      if (!e.data || e.data === "connected") return;
      try {
        JSON.parse(e.data); // validar JSON
        setRealtimeCount(n => n + 1);
        cbRef.current.refetchAlarms();
        cbRef.current.refetchStats();
      } catch { /* ignorar */ }
    };

    return () => es.close();
  }, []); // array vacío — solo abre una vez, usa ref para callbacks

  const alarmList = alarms ?? [];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            🚨 Centro de Alarmas
            {(stats?.unread ?? 0) > 0 && (
              <span className="bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded-full animate-pulse">
                {stats?.unread}
              </span>
            )}
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Eventos en tiempo real · {stats?.total24h ?? 0} en las últimas 24h
            {realtimeCount > 0 && <span className="text-green-400 ml-2">+{realtimeCount} nuevas</span>}
          </p>
        </div>
        {(stats?.unread ?? 0) > 0 && (
          <button onClick={() => ackAll.mutate()}
            disabled={ackAll.isPending}
            className="text-sm px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50">
            ✓ Reconocer todas
          </button>
        )}
      </div>

      {/* Stats por tipo */}
      {stats?.byCode && stats.byCode.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-5">
          {stats.byCode.slice(0, 6).map(s => {
            const cfg = getConfig(s.code);
            return (
              <button key={s.code}
                onClick={() => setFilterCode(prev => prev === s.code ? "" : s.code)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors
                  ${filterCode === s.code ? cfg.bg + " " + cfg.color : "border-slate-700 text-slate-400 hover:border-slate-600"}`}>
                {cfg.icon} {cfg.label}
                <span className="bg-slate-800 rounded-full px-1.5 py-0.5">{s.count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
          <input type="checkbox" checked={onlyNew} onChange={e => setOnlyNew(e.target.checked)}
            className="accent-blue-500" />
          Solo no reconocidas
        </label>
        {filterCode && (
          <button onClick={() => setFilterCode("")}
            className="text-xs text-slate-500 hover:text-white">
            ✕ Quitar filtro
          </button>
        )}
      </div>

      {/* Lista de alarmas */}
      {alarmList.length === 0 ? (
        <div className="text-center py-16 text-slate-600">
          <div className="text-4xl mb-3">🔕</div>
          <p className="text-sm">
            {onlyNew ? "Sin alarmas pendientes" : "Sin alarmas registradas"}
          </p>
          <p className="text-xs mt-1">
            Los eventos de los DVRs aparecerán aquí automáticamente
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alarmList.map(alarm => (
            <AlarmCard
              key={alarm.id}
              alarm={{
                ...alarm,
                snapshotUrl: alarm.snapshotUrl ?? null,
                ticketId:    alarm.ticketId    ?? null,
              }}
              onAck={id => ack.mutate({ id })}
            />
          ))}
        </div>
      )}
    </div>
  );
}
