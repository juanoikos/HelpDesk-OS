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

function formatDate(date: Date | string | null): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("es-CO", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Tipos de dispositivo ──────────────────────────────────────────────────────

const DEVICE_TYPE_CONFIG: Record<string, { label: string; badge: string; icon: string; group: string }> = {
  dvr_nvr:       { label: "DVR/NVR",         badge: "bg-red-900 text-red-300 border border-red-700",          icon: "📹", group: "cameras" },
  dvr_hikvision: { label: "DVR Hikvision",   badge: "bg-red-900 text-red-300 border border-red-700",          icon: "📹", group: "cameras" },
  dvr_dahua:     { label: "DVR Dahua",       badge: "bg-red-900 text-red-300 border border-red-700",          icon: "📹", group: "cameras" },
  ip_camera:     { label: "Cámara IP",       badge: "bg-orange-900 text-orange-300 border border-orange-700", icon: "📷", group: "cameras" },
  switch:        { label: "Switch",          badge: "bg-blue-900 text-blue-300 border border-blue-700",       icon: "🔀", group: "network" },
  switch_router: { label: "Switch/Router",   badge: "bg-blue-900 text-blue-300 border border-blue-700",       icon: "🔀", group: "network" },
  router_ap:     { label: "Router/AP",       badge: "bg-purple-900 text-purple-300 border border-purple-700", icon: "🌐", group: "network" },
  web_device:    { label: "Dispositivo Web", badge: "bg-slate-700 text-slate-300 border border-slate-600",    icon: "💻", group: "devices" },
  unknown:       { label: "Desconocido",     badge: "bg-slate-800 text-slate-400 border border-slate-700",    icon: "❓", group: "unknown" },
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

// ── Badge de tipo ─────────────────────────────────────────────────────────────

function DeviceTypeBadge({ type }: { type: string }) {
  const cfg = getDeviceConfig(type);
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.badge}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ── Chips de puertos ──────────────────────────────────────────────────────────

function PortChips({ ports }: { ports: number[] | null }) {
  if (!ports || ports.length === 0) return <span className="text-slate-600 text-xs">—</span>;

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
          {p}
        </span>
      ))}
    </div>
  );
}

// ── Lógica de conexión ────────────────────────────────────────────────────────

interface ConnectOption {
  label: string;
  icon:  string;
  proto: "http" | "https" | "ssh" | "rdp" | "telnet" | "rtsp";
  port:  number;
}

function getConnectOptions(deviceType: string, ports: number[]): ConnectOption[] {
  const opts: ConnectOption[] = [];

  // HTTPS primero (más seguro)
  if (ports.includes(8443)) opts.push({ label: "HTTPS :8443", icon: "🔒", proto: "https", port: 8443 });
  if (ports.includes(443))  opts.push({ label: "HTTPS",       icon: "🔒", proto: "https", port: 443  });

  // HTTP
  if (ports.includes(8080)) opts.push({ label: "HTTP :8080",  icon: "🌐", proto: "http", port: 8080 });
  if (ports.includes(8000)) opts.push({ label: "HTTP :8000",  icon: "🌐", proto: "http", port: 8000 });
  if (ports.includes(80))   opts.push({ label: "HTTP",        icon: "🌐", proto: "http", port: 80   });

  // DVR puertos especiales
  if (ports.includes(37777)) opts.push({ label: "Dahua :37777", icon: "📹", proto: "http", port: 37777 });
  if (ports.includes(34567)) opts.push({ label: "DVR :34567",   icon: "📹", proto: "http", port: 34567 });
  if (ports.includes(5000))  opts.push({ label: "HTTP :5000",   icon: "🌐", proto: "http", port: 5000  });
  if (ports.includes(9000))  opts.push({ label: "HTTP :9000",   icon: "🌐", proto: "http", port: 9000  });

  // SSH
  if (ports.includes(22)) opts.push({ label: "SSH", icon: "🖥", proto: "ssh", port: 22 });

  // Telnet (routers antiguos)
  if (ports.includes(23)) opts.push({ label: "Telnet", icon: "📟", proto: "telnet", port: 23 });

  // RTSP (cámaras)
  if (ports.includes(554)) opts.push({ label: "RTSP :554", icon: "🎥", proto: "rtsp", port: 554 });

  return opts;
}

// ── Modal de conexión ─────────────────────────────────────────────────────────

interface DeviceForModal {
  id:         string;
  ip:         string;
  hostname:   string | null;
  deviceType: string;
  vendor:     string | null;
  openPorts:  unknown;
}

function ConnectModal({
  device,
  onClose,
}: {
  device: DeviceForModal;
  onClose: () => void;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [copied,   setCopied]   = useState("");

  const ports   = (device.openPorts as number[] | null) ?? [];
  const options = getConnectOptions(device.deviceType, ports);

  function buildUrl(opt: ConnectOption): string {
    const base = `${opt.proto}://${device.ip}${opt.port !== 80 && opt.port !== 443 ? `:${opt.port}` : ""}`;
    return base;
  }

  function handleConnect(opt: ConnectOption) {
    if (opt.proto === "ssh") {
      const cmd = username ? `ssh ${username}@${device.ip}` : `ssh ${device.ip}`;
      navigator.clipboard.writeText(cmd).then(() => {
        setCopied("ssh");
        setTimeout(() => setCopied(""), 2000);
      });
      return;
    }
    if (opt.proto === "telnet") {
      const cmd = `telnet ${device.ip}`;
      navigator.clipboard.writeText(cmd).then(() => {
        setCopied("telnet");
        setTimeout(() => setCopied(""), 2000);
      });
      return;
    }
    if (opt.proto === "rtsp") {
      const url = username
        ? `rtsp://${username}:${password}@${device.ip}:${opt.port}/`
        : `rtsp://${device.ip}:${opt.port}/`;
      navigator.clipboard.writeText(url).then(() => {
        setCopied("rtsp");
        setTimeout(() => setCopied(""), 2000);
      });
      return;
    }
    // HTTP/HTTPS — abrir en nueva pestaña
    window.open(buildUrl(opt), "_blank", "noopener,noreferrer");
  }

  function copyCredentials() {
    const text = [username && `Usuario: ${username}`, password && `Contraseña: ${password}`]
      .filter(Boolean).join("\n");
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied("creds");
      setTimeout(() => setCopied(""), 2000);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md mx-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <DeviceTypeBadge type={device.deviceType} />
            </div>
            <div className="font-mono text-white font-bold text-lg">{device.ip}</div>
            {device.hostname && (
              <div className="text-slate-500 text-xs font-mono">{device.hostname}</div>
            )}
            {device.vendor && (
              <div className="text-slate-400 text-xs mt-0.5">{device.vendor}</div>
            )}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none mt-0.5">✕</button>
        </div>

        {/* Credenciales */}
        <div className="p-5 border-b border-slate-800">
          <p className="text-slate-400 text-xs mb-3 uppercase tracking-wide font-medium">Credenciales (opcional)</p>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              placeholder="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
              autoComplete="off"
            />
            <div className="relative flex-1">
              <input
                type={showPass ? "text" : "password"}
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 pr-8"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setShowPass(!showPass)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
              >
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
          </div>
          {(username || password) && (
            <button
              onClick={copyCredentials}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              {copied === "creds" ? "✅ Copiadas" : "📋 Copiar credenciales"}
            </button>
          )}
        </div>

        {/* Opciones de conexión */}
        <div className="p-5">
          <p className="text-slate-400 text-xs mb-3 uppercase tracking-wide font-medium">Métodos de acceso detectados</p>
          {options.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-slate-500 text-sm">No se detectaron puertos de administración abiertos.</p>
              <p className="text-slate-600 text-xs mt-1">Intenta abrir <span className="font-mono text-slate-500">http://{device.ip}</span> en el navegador.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {options.map((opt) => (
                <button
                  key={`${opt.proto}-${opt.port}`}
                  onClick={() => handleConnect(opt)}
                  className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 rounded-lg px-3 py-2.5 text-sm text-white transition-colors text-left"
                >
                  <span className="text-base">{opt.icon}</span>
                  <div>
                    <div className="font-medium text-xs">{opt.label}</div>
                    <div className="text-slate-500 text-xs">
                      {opt.proto === "ssh"    && (copied === "ssh"    ? "✅ Copiado" : "Copiar comando")}
                      {opt.proto === "telnet" && (copied === "telnet" ? "✅ Copiado" : "Copiar comando")}
                      {opt.proto === "rtsp"   && (copied === "rtsp"   ? "✅ Copiado" : "Copiar URL")}
                      {(opt.proto === "http" || opt.proto === "https") && "Abrir en navegador"}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {/* Acceso HTTP directo si no tiene puertos pero puede tener interfaz */}
          {options.filter(o => o.proto === "http" || o.proto === "https").length === 0 && (
            <button
              onClick={() => window.open(`http://${device.ip}`, "_blank", "noopener,noreferrer")}
              className="mt-2 w-full flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 border border-dashed border-slate-700 rounded-lg px-3 py-2.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              <span>🌐</span>
              <span className="text-xs">Intentar http://{device.ip}</span>
            </button>
          )}
        </div>

        {/* Footer nota */}
        <div className="px-5 pb-4 text-slate-600 text-xs">
          Las credenciales no se guardan — solo se usan en esta sesión.
        </div>
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function NetworkPage() {
  const utils      = trpc.useUtils();
  const scansQ     = trpc.networkDevices.listScans.useQuery();
  const [selectedScanId, setSelectedScanId] = useState<string | "all">("all");
  const [activeTab,      setActiveTab]      = useState("all");
  const [connectDevice,  setConnectDevice]  = useState<DeviceForModal | null>(null);

  const devicesQ = trpc.networkDevices.list.useQuery(
    selectedScanId === "all" ? undefined : { scanId: selectedScanId },
  );

  const deleteMut = trpc.networkDevices.delete.useMutation({
    onSuccess: () => {
      utils.networkDevices.list.invalidate();
      utils.networkDevices.listScans.invalidate();
    },
  });
  const clearMut = trpc.networkDevices.clearAll.useMutation({
    onSuccess: () => {
      utils.networkDevices.list.invalidate();
      utils.networkDevices.listScans.invalidate();
      setSelectedScanId("all");
    },
  });

  const devices = devicesQ.data ?? [];
  const scans   = scansQ.data  ?? [];

  // Scan seleccionado (para mostrar info)
  const currentScan = selectedScanId === "all"
    ? scans[0]
    : scans.find((s) => s.scanId === selectedScanId);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total   = devices.length;
  const cameras = devices.filter((d) => ["dvr_nvr", "dvr_hikvision", "dvr_dahua", "ip_camera"].includes(d.deviceType)).length;
  const network = devices.filter((d) => ["switch", "switch_router", "router_ap"].includes(d.deviceType)).length;
  const unknown = devices.filter((d) => d.deviceType === "unknown").length;

  // ── Filtrado por tab ───────────────────────────────────────────────────────
  const filtered = devices.filter((d) => {
    if (activeTab === "all") return true;
    return getDeviceConfig(d.deviceType).group === activeTab;
  });

  const tabCounts: Record<string, number> = {
    all:     total,
    cameras: cameras,
    network: network,
    devices: devices.filter((d) => getDeviceConfig(d.deviceType).group === "devices").length,
    unknown: unknown,
  };

  return (
    <div>
      {/* ── Modal de conexión ────────────────────────────────────────────────── */}
      {connectDevice && (
        <ConnectModal device={connectDevice} onClose={() => setConnectDevice(null)} />
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-semibold">🔍 Red — Dispositivos descubiertos</h1>
          {currentScan ? (
            <p className="text-slate-500 text-sm mt-0.5">
              {selectedScanId === "all" ? "Último scan:" : "Scan:"}{" "}
              {relativeTime(currentScan.lastSeenAt)} desde{" "}
              <span className="text-slate-400">{currentScan.scannedFrom}</span>
              {currentScan.subnet && (
                <span className="text-slate-500"> ({currentScan.subnet})</span>
              )}
              {" "}—{" "}
              <span className="text-slate-400">{currentScan.deviceCount} dispositivos</span>
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

      {/* ── Selector de scan (sede/agente) ───────────────────────────────────── */}
      {scans.length > 0 && (
        <div className="mb-5 flex items-center gap-3 flex-wrap">
          <span className="text-slate-500 text-xs uppercase tracking-wide font-medium">Filtrar por scan:</span>
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setSelectedScanId("all")}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                selectedScanId === "all"
                  ? "bg-slate-700 border-slate-600 text-white"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600"
              }`}
            >
              Todos ({scans.reduce((a, s) => a + s.deviceCount, 0)})
            </button>
            {scans.map((s) => (
              <button
                key={s.scanId}
                onClick={() => setSelectedScanId(s.scanId)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors text-left ${
                  selectedScanId === s.scanId
                    ? "bg-blue-900/50 border-blue-700 text-blue-200"
                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-600"
                }`}
              >
                <span className="font-medium">{s.scannedFrom}</span>
                {s.subnet && <span className="text-slate-500 ml-1">· {s.subnet}</span>}
                <span className="ml-1.5 text-slate-500">({s.deviceCount})</span>
                <span className="block text-slate-600" style={{ fontSize: "10px" }}>
                  {formatDate(s.lastSeenAt)}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

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
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">Acceder</th>
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3">Última vez</th>
                  <th className="text-left text-slate-500 text-xs font-medium px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((device) => {
                  const ports   = (device.openPorts as number[] | null) ?? [];
                  const options = getConnectOptions(device.deviceType, ports);
                  const bestOpt = options[0];

                  return (
                    <tr key={device.id} className="hover:bg-slate-800/40 transition-colors group">
                      {/* IP */}
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-white text-sm">{device.ip}</span>
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
                      <td className="px-4 py-3 max-w-[160px]">
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
                        <PortChips ports={ports} />
                      </td>

                      {/* HTTP Title */}
                      <td className="px-4 py-3 max-w-[150px]">
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
                          <a href="/assets" className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-xs text-green-400 font-medium hover:text-green-300 transition-colors">
                              ✅ {device.asset.username ?? device.asset.hostname}
                            </span>
                            <span className="text-slate-600 text-xs leading-tight">
                              {[device.asset.cpu?.split(" ").slice(0, 3).join(" "), device.asset.ramGB ? `${device.asset.ramGB}GB` : null].filter(Boolean).join(" · ")}
                            </span>
                          </a>
                        ) : (
                          <span className="text-slate-700 text-xs">—</span>
                        )}
                      </td>

                      {/* Acceder */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {/* Botón rápido al mejor protocolo */}
                          {bestOpt && (
                            <button
                              onClick={() => {
                                if (bestOpt.proto === "http" || bestOpt.proto === "https") {
                                  window.open(
                                    `${bestOpt.proto}://${device.ip}${bestOpt.port !== 80 && bestOpt.port !== 443 ? `:${bestOpt.port}` : ""}`,
                                    "_blank",
                                    "noopener,noreferrer",
                                  );
                                } else {
                                  setConnectDevice(device);
                                }
                              }}
                              className="text-xs px-2 py-1 rounded bg-blue-900/40 hover:bg-blue-900/70 border border-blue-800/50 text-blue-300 transition-colors"
                              title={`Acceder por ${bestOpt.label}`}
                            >
                              {bestOpt.icon} {bestOpt.label}
                            </button>
                          )}
                          {/* Botón para ver todas las opciones + credenciales */}
                          <button
                            onClick={() => setConnectDevice(device)}
                            className="text-slate-500 hover:text-slate-300 text-xs px-1.5 py-1 rounded hover:bg-slate-800 transition-colors"
                            title="Ver opciones de conexión"
                          >
                            ⋯
                          </button>
                        </div>
                      </td>

                      {/* Última vez */}
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {relativeTime(device.lastSeenAt)}
                      </td>

                      {/* Acciones */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                  );
                })}
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
