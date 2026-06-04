"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

function formatBytes(bytes: number): string {
  if (!bytes) return "—";
  const gb = bytes / 1e9;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / 1e6;
  return `${mb.toFixed(1)} MB`;
}

function formatDuration(start: string, end: string): string {
  try {
    const s = new Date(start.replace(" ", "T"));
    const e = new Date(end.replace(" ", "T"));
    const diff = Math.round((e.getTime() - s.getTime()) / 60000);
    if (diff >= 60) return `${Math.floor(diff / 60)}h ${diff % 60}m`;
    return `${diff} min`;
  } catch { return "—"; }
}

export default function DvrRecordingsPage() {
  const { id } = useParams<{ id: string }>();
  const { data: dvrs } = trpc.dvrs.list.useQuery();
  const dvr = dvrs?.find(d => d.id === id);

  const today = new Date().toISOString().split("T")[0];
  const [channel, setChannel] = useState(1);
  const [date,    setDate]    = useState(today);
  const [searched, setSearched] = useState(false);

  const { data: recordings, isFetching, refetch, error } = trpc.dvrs.findRecordings.useQuery(
    { dvrId: id, channel, date },
    { enabled: false }
  );

  function handleSearch() {
    setSearched(true);
    refetch();
  }

  function handleDownload(filePath: string) {
    const url = `/api/dvr/download?dvrId=${id}&filePath=${encodeURIComponent(filePath)}`;
    window.open(url, "_blank");
  }

  const channelCount = dvr?.channels ?? 8;

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

      {/* Buscador de grabaciones */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
        <h2 className="text-white font-semibold mb-4">🎬 Buscar grabaciones</h2>
        <div className="flex gap-4 flex-wrap items-end">
          <div>
            <label className="text-slate-500 text-xs block mb-1">Canal</label>
            <select value={channel} onChange={e => setChannel(parseInt(e.target.value))}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
              <option value={0}>📹 Todas las cámaras</option>
              {Array.from({ length: channelCount }, (_, i) => i + 1).map(ch => (
                <option key={ch} value={ch}>Cámara {ch}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-slate-500 text-xs block mb-1">Fecha</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} max={today}
              className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
          </div>
          <button onClick={handleSearch} disabled={isFetching}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition-colors h-9">
            {isFetching ? "Buscando…" : "Buscar"}
          </button>
        </div>
      </div>

      {/* Resultados */}
      {searched && (
        <div>
          {isFetching ? (
            <div className="text-center py-12 text-slate-500">
              <div className="text-3xl mb-2">⏳</div>
              <p className="text-sm">Conectando al DVR…</p>
            </div>
          ) : error ? (
            <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
              ❌ {error.message}
            </div>
          ) : !recordings?.length ? (
            <div className="text-center py-12 text-slate-600">
              <div className="text-3xl mb-2">📭</div>
              <p className="text-sm">No hay grabaciones para Cámara {channel} el {date}</p>
            </div>
          ) : (
            <div>
              <p className="text-slate-400 text-sm mb-3">
                {recordings.length} grabación{recordings.length !== 1 ? "es" : ""} encontrada{recordings.length !== 1 ? "s" : ""} · {channel === 0 ? "Todas las cámaras" : `Cámara ${channel}`} · {date}
              </p>
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-800/50 border-b border-slate-800">
                      {channel === 0 && <th className="text-left text-slate-400 font-medium px-4 py-3">Cámara</th>}
                      <th className="text-left text-slate-400 font-medium px-4 py-3">Inicio</th>
                      <th className="text-left text-slate-400 font-medium px-4 py-3">Fin</th>
                      <th className="text-left text-slate-400 font-medium px-4 py-3">Duración</th>
                      <th className="text-left text-slate-400 font-medium px-4 py-3">Tamaño</th>
                      <th className="text-left text-slate-400 font-medium px-4 py-3">Archivo</th>
                      <th className="text-left text-slate-400 font-medium px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {recordings.map((rec, i) => (
                      <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                        {channel === 0 && (
                          <td className="px-4 py-3">
                            <span className="text-xs font-medium text-blue-400 bg-blue-900/30 border border-blue-800 px-2 py-0.5 rounded-full">
                              Cam {"channel" in rec ? (rec as { channel: number }).channel : "?"}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3 text-white font-mono text-xs">{rec.start.split(" ")[1] ?? rec.start}</td>
                        <td className="px-4 py-3 text-slate-400 font-mono text-xs">{rec.end.split(" ")[1] ?? rec.end}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{formatDuration(rec.start, rec.end)}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{formatBytes(rec.size)}</td>
                        <td className="px-4 py-3 text-slate-600 text-xs font-mono truncate max-w-[200px]" title={rec.filePath}>
                          {rec.filePath.split("/").pop()}
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => handleDownload(rec.filePath)}
                            className="flex items-center gap-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
                            ⬇ MP4
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
