"use client";

import { trpc } from "@/trpc/react";
import { useState, useEffect } from "react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isOnline(lastSeenAt: Date | string | null): boolean {
  if (!lastSeenAt) return false;
  const diff = Date.now() - new Date(lastSeenAt).getTime();
  return diff < 7 * 24 * 60 * 60 * 1000;
}

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-ES", {
    day:   "2-digit",
    month: "short",
    year:  "numeric",
    hour:  "2-digit",
    minute:"2-digit",
  });
}

const TYPE_LABEL: Record<string, string> = {
  LAPTOP:  "💻 Laptop",
  DESKTOP: "🖥️ Desktop",
  MONITOR: "🖵 Monitor",
  PHONE:   "📱 Teléfono",
  PRINTER: "🖨️ Impresora",
  SERVER:  "🗄️ Servidor",
  NETWORK: "🌐 Red",
  OTHER:   "📦 Otro",
};

const STATUS_CONFIG: Record<string, { label: string; badge: string }> = {
  ACTIVE:      { label: "Activo",      badge: "bg-green-900 text-green-300" },
  INACTIVE:    { label: "Inactivo",    badge: "bg-slate-700 text-slate-400" },
  MAINTENANCE: { label: "Mant.",       badge: "bg-amber-900 text-amber-300" },
  RETIRED:     { label: "Retirado",    badge: "bg-red-900 text-red-300" },
};

// ─── Create Asset Modal ───────────────────────────────────────────────────────

function CreateAssetModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name:         "",
    type:         "DESKTOP" as "LAPTOP" | "DESKTOP" | "MONITOR" | "PHONE" | "PRINTER" | "SERVER" | "NETWORK" | "OTHER",
    serialNumber: "",
    brand:        "",
    model:        "",
    status:       "ACTIVE" as "ACTIVE" | "INACTIVE" | "MAINTENANCE" | "RETIRED",
  });
  const [error, setError] = useState("");

  const createMutation = trpc.assets.create.useMutation({
    onSuccess: () => { onCreated(); onClose(); },
    onError:   (e) => setError(e.message),
  });

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    setError("");
    createMutation.mutate({
      name:         form.name,
      type:         form.type,
      serialNumber: form.serialNumber || undefined,
      brand:        form.brand || undefined,
      model:        form.model || undefined,
      status:       form.status,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-md">
        <div className="p-6 border-b border-slate-800">
          <h2 className="text-white font-semibold text-lg">Nuevo activo</h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-900/30 border border-red-700 text-red-300 text-sm px-3 py-2 rounded-lg">
              {error}
            </div>
          )}
          <div>
            <label className="block text-slate-400 text-xs mb-1">Nombre *</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="PC-RECEPCION-01"
              required
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1">Tipo *</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                {Object.entries(TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Estado</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                  <option key={v} value={v}>{c.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-400 text-xs mb-1">Marca</label>
              <input
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="Dell, HP, Lenovo…"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-400 text-xs mb-1">Modelo</label>
              <input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="OptiPlex 7010"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Número de serie</label>
            <input
              value={form.serialNumber}
              onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
              placeholder="SN-XXXXXXXX"
              className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg px-4 py-2 text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors"
            >
              {createMutation.isPending ? "Guardando…" : "Crear activo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Hardware Detail Panel ────────────────────────────────────────────────────

function HardwareDetail({ asset, onClose }: { asset: ReturnType<typeof useAssetDetail>["data"]; onClose: () => void }) {
  if (!asset) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hw = asset.hardwareData as Record<string, any> | null;
  const utils = trpc.useUtils();
  const [assetNumber, setAssetNumber] = useState(asset.assetNumber ?? "");
  const [location,    setLocation]    = useState(asset.location ?? "");
  const [saving,      setSaving]      = useState(false);
  const [saved,       setSaved]       = useState(false);
  const [confirming,  setConfirming]  = useState(false);

  const deleteMut = trpc.assets.delete.useMutation({
    onSuccess: () => {
      utils.assets.list.invalidate();
      onClose();
    },
  });

  useEffect(() => {
    setAssetNumber(asset.assetNumber ?? "");
    setLocation(asset.location ?? "");
  }, [asset.id, asset.assetNumber, asset.location]);

  const updateMut = trpc.assets.update.useMutation({
    onSuccess: () => {
      utils.assets.list.invalidate();
      setSaved(true);
      setSaving(false);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: () => setSaving(false),
  });

  const handleSave = () => {
    setSaving(true);
    setSaved(false);
    updateMut.mutate({ id: asset.id, assetNumber: assetNumber || null, location: location || null });
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-end z-50">
      <div className="bg-slate-900 border-l border-slate-700 w-full max-w-2xl h-full overflow-y-auto">
        <div className="sticky top-0 bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold">{asset.hostname ?? asset.name}</h2>
            <p className="text-slate-500 text-xs mt-0.5">
              {asset.username && `👤 ${asset.username}  ·  `}
              {TYPE_LABEL[asset.type]}
              {asset.ipAddress && `  ·  🌐 ${asset.ipAddress}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!confirming ? (
              <button
                onClick={() => setConfirming(true)}
                className="text-slate-600 hover:text-red-400 transition-colors text-xs"
                title="Eliminar activo"
              >
                🗑 Eliminar
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-red-400 text-xs">¿Eliminar este activo?</span>
                <button
                  onClick={() => deleteMut.mutate({ id: asset.id })}
                  disabled={deleteMut.isPending}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleteMut.isPending ? "…" : "Sí, eliminar"}
                </button>
                <button
                  onClick={() => setConfirming(false)}
                  className="text-slate-500 hover:text-slate-300 text-xs px-2 py-1"
                >
                  Cancelar
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-xl leading-none">✕</button>
          </div>
        </div>

        <div className="p-6 space-y-6">

          {/* Campos editables: número de activo y sede */}
          <section className="bg-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-slate-300 text-sm font-semibold">Gestión del activo</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-500 text-xs block mb-1">Número de activo</label>
                <input
                  value={assetNumber}
                  onChange={(e) => setAssetNumber(e.target.value)}
                  placeholder="Ej: DYC-001, PC-032..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-slate-500 text-xs block mb-1">Sede / Tienda</label>
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Ej: Oficina Bogotá, Tienda Norte..."
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                {saving ? "Guardando..." : saved ? "✓ Guardado" : "Guardar"}
              </button>
            </div>
          </section>

          {/* Basic info */}
          <section>
            <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Información general</h3>
            <div className="bg-slate-800 rounded-lg divide-y divide-slate-700">
              {[
                ["Sistema operativo", asset.osName],
                ["Dirección IP",      asset.ipAddress],
                ["MAC Address",      asset.macAddress],
                ["Número de serie",  asset.serialNumber],
                ["Versión agente",   asset.agentVersion],
                ["Última conexión",  asset.lastSeenAt ? formatDate(asset.lastSeenAt) : null],
              ].map(([label, value]) => value ? (
                <div key={label} className="flex px-4 py-2.5 gap-4">
                  <span className="text-slate-500 text-sm w-36 shrink-0">{label}</span>
                  <span className="text-slate-200 text-sm">{String(value)}</span>
                </div>
              ) : null)}
            </div>
          </section>

          {/* CPU */}
          {(asset.cpu || hw?.cpu) && (
            <section>
              <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Procesador</h3>
              <div className="bg-slate-800 rounded-lg p-4">
                <p className="text-slate-200 text-sm">{asset.cpu}</p>
                {hw?.cpu && (
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-400">
                    {hw.cpu.cores   && <span>🔲 {hw.cpu.cores} núcleos</span>}
                    {hw.cpu.threads && <span>🔗 {hw.cpu.threads} hilos</span>}
                    {hw.cpu.mhz     && <span>⚡ {Math.round(hw.cpu.mhz / 1000 * 10) / 10} GHz</span>}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* RAM */}
          {(asset.ramGB || hw?.ram) && (
            <section>
              <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Memoria RAM — {asset.ramGB} GB total</h3>
              <div className="space-y-2">
                {hw?.ram && Array.isArray(hw.ram) ? hw.ram.map((mod: Record<string, unknown>, i: number) => (
                  <div key={i} className="bg-slate-800 rounded-lg px-4 py-3 flex justify-between items-start">
                    <div>
                      <span className="text-slate-200 text-sm">{String(mod.manufacturer ?? "—")} · {String(mod.partNumber ?? "—")}</span>
                      <p className="text-slate-500 text-xs mt-0.5">S/N: {String(mod.serial ?? "—")} · {String(mod.speed ?? "—")} MHz</p>
                    </div>
                    <span className="text-blue-400 text-sm font-medium">{String(mod.sizeGB ?? "?")} GB</span>
                  </div>
                )) : (
                  <div className="bg-slate-800 rounded-lg px-4 py-3">
                    <span className="text-slate-200 text-sm">{asset.ramGB} GB</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Disks */}
          {(asset.diskInfo || hw?.disks) && (
            <section>
              <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Almacenamiento</h3>
              <div className="space-y-2">
                {hw?.disks && Array.isArray(hw.disks) ? hw.disks.map((d: Record<string, unknown>, i: number) => (
                  <div key={i} className="bg-slate-800 rounded-lg px-4 py-3 flex justify-between items-start">
                    <div>
                      <span className="text-slate-200 text-sm">{String(d.model ?? "—")}</span>
                      <p className="text-slate-500 text-xs mt-0.5">S/N: {String(d.serial ?? "—")} · {String(d.interface ?? "—")} · {String(d.mediaType ?? "—")}</p>
                    </div>
                    <span className="text-green-400 text-sm font-medium">{String(d.sizeGB ?? "?")} GB</span>
                  </div>
                )) : (
                  <div className="bg-slate-800 rounded-lg px-4 py-3">
                    <span className="text-slate-200 text-sm">{asset.diskInfo}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Motherboard + BIOS */}
          {(asset.motherboard || hw?.motherboard) && (
            <section>
              <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Placa madre y BIOS</h3>
              <div className="bg-slate-800 rounded-lg divide-y divide-slate-700">
                {asset.motherboard && (
                  <div className="flex px-4 py-2.5 gap-4">
                    <span className="text-slate-500 text-sm w-36 shrink-0">Placa madre</span>
                    <span className="text-slate-200 text-sm">{asset.motherboard}</span>
                  </div>
                )}
                {hw?.motherboard?.serial && (
                  <div className="flex px-4 py-2.5 gap-4">
                    <span className="text-slate-500 text-sm w-36 shrink-0">S/N placa</span>
                    <span className="text-slate-200 text-sm">{hw.motherboard.serial}</span>
                  </div>
                )}
                {hw?.bios?.version && (
                  <div className="flex px-4 py-2.5 gap-4">
                    <span className="text-slate-500 text-sm w-36 shrink-0">BIOS versión</span>
                    <span className="text-slate-200 text-sm">{hw.bios.version}</span>
                  </div>
                )}
                {hw?.bios?.serial && (
                  <div className="flex px-4 py-2.5 gap-4">
                    <span className="text-slate-500 text-sm w-36 shrink-0">S/N BIOS</span>
                    <span className="text-slate-200 text-sm">{hw.bios.serial}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* GPU */}
          {hw?.gpu && Array.isArray(hw.gpu) && hw.gpu.length > 0 && (
            <section>
              <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Tarjeta gráfica</h3>
              <div className="space-y-2">
                {hw.gpu.map((g: Record<string, unknown>, i: number) => (
                  <div key={i} className="bg-slate-800 rounded-lg px-4 py-3 flex justify-between">
                    <span className="text-slate-200 text-sm">{String(g.name ?? "—")}</span>
                    {g.vramMB ? <span className="text-purple-400 text-sm">{String(g.vramMB)} MB VRAM</span> : null}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Monitores */}
          {hw?.monitors && Array.isArray(hw.monitors) && hw.monitors.length > 0 && (
            <section>
              <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Monitores ({hw.monitors.length})</h3>
              <div className="space-y-2">
                {hw.monitors.map((m: Record<string, unknown>, i: number) => (
                  <div key={i} className="bg-slate-800 rounded-lg px-4 py-3">
                    <p className="text-slate-200 text-sm">{String(m.name || m.manufacturer || "Monitor desconocido")}</p>
                    <div className="flex gap-4 mt-1 flex-wrap">
                      {m.manufacturer ? <span className="text-slate-500 text-xs">Marca: <span className="text-slate-300">{String(m.manufacturer)}</span></span> : null}
                      {m.serial ? <span className="text-slate-500 text-xs">Serial: <span className="text-slate-300 font-mono">{String(m.serial)}</span></span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Mouse */}
          {hw?.mice && Array.isArray(hw.mice) && hw.mice.length > 0 && (
            <section>
              <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Mouse / Apuntador</h3>
              <div className="space-y-2">
                {hw.mice.map((m: Record<string, unknown>, i: number) => (
                  <div key={i} className="bg-slate-800 rounded-lg px-4 py-3 flex justify-between items-center">
                    <span className="text-slate-200 text-sm">{String(m.name ?? "Mouse desconocido")}</span>
                    {m.manufacturer ? <span className="text-slate-500 text-xs">{String(m.manufacturer)}</span> : null}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* USB */}
          {hw?.usb && Array.isArray(hw.usb) && hw.usb.length > 0 && (
            <section>
              <h3 className="text-slate-400 text-xs uppercase tracking-wider mb-3">Dispositivos USB ({hw.usb.length})</h3>
              <div className="bg-slate-800 rounded-lg divide-y divide-slate-700 max-h-48 overflow-y-auto">
                {hw.usb.map((u: Record<string, unknown>, i: number) => (
                  <div key={i} className="flex px-4 py-2 gap-3">
                    <span className="text-slate-500 text-xs w-24 shrink-0">{String(u.class ?? "—")}</span>
                    <span className="text-slate-300 text-xs">{String(u.name ?? "—")}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function useAssetDetail(id: string | null) {
  return trpc.assets.getById.useQuery(
    { id: id! },
    { enabled: !!id }
  );
}

// ─── Agent Token Panel ────────────────────────────────────────────────────────

function AgentTokenPanel() {
  const utils          = trpc.useUtils();
  const tokenQuery     = trpc.assets.getToken.useQuery(undefined, { retry: false });
  const generateMut    = trpc.assets.generateToken.useMutation({
    onSuccess: () => utils.assets.getToken.invalidate(),
  });
  const [copied, setCopied] = useState(false);

  const token = tokenQuery.data?.agentToken;

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (tokenQuery.isError) return null; // non-admin, skip

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h3 className="text-slate-200 text-sm font-medium mb-1">Token del agente de inventario</h3>
          {token ? (
            <div className="flex items-center gap-2 mt-2">
              <code className="bg-slate-800 text-slate-300 text-xs px-3 py-1.5 rounded-lg font-mono">
                {token.slice(0, 8)}••••{token.slice(-4)}
              </code>
              <button
                onClick={copyToken}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                {copied ? "✓ Copiado" : "Copiar token"}
              </button>
            </div>
          ) : (
            <p className="text-slate-500 text-xs mt-1">Sin token generado</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/agent/script"
            download="helpdesk-agent.ps1"
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5"
          >
            ⬇ Descargar agente .ps1
          </a>
          <button
            onClick={() => {
              if (confirm(token ? "¿Regenerar token? Los agentes anteriores dejarán de funcionar." : "¿Generar token de agente?")) {
                generateMut.mutate();
              }
            }}
            disabled={generateMut.isPending}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm px-3 py-1.5 rounded-lg transition-colors"
          >
            {generateMut.isPending ? "…" : token ? "↻ Regenerar" : "+ Generar token"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const utils        = trpc.useUtils();
  const assetsQuery  = trpc.assets.list.useQuery();
  const assets       = assetsQuery.data ?? [];

  const [showCreate,      setShowCreate]    = useState(false);
  const [selectedId,      setSelectedId]    = useState<string | null>(null);
  const [filterType,      setFilterType]    = useState<string>("ALL");
  const [filterStatus,    setFilterStatus]  = useState<string>("ALL");
  const [filterLocation,  setFilterLocation] = useState<string>("");
  const [search,          setSearch]        = useState("");

  // Construir URL de exportación con los filtros activos
  const exportUrl = () => {
    const p = new URLSearchParams();
    if (filterType   !== "ALL") p.set("type",   filterType);
    if (filterStatus !== "ALL") p.set("status", filterStatus);
    if (filterLocation.trim())  p.set("location", filterLocation.trim());
    if (search.trim())          p.set("search",   search.trim());
    const qs = p.toString();
    return `/api/assets/export${qs ? "?" + qs : ""}`;
  };

  const detailQuery = useAssetDetail(selectedId);

  // Stats
  const total    = assets.length;
  const laptops  = assets.filter((a) => a.type === "LAPTOP").length;
  const desktops = assets.filter((a) => a.type === "DESKTOP").length;
  const online   = assets.filter((a) => isOnline(a.lastSeenAt)).length;

  // Filtered
  const filtered = assets.filter((a) => {
    if (filterType     !== "ALL" && a.type   !== filterType)   return false;
    if (filterStatus   !== "ALL" && a.status !== filterStatus) return false;
    if (filterLocation && !(a.location ?? "").toLowerCase().includes(filterLocation.toLowerCase())) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (a.hostname ?? a.name).toLowerCase().includes(q)  ||
        (a.username     ?? "").toLowerCase().includes(q)  ||
        (a.osName       ?? "").toLowerCase().includes(q)  ||
        (a.cpu          ?? "").toLowerCase().includes(q)  ||
        (a.ipAddress    ?? "").toLowerCase().includes(q)  ||
        (a.assetNumber  ?? "").toLowerCase().includes(q)  ||
        (a.location     ?? "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-white text-2xl font-semibold">🖥️ Activos</h1>
          <p className="text-slate-500 text-sm mt-0.5">Inventario de hardware y equipos</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
        >
          + Nuevo activo
        </button>
      </div>

      {/* Agent Token Panel */}
      <AgentTokenPanel />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total equipos",  value: total,    color: "text-white" },
          { label: "Laptops",        value: laptops,  color: "text-blue-400" },
          { label: "Desktops",       value: desktops, color: "text-indigo-400" },
          { label: "En línea (7d)",  value: online,   color: "text-green-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className={`text-3xl font-bold ${color}`}>{value}</div>
            <div className="text-slate-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      {(() => {
        const hasFilters = search || filterType !== "ALL" || filterStatus !== "ALL" || filterLocation;
        const activeCount = [search, filterType !== "ALL", filterStatus !== "ALL", filterLocation].filter(Boolean).length;
        return (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-slate-400 text-sm font-medium">🔍 Filtros</span>
                {activeCount > 0 && (
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {activeCount} activo{activeCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {hasFilters && (
                  <button
                    onClick={() => { setSearch(""); setFilterType("ALL"); setFilterStatus("ALL"); setFilterLocation(""); }}
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors underline"
                  >
                    Limpiar filtros
                  </button>
                )}
                <a
                  href={exportUrl()}
                  download
                  className="flex items-center gap-2 bg-green-700 hover:bg-green-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  ⬇ Exportar Excel
                </a>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="lg:col-span-2">
                <label className="block text-slate-500 text-xs mb-1">Buscar</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Equipo, usuario, OS, IP, N° activo…"
                    className="w-full bg-slate-800 border border-slate-700 text-white placeholder-slate-500 rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                  {search && (
                    <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs">✕</button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-slate-500 text-xs mb-1">Tipo</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${filterType !== "ALL" ? "border-blue-500 text-white" : "border-slate-700 text-slate-300"}`}
                >
                  <option value="ALL">Todos los tipos</option>
                  {Object.entries(TYPE_LABEL).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 text-xs mb-1">Estado</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 ${filterStatus !== "ALL" ? "border-blue-500 text-white" : "border-slate-700 text-slate-300"}`}
                >
                  <option value="ALL">Todos los estados</option>
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                    <option key={v} value={v}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 text-xs mb-1">Sede / Ubicación</label>
                <input
                  value={filterLocation}
                  onChange={(e) => setFilterLocation(e.target.value)}
                  placeholder="Filtrar por sede…"
                  className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 placeholder-slate-500 ${filterLocation ? "border-blue-500 text-white" : "border-slate-700 text-white"}`}
                />
              </div>
              <div className="lg:col-span-3 flex items-end">
                <div className="text-slate-600 text-xs">
                  {filtered.length === assets.length
                    ? `${assets.length} activo${assets.length !== 1 ? "s" : ""} en total`
                    : `${filtered.length} de ${assets.length} activo${assets.length !== 1 ? "s" : ""}`}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {assetsQuery.isLoading ? (
          <div className="p-12 text-center text-slate-500">Cargando activos…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            {assets.length === 0
              ? "Aún no hay activos registrados. Descarga el agente para comenzar el inventario automático, o agrega equipos manualmente."
              : "Sin resultados para el filtro aplicado."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800">
                  {["Equipo", "N° Activo", "Sede / Tienda", "Usuario", "Tipo", "OS", "CPU", "RAM", "Disco", "Última conexión", "Estado"].map((h) => (
                    <th key={h} className="text-left text-slate-500 text-xs font-medium px-4 py-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((asset) => {
                  const online = isOnline(asset.lastSeenAt);
                  return (
                    <tr
                      key={asset.id}
                      onClick={() => setSelectedId(asset.id)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${online ? "bg-green-500" : "bg-slate-600"}`} />
                          <span className="text-white font-medium">{asset.hostname ?? asset.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-mono ${asset.assetNumber ? "text-blue-400" : "text-slate-600"}`}>
                          {asset.assetNumber ?? "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{asset.location ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-400">{asset.username ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{TYPE_LABEL[asset.type] ?? asset.type}</td>
                      <td className="px-4 py-3 text-slate-400 max-w-[160px] truncate">{asset.osName ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-400 max-w-[180px] truncate">{asset.cpu ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{asset.ramGB ? `${asset.ramGB} GB` : "—"}</td>
                      <td className="px-4 py-3 text-slate-400 max-w-[140px] truncate">{asset.diskInfo ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{formatDate(asset.lastSeenAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${STATUS_CONFIG[asset.status]?.badge ?? "bg-slate-700 text-slate-300"}`}>
                          {STATUS_CONFIG[asset.status]?.label ?? asset.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateAssetModal
          onClose={() => setShowCreate(false)}
          onCreated={() => utils.assets.list.invalidate()}
        />
      )}

      {selectedId && (
        <HardwareDetail
          asset={detailQuery.data ?? undefined}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
