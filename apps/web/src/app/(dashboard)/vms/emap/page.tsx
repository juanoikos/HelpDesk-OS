"use client";

import { trpc } from "@/trpc/react";
import { useRef, useState, useCallback } from "react";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface EmapDevice {
  id: string; emapId: string; dvrId: string; channel: number;
  x: number; y: number; label: string | null;
}

interface Emap {
  id: string; name: string; imageUrl: string; order: number;
  devices: EmapDevice[];
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function EmapPage() {
  const utils = trpc.useUtils();
  const { data: emaps = [], isLoading } = trpc.vms.listEmaps.useQuery();
  const { data: vmsStatus } = trpc.vms.status.useQuery();
  const dvrs = vmsStatus?.dvrs ?? [];

  const [activeEmapId, setActiveEmapId] = useState<string | null>(null);
  const [editMode,     setEditMode]     = useState(false);
  const [showCreate,   setShowCreate]   = useState(false);
  const [newName,      setNewName]      = useState("");
  const [uploading,    setUploading]    = useState(false);
  const [draggingDevice, setDraggingDevice] = useState<{ dvrId: string; channel: number; label: string } | null>(null);
  const [liveModal,    setLiveModal]    = useState<{ dvrId: string; channel: number; name: string } | null>(null);

  const fileRef    = useRef<HTMLInputElement>(null);
  const mapRef     = useRef<HTMLDivElement>(null);

  const activeEmap = emaps.find(e => e.id === activeEmapId) ?? emaps[0] ?? null;

  const createEmap       = trpc.vms.createEmap.useMutation({ onSuccess: (e) => { utils.vms.listEmaps.invalidate(); setActiveEmapId(e.id); setShowCreate(false); setNewName(""); } });
  const deleteEmap       = trpc.vms.deleteEmap.useMutation({ onSuccess: () => { utils.vms.listEmaps.invalidate(); setActiveEmapId(null); } });
  const upsertDevice     = trpc.vms.upsertEmapDevice.useMutation({ onSuccess: () => utils.vms.listEmaps.invalidate() });
  const removeDevice     = trpc.vms.removeEmapDevice.useMutation({ onSuccess: () => utils.vms.listEmaps.invalidate() });

  // ── Subir plano ──────────────────────────────────────────────────────────────
  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch("/api/upload-emap", { method: "POST", body: fd });
      const data = await res.json() as { url?: string; error?: string };
      if (!data.url) { alert(data.error ?? "Error al subir"); return; }
      createEmap.mutate({ name: newName.trim() || "Plano sin título", imageUrl: data.url });
    } finally {
      setUploading(false);
    }
  }

  // ── Drop en el mapa ──────────────────────────────────────────────────────────
  const handleMapDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!draggingDevice || !activeEmap || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x    = (e.clientX - rect.left)  / rect.width;
    const y    = (e.clientY - rect.top)   / rect.height;
    upsertDevice.mutate({
      emapId:  activeEmap.id,
      dvrId:   draggingDevice.dvrId,
      channel: draggingDevice.channel,
      x:       Math.min(Math.max(x, 0), 1),
      y:       Math.min(Math.max(y, 0), 1),
      label:   draggingDevice.label,
    });
    setDraggingDevice(null);
  }, [draggingDevice, activeEmap, upsertDevice]);

  // ── Mover cámara existente en el mapa ────────────────────────────────────────
  function handleDeviceDrop(e: React.DragEvent<HTMLDivElement>, device: EmapDevice) {
    e.preventDefault();
    if (!mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x    = (e.clientX - rect.left) / rect.width;
    const y    = (e.clientY - rect.top)  / rect.height;
    upsertDevice.mutate({
      emapId:  device.emapId,
      dvrId:   device.dvrId,
      channel: device.channel,
      x:       Math.min(Math.max(x, 0), 1),
      y:       Math.min(Math.max(y, 0), 1),
      label:   device.label ?? undefined,
    });
  }

  // ── DVRs disponibles para agregar al mapa ─────────────────────────────────
  const placedKeys = new Set(activeEmap?.devices.map(d => `${d.dvrId}_${d.channel}`) ?? []);
  const availableDvrs = dvrs.flatMap(dvr =>
    Array.from({ length: (dvr as { channels?: number }).channels ?? 8 }, (_, i) => ({
      dvrId:   dvr.id,
      dvrName: dvr.name,
      channel: i + 1,
      status:  dvr.status,
      key:     `${dvr.id}_${i + 1}`,
    }))
  ).filter(d => !placedKeys.has(d.key));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">🗺️ E-Map</h1>
          <p className="text-slate-500 text-xs mt-0.5">Planos electrónicos interactivos</p>
        </div>
        <div className="flex gap-2 items-center">
          {activeEmap && (
            <button onClick={() => setEditMode(v => !v)}
              className={`text-sm px-3 py-1.5 rounded-lg border transition-colors
                ${editMode ? "border-blue-600 text-blue-400 bg-blue-900/20" : "border-slate-700 text-slate-400 hover:border-slate-500"}`}>
              {editMode ? "✓ Editando" : "✏️ Editar"}
            </button>
          )}
          <button onClick={() => setShowCreate(true)}
            className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors">
            + Nuevo plano
          </button>
        </div>
      </div>

      {/* Tabs de mapas */}
      {emaps.length > 0 && (
        <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
          {emaps.map(e => (
            <button key={e.id}
              onClick={() => setActiveEmapId(e.id)}
              className={`shrink-0 text-sm px-4 py-1.5 rounded-lg transition-colors ${
                (activeEmap?.id === e.id)
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              }`}>
              {e.name}
            </button>
          ))}
        </div>
      )}

      {/* Contenido principal */}
      {isLoading ? (
        <p className="text-slate-500 text-sm">Cargando…</p>
      ) : !activeEmap ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
          <span className="text-5xl">🗺️</span>
          <p className="text-sm">No hay planos creados.</p>
          <button onClick={() => setShowCreate(true)}
            className="text-sm px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
            Crear primer plano
          </button>
        </div>
      ) : (
        <div className="flex-1 flex gap-3 min-h-0">
          {/* Mapa */}
          <div className="flex-1 relative rounded-xl overflow-hidden border border-slate-800 bg-slate-900"
            ref={mapRef}
            onDragOver={e => e.preventDefault()}
            onDrop={handleMapDrop}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeEmap.imageUrl} alt={activeEmap.name}
              className="w-full h-full object-contain select-none pointer-events-none" />

            {/* Íconos de cámaras */}
            {activeEmap.devices.map(device => {
              const dvr    = dvrs.find(d => d.id === device.dvrId);
              const isOnline = dvr?.status === "ONLINE";
              return (
                <div key={device.id}
                  draggable={editMode}
                  onDragStart={() => {/* mover cámara existente */}}
                  onDragEnd={e => editMode && handleDeviceDrop(e as unknown as React.DragEvent<HTMLDivElement>, device)}
                  style={{ left: `${device.x * 100}%`, top: `${device.y * 100}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                  onClick={() => !editMode && dvr && setLiveModal({ dvrId: dvr.id, channel: device.channel, name: `${dvr.name} CH${device.channel}` })}>

                  {/* Ícono cámara */}
                  <div className={`relative w-9 h-9 rounded-full border-2 flex items-center justify-center text-lg shadow-lg transition-transform group-hover:scale-110 ${
                    isOnline ? "bg-green-900/80 border-green-500" : "bg-red-900/80 border-red-500"
                  }`}>
                    📹
                    {/* Punto de estado */}
                    <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                      isOnline ? "bg-green-400 animate-pulse" : "bg-red-500"
                    }`} />
                  </div>

                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    {device.label ?? `${dvr?.name ?? "DVR"} — CH${device.channel}`}
                  </div>

                  {/* Botón eliminar (modo edición) */}
                  {editMode && (
                    <button onClick={e => { e.stopPropagation(); removeDevice.mutate({ id: device.id }); }}
                      className="absolute -top-2 -right-2 w-4 h-4 bg-red-600 hover:bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                      ✕
                    </button>
                  )}
                </div>
              );
            })}

            {/* Overlay modo edición */}
            {editMode && (
              <div className="absolute bottom-2 left-2 bg-blue-900/80 border border-blue-700 text-blue-300 text-xs px-3 py-1.5 rounded-lg">
                ✏️ Arrastra cámaras del panel → mapa
              </div>
            )}
          </div>

          {/* Panel lateral — modo edición */}
          {editMode && (
            <div className="w-56 bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-col gap-2 overflow-y-auto">
              <p className="text-slate-400 text-xs font-medium mb-1">📹 Arrastra al mapa</p>
              {availableDvrs.length === 0 ? (
                <p className="text-slate-600 text-xs">Todos los canales ya están en el mapa</p>
              ) : availableDvrs.slice(0, 50).map(d => (
                <div key={d.key}
                  draggable
                  onDragStart={() => setDraggingDevice({ dvrId: d.dvrId, channel: d.channel, label: `${d.dvrName} CH${d.channel}` })}
                  onDragEnd={() => setDraggingDevice(null)}
                  className="flex items-center gap-2 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg cursor-grab active:cursor-grabbing border border-slate-700 hover:border-slate-500 transition-colors">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${d.status === "ONLINE" ? "bg-green-400" : "bg-slate-600"}`} />
                  <div className="min-w-0">
                    <p className="text-white text-xs truncate font-medium">{d.dvrName}</p>
                    <p className="text-slate-500 text-xs">CH {d.channel}</p>
                  </div>
                </div>
              ))}

              {/* Eliminar mapa */}
              <div className="border-t border-slate-800 pt-2 mt-auto">
                <button
                  onClick={() => { if (confirm(`¿Eliminar el mapa "${activeEmap.name}"?`)) { deleteEmap.mutate({ id: activeEmap.id }); setEditMode(false); } }}
                  className="w-full text-xs text-red-400 hover:text-red-300 py-1.5 border border-red-900 hover:border-red-700 rounded-lg transition-colors">
                  🗑 Eliminar mapa
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal: crear mapa */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-white font-semibold text-lg">🗺️ Nuevo plano</h2>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Nombre (ej: Planta 1 — Bodega)"
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            <div>
              <p className="text-slate-500 text-xs mb-2">Subir imagen del plano (PNG, JPG — max 20 MB):</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ""; }} />
              <button onClick={() => fileRef.current?.click()} disabled={uploading || createEmap.isPending}
                className="w-full py-3 border-2 border-dashed border-slate-700 hover:border-blue-600 rounded-xl text-slate-400 hover:text-white transition-colors text-sm disabled:opacity-50">
                {uploading ? "⏳ Subiendo…" : "📂 Seleccionar imagen"}
              </button>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white text-sm px-4 py-2">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: live view al tocar cámara */}
      {liveModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setLiveModal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <p className="text-white font-semibold">📺 {liveModal.name}</p>
              <button onClick={() => setLiveModal(null)} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <LiveView dvrId={liveModal.dvrId} channel={liveModal.channel} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mini LiveView para el modal ──────────────────────────────────────────────

function LiveView({ dvrId, channel }: { dvrId: string; channel: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { useEffect } = require("react") as typeof import("react");

  useEffect(() => {
    let destroyed = false;
    const src = `/api/vms/stream/${dvrId}/${channel}/index.m3u8`;
    async function init() {
      const Hls = (await import("hls.js")).default;
      const video = videoRef.current;
      if (!video || destroyed) return;
      if (Hls.isSupported()) {
        const hls = new Hls({ lowLatencyMode: true });
        hls.loadSource(src);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => { if (!destroyed) video.play().catch(() => {}); });
        return () => hls.destroy();
      }
      video.src = src;
      video.play().catch(() => {});
    }
    const cleanup = init();
    return () => { destroyed = true; cleanup.then(fn => fn?.()); };
  }, [dvrId, channel]);

  return (
    <video ref={videoRef} className="w-full rounded-xl bg-black max-h-72 object-contain" autoPlay muted playsInline controls />
  );
}
