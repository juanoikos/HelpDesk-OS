"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  return `${(bytes / 1e6).toFixed(1)} MB`;
}

function formatDuration(start: string, end: string): string {
  try {
    const diff = Math.round((new Date(end.replace(" ", "T")).getTime() - new Date(start.replace(" ", "T")).getTime()) / 60000);
    if (diff >= 60) return `${Math.floor(diff / 60)}h ${diff % 60}m`;
    return `${diff} min`;
  } catch { return "—"; }
}

export default function DvrRecordingsPage() {
  const { id }            = useParams<{ id: string }>();
  const { data: dvrs }    = trpc.dvrs.list.useQuery();
  const dvr               = dvrs?.find(d => d.id === id);
  const channelCount      = dvr?.channels ?? 8;
  const allChannels       = Array.from({ length: channelCount }, (_, i) => i + 1);

  const today = new Date().toISOString().split("T")[0];

  // Filtros
  const [selectedChannels, setSelectedChannels] = useState<Set<number>>(new Set()); // vacío = todas
  const [date,      setDate]      = useState(today!);
  const [startTime, setStartTime] = useState("00:00");
  const [endTime,   setEndTime]   = useState("23:59");
  const [searched,  setSearched]  = useState(false);

  const { data: result, isFetching, refetch, error } = trpc.dvrs.findRecordings.useQuery(
    {
      dvrId:     id,
      channels:  Array.from(selectedChannels),
      date,
      startTime,
      endTime,
    },
    { enabled: false }
  );

  const recordings = result?.recordings ?? [];
  const localIp    = result?.localIp ?? null;
  const dvrPort    = result?.port ?? 80;

  // Canales mostrados en el resultado (para columna)
  const multiChannel = selectedChannels.size !== 1;

  function toggleChannel(ch: number) {
    setSelectedChannels(prev => {
      const n = new Set(prev);
      n.has(ch) ? n.delete(ch) : n.add(ch);
      return n;
    });
  }

  function toggleAll() {
    setSelectedChannels(prev =>
      prev.size === 0 || prev.size === channelCount ? new Set() : new Set(allChannels)
    );
  }

  function handleSearch() { setSearched(true); refetch(); }

  function handleDownloadRemote(filePath: string) {
    window.open(`/api/dvr/download?dvrId=${id}&filePath=${encodeURIComponent(filePath)}`, "_blank");
  }

  function handleDownloadLocal(filePath: string, ip: string) {
    window.open(`http://${ip}:${dvrPort}/RPC_Loadfile${filePath}`, "_blank");
  }

  const channelLabel = selectedChannels.size === 0
    ? "Todas las cámaras"
    : selectedChannels.size === 1
    ? `Cámara ${Array.from(selectedChannels)[0]}`
    : `${selectedChannels.size} cámaras seleccionadas`;

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-6">
        <Link href="/dvrs" className="hover:text-slate-300 transition-colors">📹 DVRs</Link>
        <span>/</span>
        <span className="text-white">{dvr?.name ?? "Cargando…"}</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">{dvr?.name ?? "DVR"}</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {dvr?.ip}:{dvr?.port} · {dvr?.channels} canales
          {dvr?.location && ` · ${dvr.location}`}
        </p>
      </div>

      {/* Buscador */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6 space-y-4">
        <h2 className="text-white font-semibold">🎬 Buscar grabaciones</h2>

        {/* Selector de cámaras */}
        <div>
          <label className="text-slate-500 text-xs block mb-2">Cámaras</label>
          <div className="flex flex-wrap gap-2">
            {/* Botón Todas */}
            <button
              onClick={toggleAll}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                ${selectedChannels.size === 0
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"}`}
            >
              📹 Todas
            </button>
            {allChannels.map(ch => {
              const sel = selectedChannels.has(ch);
              return (
                <button key={ch} onClick={() => toggleChannel(ch)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                    ${sel
                      ? "bg-blue-700 border-blue-600 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500"}`}>
                  Cam {ch}
                </button>
              );
            })}
          </div>
        </div>

        {/* Fecha y rango horario */}
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="text-slate-500 text-xs block mb-1">Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} max={today}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-slate-500 text-xs block mb-1">Desde</label>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="text-slate-500 text-xs block mb-1">Hasta</label>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <button onClick={handleSearch} disabled={isFetching}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-6 py-2 rounded-lg transition-colors">
            {isFetching ? "Buscando…" : "Buscar"}
          </button>
        </div>

        {/* Resumen de búsqueda */}
        <p className="text-slate-600 text-xs">
          {channelLabel} · {date} · {startTime} → {endTime}
        </p>
      </div>

      {/* Resultados */}
      {searched && (
        isFetching ? (
          <div className="text-center py-12 text-slate-500">
            <div className="text-3xl mb-2">⏳</div>
            <p className="text-sm">Consultando {channelLabel}…</p>
          </div>
        ) : error ? (
          <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
            ❌ {error.message}
          </div>
        ) : recordings.length === 0 ? (
          <div className="text-center py-12 text-slate-600">
            <div className="text-3xl mb-2">📭</div>
            <p className="text-sm">Sin grabaciones para {channelLabel} · {date} · {startTime}–{endTime}</p>
          </div>
        ) : (
          <div>
            <p className="text-slate-400 text-sm mb-3">
              <span className="text-white font-medium">{recordings.length}</span> grabación{recordings.length !== 1 ? "es" : ""} ·{" "}
              {channelLabel} · {date} · {startTime}–{endTime}
            </p>
            <div className="rounded-xl border border-slate-800 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800/50 border-b border-slate-800">
                    {multiChannel && <th className="text-left text-slate-400 font-medium px-4 py-3">Cámara</th>}
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Inicio</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Fin</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Duración</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Tamaño</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Archivo</th>
                    <th className="text-left text-slate-400 font-medium px-4 py-3">Descargar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {recordings.map((rec, i) => (
                    <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                      {multiChannel && (
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium text-blue-400 bg-blue-900/30 border border-blue-800 px-2 py-0.5 rounded-full whitespace-nowrap">
                            Cam {"channel" in rec ? (rec as { channel: number }).channel : "?"}
                          </span>
                        </td>
                      )}
                      <td className="px-4 py-3 text-white font-mono text-xs whitespace-nowrap">{rec.start.split(" ")[1] ?? rec.start}</td>
                      <td className="px-4 py-3 text-slate-400 font-mono text-xs whitespace-nowrap">{rec.end.split(" ")[1] ?? rec.end}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">{formatDuration(rec.start, rec.end)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{formatBytes(rec.size)}</td>
                      <td className="px-4 py-3 text-slate-600 text-xs font-mono truncate max-w-[180px]" title={rec.filePath}>
                        {rec.filePath.split("/").pop()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {localIp && (
                            <button onClick={() => handleDownloadLocal(rec.filePath, localIp)}
                              title="Descarga directa — solo dentro de la red local"
                              className="bg-green-800 hover:bg-green-700 text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                              🏠 Local
                            </button>
                          )}
                          <button onClick={() => handleDownloadRemote(rec.filePath)}
                            title="Descarga vía servidor — funciona desde cualquier lugar"
                            className="bg-blue-700 hover:bg-blue-600 text-white text-xs px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap">
                            🌐 Remoto
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}
