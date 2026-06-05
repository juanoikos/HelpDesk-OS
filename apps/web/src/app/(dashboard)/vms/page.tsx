"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";
import Link from "next/link";

// ─── Badges ──────────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  if (status === "ONLINE")
    return <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium"><span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />Online</span>;
  if (status === "OFFLINE")
    return <span className="flex items-center gap-1.5 text-xs text-red-400 font-medium"><span className="w-2 h-2 rounded-full bg-red-500" />Offline</span>;
  return <span className="flex items-center gap-1.5 text-xs text-slate-500 font-medium"><span className="w-2 h-2 rounded-full bg-slate-600" />Sin verificar</span>;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function VmsPage() {
  const utils = trpc.useUtils();
  const { data: dvrs, isLoading } = trpc.dvrs.list.useQuery();

  const fetchInfo      = trpc.dvrs.fetchDeviceInfo.useMutation({
    onSuccess: () => utils.dvrs.list.invalidate(),
    onError:   (e) => alert(`Error: ${e.message}`),
  });
  const getSnapshot    = trpc.dvrs.getSnapshotUrl.useMutation();

  const [fetchingId,  setFetchingId]  = useState<string | null>(null);
  const [snapshots,   setSnapshots]   = useState<Record<string, string>>({});
  const [snapshotId,  setSnapshotId]  = useState<string | null>(null);

  async function handleFetchInfo(id: string) {
    setFetchingId(id);
    try { await fetchInfo.mutateAsync({ id }); }
    finally { setFetchingId(null); }
  }

  async function handleSnapshot(id: string, channel = 1) {
    setSnapshotId(id);
    try {
      const res = await getSnapshot.mutateAsync({ id, channel });
      setSnapshots(prev => ({ ...prev, [id]: res.dataUrl }));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      alert(`No se pudo obtener snapshot: ${msg}`);
    } finally {
      setSnapshotId(null);
    }
  }

  const online  = dvrs?.filter(d => d.status === "ONLINE").length  ?? 0;
  const offline = dvrs?.filter(d => d.status === "OFFLINE").length ?? 0;
  const unknown = dvrs?.filter(d => d.status === "UNKNOWN").length ?? 0;
  const withInfo = dvrs?.filter(d => (d as { firmware?: string | null }).firmware).length ?? 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">🎥 VMS — Video Management</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {dvrs?.length ?? 0} dispositivos · Heartbeat cada 60 s
          </p>
        </div>
        <Link href="/dvrs"
          className="text-sm px-4 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">
          ← Volver a DVRs
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total",          value: dvrs?.length ?? 0, color: "text-white" },
          { label: "Online",         value: online,            color: "text-green-400" },
          { label: "Offline",        value: offline,           color: "text-red-400" },
          { label: "Info obtenida",  value: withInfo,          color: "text-blue-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-slate-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Sin verificar aviso */}
      {unknown > 0 && (
        <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-xl px-4 py-3 mb-4 text-yellow-400 text-sm">
          ⚡ {unknown} DVR{unknown > 1 ? "s" : ""} sin verificar — el heartbeat se ejecuta cada 60 s automáticamente.
        </div>
      )}

      {/* Dispositivos */}
      {isLoading ? (
        <p className="text-slate-500 text-sm">Cargando…</p>
      ) : !dvrs?.length ? (
        <div className="text-center py-16 text-slate-600">
          <div className="text-4xl mb-3">📹</div>
          <p className="text-sm">No hay DVRs registrados.</p>
          <Link href="/dvrs" className="text-blue-400 hover:text-blue-300 text-sm mt-2 inline-block">
            Ir a gestión de DVRs →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {dvrs.map(dvr => {
            const d = dvr as typeof dvr & {
              deviceModel?: string | null;
              firmware?: string | null;
              deviceType?: string | null;
              channelNames?: { channel: number; name: string }[] | null;
              lastInfoFetch?: string | null;
              photoUrl?: string | null;
            };

            const snap = snapshots[dvr.id];

            return (
              <div key={dvr.id} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden hover:border-slate-700 transition-colors">

                {/* Foto / Snapshot */}
                <div className="relative h-36 bg-slate-800">
                  {snap ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={snap} alt={dvr.name} className="w-full h-full object-cover" />
                  ) : d.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={d.photoUrl} alt={dvr.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-4xl opacity-20">📹</span>
                    </div>
                  )}

                  {/* Badge de estado */}
                  <div className="absolute top-2 left-2 bg-black/70 rounded-lg px-2 py-1">
                    <StatusDot status={dvr.status} />
                  </div>

                  {/* Botón snapshot */}
                  <button
                    onClick={() => handleSnapshot(dvr.id)}
                    disabled={snapshotId === dvr.id}
                    title="Obtener snapshot en vivo"
                    className="absolute top-2 right-2 bg-black/70 hover:bg-black/90 text-white text-xs px-2 py-1 rounded-lg transition-colors disabled:opacity-50">
                    {snapshotId === dvr.id ? "⏳" : "📸"}
                  </button>
                </div>

                {/* Info */}
                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-white font-semibold">{dvr.name}</p>
                    {dvr.location && <p className="text-slate-500 text-xs">{dvr.location}</p>}
                  </div>

                  {/* Datos del dispositivo */}
                  <div className="space-y-1 text-xs">
                    {d.deviceType && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Tipo</span>
                        <span className="text-slate-300 font-mono">{d.deviceType}</span>
                      </div>
                    )}
                    {d.deviceModel && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Modelo</span>
                        <span className="text-slate-300 font-mono text-right max-w-[180px] truncate">{d.deviceModel}</span>
                      </div>
                    )}
                    {d.firmware && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Firmware</span>
                        <span className="text-slate-300 font-mono text-right max-w-[180px] truncate">{d.firmware}</span>
                      </div>
                    )}
                    {dvr.serial && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">Serial</span>
                        <span className="text-blue-400 font-mono">{dvr.serial}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">Canales</span>
                      <span className="text-slate-300">{dvr.channels} ch</span>
                    </div>
                    {dvr.localIp && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">IP local</span>
                        <span className="text-green-400 font-mono">{dvr.localIp}</span>
                      </div>
                    )}
                  </div>

                  {/* Nombres de canales */}
                  {Array.isArray(d.channelNames) && d.channelNames.length > 0 && (
                    <div className="border-t border-slate-800 pt-2">
                      <p className="text-slate-500 text-xs mb-1.5">Canales</p>
                      <div className="flex flex-wrap gap-1">
                        {(d.channelNames as { channel: number; name: string }[])
                          .filter(c => c.name && c.name !== `Canal ${c.channel}`)
                          .slice(0, 8)
                          .map(c => (
                            <span key={c.channel}
                              className="bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full">
                              {c.channel}: {c.name}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Acciones */}
                  <div className="flex gap-2 pt-1 border-t border-slate-800">
                    <button
                      onClick={() => handleFetchInfo(dvr.id)}
                      disabled={fetchingId === dvr.id}
                      className="flex-1 text-xs py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-blue-600 hover:text-blue-400 transition-colors disabled:opacity-50">
                      {fetchingId === dvr.id ? "⏳ Consultando…" : "🔍 Obtener info"}
                    </button>
                    <Link href={`/dvrs/${dvr.id}`}
                      className="flex-1 text-center text-xs py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:border-green-600 hover:text-green-400 transition-colors">
                      🎬 Grabaciones
                    </Link>
                  </div>

                  {/* Última actualización */}
                  {d.lastInfoFetch && (
                    <p className="text-slate-700 text-xs text-right">
                      Info: {new Date(d.lastInfoFetch).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
