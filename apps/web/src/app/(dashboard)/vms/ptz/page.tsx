"use client";

import { trpc } from "@/trpc/react";
import { useState, useCallback, useRef } from "react";
import type { PtzCode } from "@helpdesk-os/dahua-sdk";

// ─── D-Pad + Zoom ─────────────────────────────────────────────────────────────

const DIRECTIONS: { code: PtzCode; label: string; row: number; col: number }[] = [
  { code: "LeftUp",    label: "↖", row: 1, col: 1 },
  { code: "Up",        label: "↑", row: 1, col: 2 },
  { code: "RightUp",   label: "↗", row: 1, col: 3 },
  { code: "Left",      label: "←", row: 2, col: 1 },
  { code: "Right",     label: "→", row: 2, col: 3 },
  { code: "LeftDown",  label: "↙", row: 3, col: 1 },
  { code: "Down",      label: "↓", row: 3, col: 2 },
  { code: "RightDown", label: "↘", row: 3, col: 3 },
];

const ZOOM_FOCUS: { code: PtzCode; label: string; color: string }[] = [
  { code: "ZoomTele",  label: "🔍+", color: "bg-blue-700 hover:bg-blue-600" },
  { code: "ZoomWide",  label: "🔍−", color: "bg-blue-800 hover:bg-blue-700" },
  { code: "FocusNear", label: "🎯+", color: "bg-slate-700 hover:bg-slate-600" },
  { code: "FocusFar",  label: "🎯−", color: "bg-slate-800 hover:bg-slate-700" },
];

// ─── Componente joystick PTZ ──────────────────────────────────────────────────

function PTZJoystick({
  dvrId, channel, speed,
}: { dvrId: string; channel: number; speed: number }) {
  const move    = trpc.vms.ptzMove.useMutation();
  const stop    = trpc.vms.ptzStop.useMutation();
  const [active, setActive] = useState<PtzCode | null>(null);

  const press = useCallback((code: PtzCode) => {
    setActive(code);
    move.mutate({ dvrId, channel, code, speed });
  }, [dvrId, channel, speed, move]);

  const release = useCallback(() => {
    setActive(null);
    stop.mutate({ dvrId, channel });
  }, [dvrId, channel, stop]);

  const btnBase = "w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold select-none touch-none transition-colors";

  return (
    <div className="space-y-3">
      {/* D-pad 3×3 */}
      <div className="grid grid-cols-3 gap-1.5 w-fit mx-auto">
        {Array.from({ length: 3 }, (_, rowIdx) =>
          Array.from({ length: 3 }, (_, colIdx) => {
            const row = rowIdx + 1, col = colIdx + 1;
            const dir = DIRECTIONS.find(d => d.row === row && d.col === col);
            const isCenter = row === 2 && col === 2;

            if (isCenter) return (
              <button key="stop"
                onPointerDown={() => stop.mutate({ dvrId, channel })}
                className={`${btnBase} bg-slate-700 hover:bg-slate-600 text-slate-400 text-base`}>
                ■
              </button>
            );
            if (!dir) return <div key={`${row}-${col}`} className="w-12 h-12" />;

            const isActive = active === dir.code;
            return (
              <button key={dir.code}
                onPointerDown={() => press(dir.code)}
                onPointerUp={release}
                onPointerLeave={release}
                className={`${btnBase} ${isActive
                  ? "bg-blue-500 text-white scale-95"
                  : "bg-slate-800 hover:bg-slate-700 text-white"}`}>
                {dir.label}
              </button>
            );
          })
        )}
      </div>

      {/* Zoom + Focus */}
      <div className="grid grid-cols-4 gap-1.5 w-fit mx-auto">
        {ZOOM_FOCUS.map(btn => {
          const isActive = active === btn.code;
          return (
            <button key={btn.code}
              onPointerDown={() => press(btn.code)}
              onPointerUp={release}
              onPointerLeave={release}
              className={`${btnBase} text-sm text-white ${isActive ? "scale-95 opacity-80" : ""} ${btn.color}`}>
              {btn.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Página PTZ ───────────────────────────────────────────────────────────────

export default function PtzPage() {
  const { data: status } = trpc.vms.status.useQuery();
  const dvrs = (status?.dvrs ?? []).filter(d => d.status === "ONLINE");

  const [dvrId,   setDvrId]   = useState<string>("");
  const [channel, setChannel] = useState<number>(1);
  const [speed,   setSpeed]   = useState<number>(5);
  const [newPresetId, setNewPresetId] = useState<number>(1);

  const selectedDvr = status?.dvrs.find(d => d.id === dvrId);
  const maxChannels  = (selectedDvr as { channels?: number })?.channels ?? 8;

  const { data: presets, refetch: refetchPresets } = trpc.vms.ptzGetPresets.useQuery(
    { dvrId: dvrId || "x", channel },
    { enabled: !!dvrId }
  );

  const gotoPreset  = trpc.vms.ptzGotoPreset.useMutation();
  const savePreset  = trpc.vms.ptzSetPreset.useMutation({
    onSuccess: () => { refetchPresets(); }
  });

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">🕹️ Control PTZ</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          Pan · Tilt · Zoom — control de cámaras motorizadas
        </p>
      </div>

      {/* Selector de DVR + canal */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-slate-500 text-xs mb-1.5 block">DVR / NVR</label>
            <select value={dvrId} onChange={e => { setDvrId(e.target.value); setChannel(1); }}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
              <option value="">— Seleccionar —</option>
              {(status?.dvrs ?? []).map(d => (
                <option key={d.id} value={d.id} disabled={d.status !== "ONLINE"}>
                  {d.status === "ONLINE" ? "🟢" : "🔴"} {d.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-slate-500 text-xs mb-1.5 block">Canal</label>
            <select value={channel} onChange={e => setChannel(parseInt(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
              {Array.from({ length: maxChannels }, (_, i) => (
                <option key={i + 1} value={i + 1}>Canal {i + 1}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Velocidad */}
        <div>
          <label className="text-slate-500 text-xs mb-1.5 block">
            Velocidad: <span className="text-white font-medium">{speed}</span>
          </label>
          <input type="range" min={1} max={10} value={speed}
            onChange={e => setSpeed(parseInt(e.target.value))}
            className="w-full accent-blue-500" />
        </div>
      </div>

      {/* Joystick */}
      {dvrId ? (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4">
          <p className="text-slate-500 text-xs text-center mb-4">
            Mantén presionado para mover · ■ detiene
          </p>
          <PTZJoystick dvrId={dvrId} channel={channel} speed={speed} />
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-4 text-center text-slate-600">
          <p className="text-3xl mb-2">🕹️</p>
          <p className="text-sm">Selecciona un DVR para habilitar el control</p>
        </div>
      )}

      {/* Presets */}
      {dvrId && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-white font-semibold">📍 Presets</h2>

          {/* Lista de presets */}
          {presets && presets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {presets.map(p => (
                <button key={p.presetId}
                  onClick={() => gotoPreset.mutate({ dvrId, channel, presetId: p.presetId })}
                  className="bg-slate-800 hover:bg-blue-900/40 hover:border-blue-600 border border-slate-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors">
                  📍 {p.name}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-slate-600 text-sm">No hay presets configurados en este canal.</p>
          )}

          {/* Guardar posición actual como preset */}
          <div className="border-t border-slate-800 pt-3 flex items-center gap-2 flex-wrap">
            <span className="text-slate-500 text-xs">Guardar posición actual como preset:</span>
            <div className="flex gap-2">
              <input type="number" min={1} max={255} value={newPresetId}
                onChange={e => setNewPresetId(parseInt(e.target.value) || 1)}
                className="w-16 bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-blue-500" />
              <button
                onClick={() => savePreset.mutate({ dvrId, channel, presetId: newPresetId })}
                disabled={savePreset.isPending}
                className="bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm px-3 py-1 rounded-lg transition-colors">
                {savePreset.isPending ? "Guardando…" : "💾 Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
