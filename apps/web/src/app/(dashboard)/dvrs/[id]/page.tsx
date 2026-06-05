"use client";

import { trpc } from "@/trpc/react";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

// ─── Componente playback HLS ──────────────────────────────────────────────────
function PlaybackPlayer({ src, title, onClose }: { src: string; title: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<"loading" | "playing" | "error">("loading");

  useEffect(() => {
    let destroyed = false;
    async function init() {
      const video = videoRef.current;
      if (!video) return;
      const Hls = (await import("hls.js")).default;
      if (Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: false, maxBufferLength: 60 });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!destroyed) { video.play().catch(() => {}); setStatus("playing"); } });
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal && !destroyed) setStatus("error"); });
        return () => hls.destroy();
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = src;
        video.addEventListener("loadedmetadata", () => { if (!destroyed) { video.play().catch(() => {}); setStatus("playing"); } });
        video.addEventListener("error", () => { if (!destroyed) setStatus("error"); });
      }
    }
    const cleanup = init();
    return () => { destroyed = true; cleanup?.then(fn => fn?.()); };
  }, [src]);

  return (
    <div className="bg-black rounded-xl overflow-hidden border border-slate-700 mt-2">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-900">
        <span className="text-white text-xs font-medium">▶ {title}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm">✕</button>
      </div>
      <div className="relative">
        <video ref={videoRef} className="w-full max-h-64 object-contain bg-black" controls autoPlay muted playsInline />
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <p className="text-red-400 text-xs text-center p-4">⚠️ No se pudo reproducir — verifica go2rtc y credenciales</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Timeline de grabaciones (SVG 24h) ────────────────────────────────────────
function RecordingTimeline({
  recordings,
  date,
  onSelectRange,
}: {
  recordings: { channel: number; start: string; end: string }[];
  date: string;
  onSelectRange: (start: string, end: string) => void;
}) {
  if (recordings.length === 0) return null;

  const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#84cc16"];
  const channels = [...new Set(recordings.map(r => r.channel))].sort((a, b) => a - b);

  function toMinutes(timeStr: string): number {
    const t = timeStr.includes(" ") ? timeStr.split(" ")[1]! : timeStr;
    const [h, m, s] = t.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0) + (s ?? 0) / 60;
  }

  const W = 100; // porcentaje
  const ROW_H = 16;
  const GAP = 4;
  const TOTAL_H = channels.length * (ROW_H + GAP) + 24;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
      <p className="text-slate-400 text-xs font-medium mb-3">📊 Timeline — {date}</p>

      {/* Horas */}
      <div className="flex justify-between text-slate-600 text-xs mb-1 px-0.5">
        {[0, 3, 6, 9, 12, 15, 18, 21, 24].map(h => (
          <span key={h}>{String(h).padStart(2, "0")}h</span>
        ))}
      </div>

      <svg viewBox={`0 0 1440 ${TOTAL_H}`} className="w-full" preserveAspectRatio="none"
        style={{ height: `${Math.max(60, TOTAL_H * 2)}px` }}>
        {/* Fondo + guías horarias */}
        <rect x="0" y="0" width="1440" height={TOTAL_H} fill="#1e293b" rx="4" />
        {[6, 12, 18].map(h => (
          <line key={h} x1={h * 60} y1="0" x2={h * 60} y2={TOTAL_H}
            stroke="#334155" strokeWidth="1" strokeDasharray="4,4" />
        ))}

        {channels.map((ch, rowIdx) => {
          const y    = rowIdx * (ROW_H + GAP);
          const color = COLORS[(ch - 1) % COLORS.length]!;
          return (
            <g key={ch}>
              {/* Label canal */}
              <text x="4" y={y + ROW_H - 3} fontSize="9" fill="#94a3b8">CH{ch}</text>
              {recordings
                .filter(r => r.channel === ch)
                .map((r, i) => {
                  const x1 = toMinutes(r.start);
                  const x2 = toMinutes(r.end);
                  const w  = Math.max(2, x2 - x1);
                  return (
                    <rect key={i}
                      x={x1 * (1440 / (24 * 60))}
                      y={y}
                      width={w * (1440 / (24 * 60))}
                      height={ROW_H}
                      fill={color}
                      opacity="0.85"
                      rx="2"
                      className="cursor-pointer hover:opacity-100"
                      onClick={() => onSelectRange(
                        r.start.split(" ")[1]?.slice(0, 5) ?? "00:00",
                        r.end.split(" ")[1]?.slice(0, 5) ?? "23:59"
                      )}
                    >
                      <title>CH{ch} · {r.start.split(" ")[1]} → {r.end.split(" ")[1]}</title>
                    </rect>
                  );
                })}
            </g>
          );
        })}
      </svg>
      <p className="text-slate-700 text-xs mt-1">Haz clic en un bloque para filtrar ese rango</p>
    </div>
  );
}

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
  const [searched,     setSearched]     = useState(false);
  const [playbackSrc,  setPlaybackSrc]  = useState<{ src: string; title: string } | null>(null);
  const [localJobId,   setLocalJobId]   = useState<string | null>(null);
  const [localStatus,  setLocalStatus]  = useState<"idle"|"waiting"|"done"|"error">("idle");
  const [localResults, setLocalResults] = useState<{channel:number;start:string;end:string;size:number;filePath:string}[]>([]);
  const [localError,   setLocalError]   = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Query principal (servidor Railway → IP pública)
  const { data: result, isFetching, refetch, error } = trpc.dvrs.findRecordings.useQuery(
    { dvrId: id, channels: Array.from(selectedChannels), date, startTime, endTime },
    { enabled: false }
  );

  // Polling del job local
  const { data: jobData, refetch: pollJob } = trpc.dvrs.getScanJob.useQuery(
    { jobId: localJobId ?? "" },
    { enabled: false }
  );

  const createScanJob = trpc.dvrs.createScanJob.useMutation({
    onSuccess: async ({ jobId }) => {
      setLocalJobId(jobId);
      setLocalStatus("waiting");
      // Descargar el .bat
      window.open(`/api/agent/dvr-script?jobId=${jobId}`, "_blank");
      // Iniciar polling cada 3 segundos
      pollRef.current = setInterval(async () => {
        const res = await pollJob();
        if (res.data?.status === "done") {
          clearInterval(pollRef.current!);
          setLocalStatus("done");
          setLocalResults((res.data.results as typeof localResults) ?? []);
        } else if (res.data?.status === "error") {
          clearInterval(pollRef.current!);
          setLocalStatus("error");
          setLocalError(res.data.error ?? "Error desconocido");
        }
      }, 3000);
    },
    onError: (e) => { setLocalStatus("error"); setLocalError(e.message); },
  });

  // Limpiar polling al desmontar
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const recordings = searched
    ? (result?.recordings ?? [])
    : localStatus === "done" ? localResults : [];
  const localIp  = result?.localIp ?? dvr?.localIp ?? dvr?.ip ?? null;
  const dvrPort  = result?.port ?? dvr?.port ?? 80;
  const multiChannel = selectedChannels.size !== 1;

  function toggleChannel(ch: number) {
    setSelectedChannels(prev => { const n = new Set(prev); n.has(ch) ? n.delete(ch) : n.add(ch); return n; });
  }
  function toggleAll() {
    setSelectedChannels(prev => prev.size === 0 || prev.size === channelCount ? new Set() : new Set(allChannels));
  }

  function handleSearch() { setSearched(true); setLocalStatus("idle"); setPlaybackSrc(null); refetch(); }

  function handlePlayback(rec: { channel: number; start: string; end: string }) {
    // Construir URL de playback via proxy HLS
    const fmt = (s: string) => s.replace(/[-: ]/g, "").slice(0, 14).padEnd(14, "0");
    const start = fmt(rec.start);
    const end   = fmt(rec.end);
    const src   = `/api/vms/stream/${id}/${rec.channel}/pb/${start}/${end}/index.m3u8`;
    const title = `CH${rec.channel} · ${rec.start.split(" ")[1] ?? rec.start} → ${rec.end.split(" ")[1] ?? rec.end}`;
    setPlaybackSrc({ src, title });
  }

  function handleSearchLocal() {
    setSearched(false);
    setLocalStatus("idle");
    setLocalResults([]);
    setLocalError(null);
    setLocalJobId(null);
    if (pollRef.current) clearInterval(pollRef.current);
    createScanJob.mutate({
      dvrId: id,
      channels: Array.from(selectedChannels),
      date, startTime, endTime,
    });
  }

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
            title="Busca desde el servidor — necesita IP pública del DVR"
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition-colors">
            {isFetching ? "Buscando…" : "🌐 Buscar remoto"}
          </button>
          {(dvr?.localIp ?? dvr?.ip) && (
            <button onClick={handleSearchLocal} disabled={createScanJob.isPending || localStatus === "waiting"}
              title="Descarga un agente que busca en la red local y envía los resultados"
              className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-5 py-2 rounded-lg transition-colors">
              {localStatus === "waiting" ? "⏳ Esperando agente…" : "🏠 Buscar local"}
            </button>
          )}
        </div>

        {/* Resumen de búsqueda */}
        <p className="text-slate-600 text-xs">
          {channelLabel} · {date} · {startTime} → {endTime}
        </p>
      </div>

      {/* Resultados */}
      {(searched || localStatus !== "idle") && (
        localStatus === "waiting" ? (
          <div className="text-center py-12 text-slate-400">
            <div className="text-4xl mb-3 animate-pulse">🏠</div>
            <p className="text-white font-medium mb-1">Agente descargado — ejecútalo en tu PC</p>
            <p className="text-slate-500 text-sm">Abre el archivo <code className="text-green-400">dvr-scan-{date}.bat</code> como Administrador</p>
            <p className="text-slate-600 text-xs mt-2">Los resultados aparecerán aquí automáticamente cuando el agente termine…</p>
          </div>
        ) : localStatus === "error" ? (
          <div className="bg-red-950 border border-red-800 rounded-xl p-4 text-red-300 text-sm">
            ❌ Error del agente: {localError}
          </div>
        ) : isFetching ? (
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

            {/* Timeline visual */}
            <RecordingTimeline
              recordings={recordings as { channel: number; start: string; end: string }[]}
              date={date}
              onSelectRange={(s, e) => { setStartTime(s); setEndTime(e); }}
            />

            {/* Reproductor de playback */}
            {playbackSrc && (
              <PlaybackPlayer
                src={playbackSrc.src}
                title={playbackSrc.title}
                onClose={() => setPlaybackSrc(null)}
              />
            )}
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
                    <th className="text-left text-slate-400 font-medium px-4 py-3">▶</th>
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
                      <td className="px-4 py-2">
                        <button
                          onClick={() => handlePlayback(rec as { channel: number; start: string; end: string })}
                          title="Reproducir grabación via go2rtc (requiere Live View activo)"
                          className="bg-slate-700 hover:bg-blue-700 text-white text-xs px-2 py-1.5 rounded-lg transition-colors">
                          ▶
                        </button>
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
