"use client";

import { trpc } from "@/trpc/react";
import { useEffect, useRef, useState, useCallback } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface StreamSlot {
  dvrId:   string;
  channel: number;
}

type Layout = "1x1" | "2x2" | "3x3" | "4x4";

const LAYOUTS: { key: Layout; label: string; cols: number; count: number }[] = [
  { key: "1x1", label: "1×1", cols: 1, count: 1 },
  { key: "2x2", label: "2×2", cols: 2, count: 4 },
  { key: "3x3", label: "3×3", cols: 3, count: 9 },
  { key: "4x4", label: "4×4", cols: 4, count: 16 },
];

// ─── Componente: reproductor HLS individual ───────────────────────────────────

function LivePlayer({
  dvrId,
  channel,
  dvrName,
  onClose,
}: {
  dvrId:   string;
  channel: number;
  dvrName: string;
  onClose: () => void;
}) {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const hlsRef     = useRef<import("hls.js").default | null>(null);
  const [status, setStatus] = useState<"loading" | "playing" | "error">("loading");
  const [errMsg,  setErrMsg]  = useState("");

  const src = `/api/vms/stream/${dvrId}/${channel}/index.m3u8`;

  useEffect(() => {
    let destroyed = false;

    async function init() {
      const video = videoRef.current;
      if (!video) return;

      const Hls = (await import("hls.js")).default;

      if (Hls.isSupported()) {
        const hls = new Hls({
          lowLatencyMode:      true,
          liveSyncDurationCount: 2,
          liveMaxLatencyDurationCount: 5,
          maxBufferLength:     10,
        });
        hlsRef.current = hls;

        hls.loadSource(src);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          if (!destroyed) {
            video.play().catch(() => {});
            setStatus("playing");
          }
        });

        hls.on(Hls.Events.ERROR, (_, data) => {
          if (data.fatal && !destroyed) {
            setStatus("error");
            setErrMsg(data.details ?? "Error de stream");
          }
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari soporta HLS nativo
        video.src = src;
        video.addEventListener("loadedmetadata", () => {
          if (!destroyed) { video.play().catch(() => {}); setStatus("playing"); }
        });
        video.addEventListener("error", () => {
          if (!destroyed) { setStatus("error"); setErrMsg("Error de video"); }
        });
      } else {
        setStatus("error");
        setErrMsg("HLS no soportado en este navegador");
      }
    }

    init();

    return () => {
      destroyed = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
    };
  }, [src]);

  return (
    <div className="relative w-full h-full bg-black group">
      {/* Video */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        autoPlay
        muted
        playsInline
      />

      {/* Overlay de estado */}
      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-xs">Conectando…</p>
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-2 p-4">
          <span className="text-3xl">⚠️</span>
          <p className="text-red-400 text-xs text-center">{errMsg || "Sin señal"}</p>
        </div>
      )}

      {/* Info bar (aparece al pasar el mouse) */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2
                      opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between">
        <span className="text-white text-xs font-medium truncate">{dvrName} · CH{channel}</span>
        <div className="flex gap-2 items-center">
          {status === "playing" && (
            <span className="flex items-center gap-1 text-green-400 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />EN VIVO
            </span>
          )}
          <button onClick={onClose}
            className="text-slate-400 hover:text-white text-sm leading-none px-1">✕</button>
        </div>
      </div>
    </div>
  );
}

// ─── Componente: celda vacía (selector) ───────────────────────────────────────

function EmptyCell({
  dvrs,
  onSelect,
}: {
  dvrs: { id: string; name: string; channels: number; status: string }[];
  onSelect: (dvrId: string, channel: number) => void;
}) {
  const [dvrId,   setDvrId]   = useState("");
  const [channel, setChannel] = useState(1);
  const selectedDvr = dvrs.find(d => d.id === dvrId);

  return (
    <div className="w-full h-full bg-slate-900 border border-slate-800 flex flex-col items-center justify-center gap-3 p-4">
      <span className="text-3xl opacity-30">📹</span>
      <div className="w-full space-y-2">
        <select
          value={dvrId}
          onChange={e => { setDvrId(e.target.value); setChannel(1); }}
          className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500">
          <option value="">— Seleccionar DVR —</option>
          {dvrs.map(d => (
            <option key={d.id} value={d.id}
              disabled={d.status !== "ONLINE"}>
              {d.status === "ONLINE" ? "🟢" : "🔴"} {d.name}
            </option>
          ))}
        </select>
        {dvrId && (
          <select
            value={channel}
            onChange={e => setChannel(parseInt(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-blue-500">
            {Array.from({ length: selectedDvr?.channels ?? 8 }, (_, i) => (
              <option key={i + 1} value={i + 1}>Canal {i + 1}</option>
            ))}
          </select>
        )}
      </div>
      {dvrId && (
        <button
          onClick={() => onSelect(dvrId, channel)}
          className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs py-1.5 rounded-lg transition-colors">
          ▶ Ver en vivo
        </button>
      )}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function LiveViewPage() {
  const { data: vmsStatus } = trpc.vms.status.useQuery();
  const [layout,  setLayout]  = useState<Layout>("2x2");
  const [streams, setStreams]  = useState<(StreamSlot | null)[]>([null, null, null, null]);
  const [fullscreen, setFullscreen] = useState<number | null>(null);

  const currentLayout = LAYOUTS.find(l => l.key === layout)!;

  // Ajustar array de slots al cambiar layout
  useEffect(() => {
    setStreams(prev => {
      const next = Array(currentLayout.count).fill(null) as (StreamSlot | null)[];
      prev.slice(0, currentLayout.count).forEach((s, i) => { next[i] = s; });
      return next;
    });
  }, [layout, currentLayout.count]);

  const setSlot = useCallback((index: number, slot: StreamSlot | null) => {
    setStreams(prev => prev.map((s, i) => i === index ? slot : s));
  }, []);

  const dvrs = (vmsStatus?.dvrs ?? []) as {
    id: string; name: string; channels: number; status: string;
  }[];

  const go2rtcReady = vmsStatus?.go2rtcConfigured;
  const tunnelActive = vmsStatus?.tunnelActive;

  // ── Vista fullscreen de una celda ─────────────────────────────────────────
  if (fullscreen !== null) {
    const slot = streams[fullscreen];
    const dvrName = dvrs.find(d => d.id === slot?.dvrId)?.name ?? "DVR";
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <div className="absolute top-3 left-3 z-10">
          <button onClick={() => setFullscreen(null)}
            className="bg-black/60 hover:bg-black/80 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
            ✕ Salir de pantalla completa
          </button>
        </div>
        {slot ? (
          <LivePlayer
            dvrId={slot.dvrId}
            channel={slot.channel}
            dvrName={dvrName}
            onClose={() => setFullscreen(null)}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-600">
            Sin stream seleccionado
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">📺 Live View</h1>
          <p className="text-slate-500 text-xs mt-0.5">
            {go2rtcReady
              ? tunnelActive
                ? "🟢 go2rtc + tunnel activos"
                : "🟢 go2rtc activo (solo IPs públicas)"
              : "⚠️ go2rtc no configurado — define GO2RTC_URL en Railway"}
          </p>
        </div>

        {/* Selector de layout */}
        <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
          {LAYOUTS.map(l => (
            <button key={l.key}
              onClick={() => setLayout(l.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-mono transition-colors
                ${layout === l.key
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-white"}`}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Aviso si no hay go2rtc */}
      {!go2rtcReady && (
        <div className="bg-yellow-950/40 border border-yellow-800/50 rounded-xl p-4 mb-4">
          <p className="text-yellow-400 text-sm font-semibold mb-1">⚙️ Configuración requerida</p>
          <p className="text-yellow-300/70 text-xs">
            Para activar Live View necesitas desplegar go2rtc como servicio en Railway y
            configurar la variable <code className="font-mono bg-yellow-900/40 px-1 rounded">GO2RTC_URL</code>.
          </p>
          <p className="text-yellow-300/50 text-xs mt-1">
            Para DVRs en red local también necesitas actualizar el agente Windows con cloudflared.
          </p>
        </div>
      )}

      {/* Grid de celdas */}
      <div
        className="flex-1 grid gap-1"
        style={{ gridTemplateColumns: `repeat(${currentLayout.cols}, 1fr)` }}>
        {streams.map((slot, i) => {
          const dvrName = dvrs.find(d => d.id === slot?.dvrId)?.name ?? "DVR";
          return (
            <div key={i} className="relative min-h-[160px] rounded-lg overflow-hidden">
              {slot ? (
                <>
                  <LivePlayer
                    dvrId={slot.dvrId}
                    channel={slot.channel}
                    dvrName={dvrName}
                    onClose={() => setSlot(i, null)}
                  />
                  {/* Botón fullscreen */}
                  <button
                    onClick={() => setFullscreen(i)}
                    className="absolute top-2 right-8 bg-black/60 hover:bg-black/80 text-white text-xs px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                    ⛶
                  </button>
                </>
              ) : (
                <EmptyCell
                  dvrs={dvrs}
                  onSelect={(dvrId, channel) => setSlot(i, { dvrId, channel })}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
