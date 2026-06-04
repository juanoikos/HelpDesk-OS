"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(date: Date | string | null): string {
  if (!date) return "—";
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours   = Math.floor(diff / 3600000);
  const days    = Math.floor(diff / 86400000);

  if (minutes < 1)  return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  if (hours   < 24) return `hace ${hours} h`;
  return `hace ${days} d`;
}

function formatIP(ip: string): string {
  // Ordenar IPs para mostrarlas bien
  return ip;
}

// ── Tipos de dispositivo ──────────────────────────────────────────────────────

const DEVICE_TYPE_CONFIG: Record<string, { label: string; badge: string; icon: string; group: string }> = {
  dvr_nvr:       { label: "DVR/NVR",        badge: "bg-red-900 text-red-300 border border-red-700",         icon: "📹", group: "cameras" },
  dvr_hikvision: { label: "DVR Hikvision",  badge: "bg-red-900 text-red-300 border border-red-700",         icon: "📹", group: "cameras" },
  dvr_dahua:     { label: "DVR Dahua",      badge: "bg-red-900 text-red-300 border border-red-700",         icon: "📹", group: "cameras" },
  ip_camera:     { label: "Cámara IP",      badge: "bg-orange-900 text-orange-300 border border-orange-700", icon: "📷", group: "cameras" },
  switch:        { label: "Switch",         badge: "bg-blue-900 text-blue-300 border border-blue-700",      icon: "🔀", group: "network" },
  switch_router: { label: "Switch/Router",  badge: "bg-blue-900 text-blue-300 border border-blue-700",      icon: "🔀", group: "network" },
  router_ap:     { label: "Router/AP",      badge: "bg-purple-900 text-purple-300 border border-purple-700", icon: "🌐", group: "network" },
  web_device:    { label: "Dispositivo Web", badge: "bg-slate-700 text-slate-300 border border-slate-600",  icon: "💻", group: "devices" },
  unknown:       { label: "Desconocido",    badge: "bg-slate-800 text-slate-400 border border-slate-700",   icon: "❓", group: "unknown" },
};

function getDeviceConfig(type: string) {
  return DEVICE_TYPE_CONFIG[type] ?? DEVICE_TYPE_CONFIG.unknown;
}

// ── Tabs de filtro ────────────────────────────────────────────────────────────

const FILTER_TABS = [
  { id: "all",     label: "Todos" },
  { id: "cameras", label: "📹 Cámaras/DVR" },
  { id: "network", label: "🔀 Red" },
  { id: "devices", label: "💻 Equipos" },
  { id: "unknown", label: "❓ Desconocidos" },
];

// ── Componente Badge de tipo ──────────────────────────────────────────────────

function DeviceTypeBadge({ type }: { type: string }) {
  const cfg = getDeviceConfig(type);
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.badge}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Componente Chips de puertos ───────────────────────────────────────────────

function PortChips({ ports }: { ports: number[] | null }) {
  if (!ports || ports.length === 0) return <span className="text-slate-600 text-xs">—</span>;

  const portLabels: Record<number, string> = {
    80:    "80",
    443:   "443",
    22:    "22",
    23:    "23",
    554:   "554",
    8000:  "8000",
    8080:  "8080",
    8443:  "8443",
    37777: "37777",
    34567: "34567",
    5000:  "5000",
    9000:  "9000",
    4567:  "4567",
  };

  const portColors: Record<number, string> = {
    80:    "bg-blue-900/50 text-blue-400",
    443:   "bg-green-900/50 text-green-400",
    22:    "bg-yellow-900/50 text-yellow-400",
    554:   "bg-red-900/50 text-red-400",
    8000:  "bg-orange-900/50 text-orange-400",
    37777: "bg-purple-900/50 text-purple-400",
  };

  return (
    <div className="flex flex-wrap gap-1">
      {ports.map((p) => (
        <span key={p} className={`text-xs px-1.5 py-0.5 rounded ${portColors[p] ?? "bg-slate-800 text-slate-400"}`}>
          {portLabels[p] ?? p}
        </span>
      ))}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function NetworkPage() {
  const utils       = trpc.useUtils();
  const devicesQ    = trpc.networkDevices.list.useQuery();
  const lastScanQ   = trpc.networkDevices.getLastScan.useQuery();
  const deleteMut   = trpc.networkDevices.delete.useMutation({
    onSuccess: () => {
      utils.networkDevices.list.invalidate();
      utils.networkDevices.getLastScan.invalidate();
    },
  });
  const clearMut    = trpc.networkDevices.clearAll.useMutation({
    onSuccess: () => {
      utils.networkDevices.list.invalidate();
      utils.networkDevices.getLastScan.invalidate();
    },
  });

  const [activeTab, setActiveTab] = useState("all");

  const devices  = devicesQ.data ?? [];
  const lastScan = lastScanQ.data;

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total    = devices.length;
  const cameras  = devices.filter((d) => ["dvr_nvr", "dvr_hikvision", "dvr_dahua", "ip_camera"].includes(d.deviceType)).length;
  const network  = devices.filter((d) => ["switch", "switch_router", "router_ap"].includes(d.deviceType)).length;
  const unknown  = devices.filter((d) => d.deviceType === "unknown").length;

  // ── Filtrado por tab ───────────────────────────────────────────────────────
  const filtered = devices.filter((d) => {
    if (activeTab === "all") return true;
    const cfg = getDeviceConfig(d.deviceType);
    return cfg.group === activeTab;
  });

  // ── Conteos por tab ────────────────────────────────────────────────────────
  const tabCounts: Record<string, number> = {
    all:     total,
    cameras: cameras,
    network: network,
    devices: devices.filter((d) => getDeviceConfig(d.deviceType).group === "devices").length,
    unknown: unknown,
  };

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-semibold">🔍 Red — Dispositivos descubiertos</h1>
          {lastScan ? (
            <p className="text-slate-500 text-sm mt-0.5">
              Último scan: {relativeTime(lastScan.lastSeenAt)} desde{" "}
              <span className="text-slate-400">{lastScan.scannedFrom}</span>
              {lastScan.subnet && (
                <span className="text-slate-500"> ({lastScan.subnet})</span>
              )}
              {" "}—{" "}
              <span className="text-slate-400">{lastScan.deviceCount} dispositivos</span>
            </p>
          ) : (
            <p className="text-slate-500 text-sm mt-0.5">Sin scans aún</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {devices.length > 0 && (
            <button
              onClick={() => {
                if (confirm("¿Eliminar todos los dispositivos de red? Esta acción no se puede deshacer.")) {
                  clearMut.mutate();
                }
              }}
              disabled={clearMut.isPending}
              className="bg-slate-800 hover:bg-red-900/50 disabled:opacity-50 text-slate-400 hover:text-red-300 text-sm px-3 py-2 rounded-lg transition-colors border border-slate-700"
            >
              {clearMut.isPending ? "Eliminando…" : "🗑 Limpiar todo"}
            </button>
          )}
          <a
            href="/api/agent/scanner"
            download="helpdesk-scanner.bat"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-1.5"
          >
            ⬇ Descargar scanner
          </a>
        </div>
      </div>

      {/* ── Stats cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total dispositivos", value: total,   color: "text-white" },
          { label: "Cámaras / DVR",      value: cameras, color: "text-red-400" },
          { label: "Switches / Routers", value: network, color: "text-blue-400" },
          { label: "Desconocidos",        value: unknown, color: "text-slate-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-slate-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Tabs de filtro ───────────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-4 bg-slate-900 border border-slate-800 rounded-xl p-1 w-fit">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              activeTab === tab.id
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
          >
            {tab.label}
            {tabCounts[tab.id] > 0 && (
              <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.id ? "bg-slate-600 text-slate-200" : "bg-slate-800 text-slate-500"
              }`}>
                {tabCounts[tab.id]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tabla ────────────────────────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {devicesQ.isLoading ? (
          <div className="p-12 text-center text-slate-500">Cargando dispositivos…</div>
        ) : devices.length === 0 ? (
          <div className="p-16 text-center">
            <div className="text-4xl mb-4">🔍</div>
            <p className="text-slate-300 text-lg font-medium mb-2">
              Aún no hay dispositivos escaneados
            </p>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              Descarga el scanner y ejecútalo en un equipo de la red para descubrir automáticamente
              todos los dispositivos: cámaras IP, DVRs, switches, routers y más.
            </p>
            <a
              href="/api/agent/scanner"
              download="helpdesk-scanner.bat"
              className="inline-flex items-center gap-2 mt-6 bg-blue-600 hover:bg-blue-700 text-white text-sm px-5 py-2.5 rounded-lg font-medium transition-colors"
            >
              ⬇ Descargar helpdesk-scanner.bat
            </a>
            <p className="text-slate-600 text-xs mt-3">
              También necesitas <code className="bg-slate-800 px-1 rounded">helpdesk-scanner.exe</code> en la misma carpeta
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            Sin dispositivos en esta categoría.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">IP</th>
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">MAC</th>
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">Fabricante</th>
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">Tipo</th>
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">Puertos</th>
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">Título HTTP</th>
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">ONVIF</th>
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">Activo</th>
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">Última vez</th>
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((device) => (
                  <tr key={device.id} className="hover:bg-slate-800/40 transition-colors group">
                    {/* IP */}
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold text-white text-sm">{formatIP(device.ip)}</span>
                      {device.hostname && (
                        <div className="text-slate-500 text-xs font-mono mt-0.5 truncate max-w-[140px]" title={device.hostname}>
                          {device.hostname}
                        </div>
                      )}
                    </td>

                    {/* MAC */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-slate-400 text-xs">{device.mac ?? "—"}</span>
                    </td>

                    {/* Vendor */}
                    <td className="px-4 py-3 max-w-[180px]">
                      <span className="text-slate-300 text-xs truncate block" title={device.vendor ?? ""}>
                        {device.vendor ?? <span className="text-slate-600">—</span>}
                      </span>
                    </td>

                    {/* Tipo */}
                    <td className="px-4 py-3">
                      <DeviceTypeBadge type={device.deviceType} />
                    </td>

                    {/* Puertos */}
                    <td className="px-4 py-3 max-w-[180px]">
                      <PortChips ports={device.openPorts as number[] | null} />
                    </td>

                    {/* HTTP Title */}
                    <td className="px-4 py-3 max-w-[160px]">
                      {device.httpTitle ? (
                        <span className="text-slate-400 text-xs truncate block" title={device.httpTitle}>
                          {device.httpTitle}
                        </span>
                      ) : (
                        <span className="text-slate-600 text-xs">—</span>
                      )}
                    </td>

                    {/* ONVIF */}
                    <td className="px-4 py-3">
                      {device.onvif ? (
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-green-900 text-green-300 border border-green-700">
                          ONVIF
                        </span>
                      ) : (
                        <span className="text-slate-700 text-xs">—</span>
                      )}
                    </td>

                    {/* Activo vinculado */}
                    <td className="px-4 py-3">
                      {device.asset ? (
                        <a href="/assets" className="group/asset flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1 text-xs text-green-400 font-medium hover:text-green-300 transition-colors">
                            ✅ {device.asset.username ?? device.asset.hostname}
                          </span>
                          <span className="text-slate-600 text-xs leading-tight">
                            {[device.asset.cpu?.split(" ").slice(0,3).join(" "), device.asset.ramGB ? `${device.asset.ramGB}GB` : null].filter(Boolean).join(" · ")}
                          </span>
                        </a>
                      ) : (
                        <span className="text-slate-700 text-xs">—</span>
                      )}
                    </td>

                    {/* Última vez */}
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {relativeTime(device.lastSeenAt)}
                    </td>

                    {/* Acciones */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <a
                          href={`http://${device.ip}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-slate-400 hover:text-blue-400 transition-colors"
                          title={`Abrir http://${device.ip}`}
                        >
                          ↗
                        </a>
                        {(device.deviceType === "dvr_nvr" || device.deviceType === "ip_camera") && (
                          <a href="/dvrs" title="Agregar a DVRs"
                            className="text-slate-500 hover:text-orange-400 transition-colors text-xs">
                            📹
                          </a>
                        )}
                        <button
                          onClick={() => {
                            if (confirm(`¿Eliminar ${device.ip} del inventario?`)) {
                              deleteMut.mutate({ id: device.id });
                            }
                          }}
                          className="text-slate-600 hover:text-red-400 transition-colors"
                          title="Eliminar"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Footer info ──────────────────────────────────────────────────────── */}
      {devices.length > 0 && (
        <div className="mt-4 text-slate-600 text-xs text-center">
          Los datos se actualizan cada vez que se ejecuta el scanner en la red.
          Ejecutar el scanner sobreescribe los dispositivos ya existentes por IP.
        </div>
      )}
    </div>
  );
}
