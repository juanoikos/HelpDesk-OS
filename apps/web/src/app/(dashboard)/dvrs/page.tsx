"use client";

import { trpc } from "@/trpc/react";
import { useState, useRef } from "react";
import Link from "next/link";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === "ONLINE")  return <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />Online</span>;
  if (status === "OFFLINE") return <span className="inline-flex items-center gap-1 text-xs font-medium text-red-400"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Offline</span>;
  return <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500"><span className="w-1.5 h-1.5 rounded-full bg-slate-600" />Sin verificar</span>;
}

// ─── Página ───────────────────────────────────────────────────────────────────

export default function DvrsPage() {
  const utils = trpc.useUtils();
  const { data: dvrs,      isLoading }     = trpc.dvrs.list.useQuery();
  const { data: cred }                     = trpc.dvrs.getCredential.useQuery();
  const { data: netCandidates, isLoading: loadingNet } = trpc.dvrs.networkCandidates.useQuery();

  // Estado modales
  const [showCred,      setShowCred]      = useState(false);
  const [showAdd,       setShowAdd]       = useState(false);
  const [showImport,    setShowImport]    = useState(false);
  const [showFromNet,   setShowFromNet]   = useState(false);
  const [netSelected,   setNetSelected]   = useState<Set<string>>(new Set());
  const [netNames,      setNetNames]      = useState<Record<string, string>>({});
  const [editDvr,    setEditDvr]    = useState<string | null>(null);
  const [search,     setSearch]     = useState("");
  const [checkingAll, setCheckingAll] = useState(false);

  // Form credencial
  const [credUser, setCredUser] = useState("admin");
  const [credPass, setCredPass] = useState("");
  const [credOk,   setCredOk]   = useState(false);

  // Form nuevo DVR
  const [newName,      setNewName]      = useState("");
  const [newSerial,    setNewSerial]    = useState("");
  const [newIp,        setNewIp]        = useState("");
  const [newLocalIp,   setNewLocalIp]   = useState("");
  const [newLocalPort, setNewLocalPort] = useState("37777");
  const [newPort,      setNewPort]      = useState("80");
  const [newChannels,  setNewChannels]  = useState("8");
  const [newLocation,  setNewLocation]  = useState("");
  const [useOwnCred,   setUseOwnCred]   = useState(false);
  const [newUsername,  setNewUsername]  = useState("admin");
  const [newPassword,  setNewPassword]  = useState("");

  // Import CSV
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number } | null>(null);

  const saveCred  = trpc.dvrs.saveCredential.useMutation({ onSuccess: () => { utils.dvrs.getCredential.invalidate(); setCredOk(true); } });
  const createDvr = trpc.dvrs.create.useMutation({
    onSuccess: () => { utils.dvrs.list.invalidate(); setShowAdd(false); setNewName(""); setNewSerial(""); setNewIp(""); setNewLocalIp(""); setNewLocalPort("37777"); setNewPort("80"); setNewChannels("8"); setNewLocation(""); setUseOwnCred(false); setNewUsername("admin"); setNewPassword(""); },
    onError:   (e) => alert(e.message),
  });
  const deleteDvr = trpc.dvrs.delete.useMutation({ onSuccess: () => utils.dvrs.list.invalidate(), onError: (e) => alert(e.message) });
  const checkOne  = trpc.dvrs.checkStatus.useMutation({ onSuccess: () => utils.dvrs.list.invalidate() });

  // Test local desde el browser (sin pasar por Railway)
  const [localTestResults, setLocalTestResults] = useState<Record<string, "testing" | "online" | "offline">>({});

  async function testLocalConnection(dvrId: string, localIp: string, port: number) {
    setLocalTestResults(prev => ({ ...prev, [dvrId]: "testing" }));
    const ports = [port, 80, 8080, 8000, 443, 9000];
    let found = false;
    for (const p of ports) {
      try {
        // no-cors: si el servidor responde (cualquier respuesta), resuelve; si no, lanza error
        await fetch(`http://${localIp}:${p}/`, { method: "HEAD", mode: "no-cors", signal: AbortSignal.timeout(3000) });
        found = true;
        break;
      } catch {}
    }
    setLocalTestResults(prev => ({ ...prev, [dvrId]: found ? "online" : "offline" }));
  }
  const checkAll  = trpc.dvrs.checkAll.useMutation({
    onSuccess: (r) => { utils.dvrs.list.invalidate(); setCheckingAll(false); alert(`✅ Online: ${r.online} | ❌ Offline: ${r.offline}`); },
  });
  const bulkImport = trpc.dvrs.bulkImport.useMutation({
    onSuccess: (r) => { utils.dvrs.list.invalidate(); setImportResult(r); },
    onError:   (e) => alert(e.message),
  });

  const filtered = (dvrs ?? []).filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.ip.includes(search) || (d.location ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const online  = dvrs?.filter(d => d.status === "ONLINE").length  ?? 0;
  const offline = dvrs?.filter(d => d.status === "OFFLINE").length ?? 0;
  const unknown = dvrs?.filter(d => d.status === "UNKNOWN").length ?? 0;

  // Parsear CSV
  function handleCSV(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const lines = (e.target?.result as string).split("\n").map(l => l.trim()).filter(Boolean);
      const rows: { name: string; ip: string; port: number; channels: number; location?: string }[] = [];
      for (const line of lines) {
        if (line.startsWith("nombre") || line.startsWith("name")) continue; // header
        const [name, ip, port, channels, location] = line.split(",").map(s => s.trim().replace(/^"|"$/g, ""));
        if (!name || !ip) continue;
        rows.push({ name, ip, port: parseInt(port ?? "80") || 80, channels: parseInt(channels ?? "8") || 8, location });
      }
      if (rows.length === 0) { alert("No se encontraron filas válidas en el CSV"); return; }
      bulkImport.mutate(rows);
    };
    reader.readAsText(file);
  }

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">DVRs / NVRs</h1>
          <p className="text-slate-400 text-sm mt-0.5">{dvrs?.length ?? 0} dispositivos registrados</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setShowCred(true)}
            className={`text-sm px-3 py-2 rounded-lg border transition-colors ${cred ? "border-green-800 text-green-400 hover:bg-green-900/20" : "border-yellow-800 text-yellow-400 hover:bg-yellow-900/20"}`}>
            🔑 {cred ? "Credencial configurada" : "Configurar credencial"}
          </button>
          <button onClick={() => { setCheckingAll(true); checkAll.mutate(); }}
            disabled={checkingAll || checkAll.isPending || (dvrs?.length ?? 0) === 0}
            className="text-sm px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50">
            {checkingAll ? "Verificando…" : "⚡ Verificar todos"}
          </button>
          <button onClick={() => { setShowFromNet(true); setNetSelected(new Set()); setNetNames({}); }}
            className="text-sm px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">
            🔍 Importar desde Red
          </button>
          <button onClick={() => setShowImport(true)}
            className="text-sm px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">
            📥 Importar CSV
          </button>
          <button onClick={() => setShowAdd(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Agregar DVR
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: "Total",        value: dvrs?.length ?? 0, color: "text-white" },
          { label: "Online",       value: online,             color: "text-green-400" },
          { label: "Offline",      value: offline,            color: "text-red-400" },
          { label: "Sin verificar",value: unknown,            color: "text-slate-500" },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-slate-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Modal: importar desde scan de Red */}
      {showFromNet && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl space-y-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-white font-semibold text-lg">🔍 Importar desde scan de Red</h2>
                <p className="text-slate-500 text-xs mt-0.5">Selecciona los dispositivos del último scan que quieres registrar como DVR</p>
              </div>
              <button onClick={() => setShowFromNet(false)} className="text-slate-500 hover:text-white text-xl">✕</button>
            </div>

            {loadingNet ? (
              <p className="text-slate-500 text-sm py-6 text-center">Cargando dispositivos…</p>
            ) : !netCandidates?.length ? (
              <div className="text-center py-8 text-slate-600">
                <p className="text-sm">No hay dispositivos en el scan de Red.</p>
                <p className="text-xs mt-1">Ejecuta primero el scanner desde la página <a href="/network" className="text-blue-400">Red</a>.</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 space-y-2 pr-1">
                {netCandidates.map(d => {
                  const sel = netSelected.has(d.ip);
                  return (
                    <div key={d.ip}
                      onClick={() => {
                        if (d.alreadyAdded) return;
                        setNetSelected(prev => {
                          const n = new Set(prev);
                          sel ? n.delete(d.ip) : n.add(d.ip);
                          return n;
                        });
                      }}
                      className={`flex items-center gap-4 p-3 rounded-xl border transition-colors cursor-pointer
                        ${d.alreadyAdded ? "border-slate-800 opacity-40 cursor-not-allowed" :
                          sel ? "border-blue-600 bg-blue-900/20" : "border-slate-800 hover:border-slate-600"}`}
                    >
                      {/* Checkbox */}
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors
                        ${d.alreadyAdded ? "border-slate-600" : sel ? "border-blue-500 bg-blue-500" : "border-slate-600"}`}>
                        {sel && <span className="text-white text-[10px]">✓</span>}
                        {d.alreadyAdded && <span className="text-slate-500 text-[10px]">✓</span>}
                      </div>

                      {/* Info dispositivo */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-white text-sm font-medium">{d.ip}</span>
                          {d.hostname && <span className="text-slate-500 text-xs truncate">{d.hostname}</span>}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                            ${d.deviceType === "dvr_nvr" ? "bg-orange-900/60 text-orange-300 border border-orange-800" :
                              d.deviceType === "ip_camera" ? "bg-purple-900/60 text-purple-300 border border-purple-800" :
                              "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                            {d.deviceType === "dvr_nvr" ? "DVR/NVR" : d.deviceType === "ip_camera" ? "Cámara IP" : d.deviceType}
                          </span>
                          {d.alreadyAdded && <span className="text-xs text-green-500">ya registrado</span>}
                        </div>
                        {d.vendor && <p className="text-slate-500 text-xs mt-0.5">{d.vendor}</p>}
                      </div>

                      {/* Nombre editable si está seleccionado */}
                      {sel && (
                        <input
                          value={netNames[d.ip] ?? ""}
                          onChange={e => { e.stopPropagation(); setNetNames(prev => ({ ...prev, [d.ip]: e.target.value })); }}
                          onClick={e => e.stopPropagation()}
                          placeholder={`Nombre (ej: ${d.hostname ?? d.ip})`}
                          className="bg-slate-800 border border-slate-700 text-white rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-500 w-48 shrink-0"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-slate-500 text-xs">{netSelected.size} seleccionado{netSelected.size !== 1 ? "s" : ""}</span>
              <div className="flex gap-2">
                <button onClick={() => setShowFromNet(false)} className="text-slate-400 hover:text-white text-sm px-4 py-2">Cancelar</button>
                <button
                  disabled={netSelected.size === 0 || bulkImport.isPending}
                  onClick={() => {
                    const rows = Array.from(netSelected).map(ip => {
                      const d = netCandidates?.find(c => c.ip === ip)!;
                      return {
                        name:     netNames[ip]?.trim() || d.hostname || ip,
                        ip,
                        port:     80,
                        channels: 8,
                      };
                    });
                    bulkImport.mutate(rows, {
                      onSuccess: (r) => {
                        utils.dvrs.list.invalidate();
                        setShowFromNet(false);
                        alert(`✅ Importados: ${r.created} | Ya existían: ${r.skipped}`);
                      },
                    });
                  }}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                  {bulkImport.isPending ? "Importando…" : `Importar ${netSelected.size}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: credencial */}
      {showCred && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-white font-semibold text-lg">🔑 Credencial global DVR</h2>
            <p className="text-slate-400 text-sm">Se usa para todos los DVRs. La contraseña se guarda cifrada.</p>
            {credOk && <p className="text-green-400 text-sm bg-green-950 border border-green-800 rounded-lg px-3 py-2">Credencial guardada correctamente.</p>}
            <div className="space-y-3">
              <input value={credUser} onChange={e => setCredUser(e.target.value)} placeholder="Usuario (ej: admin)"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              <input value={credPass} onChange={e => setCredPass(e.target.value)} type="password" placeholder="Contraseña"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowCred(false); setCredOk(false); }} className="text-slate-400 hover:text-white text-sm px-4 py-2">Cerrar</button>
              <button onClick={() => saveCred.mutate({ username: credUser, password: credPass })}
                disabled={saveCred.isPending || !credPass.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">
                {saveCred.isPending ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: agregar DVR */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-white font-semibold text-lg">+ Agregar DVR / NVR</h2>
            <div className="space-y-3">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre (ej: Sede Norte — Bodega)"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              {/* Acceso remoto */}
              <div className="border border-slate-700 rounded-xl p-3 space-y-2">
                <p className="text-xs font-medium text-blue-400">🌐 Acceso remoto (fuera de la red)</p>
                <div>
                  <label className="text-slate-500 text-xs mb-1 block">Número de serie (Serial)</label>
                  <input value={newSerial} onChange={e => setNewSerial(e.target.value)} placeholder="ej: 3F06C3BPAG12345"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 font-mono" />
                </div>
                <p className="text-slate-600 text-xs">Se usa el serial + usuario/contraseña para conectar via P2P Dahua desde internet.</p>
              </div>

              {/* Acceso local */}
              <div className="border border-slate-700 rounded-xl p-3 space-y-2">
                <p className="text-xs font-medium text-green-400">🏠 Acceso local (dentro de la red)</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="text-slate-500 text-xs mb-1 block">IP local</label>
                    <input value={newLocalIp} onChange={e => setNewLocalIp(e.target.value)} placeholder="192.168.1.15"
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-slate-500 text-xs mb-1 block">Puerto</label>
                    <input value={newLocalPort} onChange={e => setNewLocalPort(e.target.value)} type="number"
                      className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <p className="text-slate-600 text-xs">Puerto 37777 por defecto (protocolo Dahua TCP). Solo disponible desde la misma red.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-500 text-xs mb-1 block">Puerto</label>
                  <input value={newPort} onChange={e => setNewPort(e.target.value)} type="number"
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="text-slate-500 text-xs mb-1 block">Canales</label>
                  <select value={newChannels} onChange={e => setNewChannels(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
                    <option value="4">4 canales</option>
                    <option value="8">8 canales</option>
                    <option value="16">16 canales</option>
                    <option value="32">32 canales</option>
                  </select>
                </div>
              </div>
              <input value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Sede / Ubicación (opcional)"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />

              {/* Credenciales */}
              <div className="border border-slate-700 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-xs font-medium">🔑 Credenciales</span>
                  <button type="button" onClick={() => setUseOwnCred(v => !v)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${useOwnCred ? "border-blue-600 text-blue-400 bg-blue-900/20" : "border-slate-700 text-slate-500 hover:border-slate-500"}`}>
                    {useOwnCred ? "✓ Credencial propia" : "Usar credencial global"}
                  </button>
                </div>
                {!useOwnCred ? (
                  <p className="text-slate-600 text-xs">
                    Usará la credencial global configurada en {cred ? `"${cred.username}"` : "—"}. Puedes sobreescribirla activando la credencial propia.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="Usuario"
                      className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                    <input value={newPassword} onChange={e => setNewPassword(e.target.value)} type="password" placeholder="Contraseña"
                      className="bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white text-sm px-4 py-2">Cancelar</button>
              <button
                onClick={() => createDvr.mutate({
                  name:      newName,
                  serial:    newSerial || undefined,
                  ip:        newLocalIp || newSerial || "—",
                  localIp:   newLocalIp || undefined,
                  localPort: parseInt(newLocalPort) || 37777,
                  port:      parseInt(newPort) || 80,
                  channels:  parseInt(newChannels) || 8,
                  location:  newLocation || undefined,
                  username:  useOwnCred && newUsername ? newUsername : undefined,
                  password:  useOwnCred && newPassword ? newPassword : undefined,
                })}
                disabled={createDvr.isPending || !newName.trim() || (!newLocalIp.trim() && !newSerial.trim()) || (useOwnCred && !newPassword.trim())}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">
                {createDvr.isPending ? "Guardando…" : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: importar CSV */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-lg space-y-4">
            <h2 className="text-white font-semibold text-lg">📥 Importar DVRs desde CSV</h2>
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-sm text-slate-400 space-y-1">
              <p className="text-slate-300 font-medium mb-2">Formato del CSV:</p>
              <code className="text-xs text-green-400 block">nombre,ip,puerto,canales,sede</code>
              <code className="text-xs text-slate-500 block">Sede Norte Bodega,200.100.50.10,80,16,Bogotá</code>
              <code className="text-xs text-slate-500 block">Sede Sur Oficina,200.100.50.20,80,8,Medellín</code>
              <p className="text-xs text-slate-600 mt-2">Puerto y canales son opcionales (por defecto 80 y 8)</p>
            </div>
            {importResult && (
              <p className="text-green-400 text-sm bg-green-950 border border-green-800 rounded-lg px-3 py-2">
                ✅ Creados: {importResult.created} | Duplicados omitidos: {importResult.skipped}
              </p>
            )}
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={e => { if (e.target.files?.[0]) handleCSV(e.target.files[0]); }}
              className="hidden" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setShowImport(false); setImportResult(null); }} className="text-slate-400 hover:text-white text-sm px-4 py-2">Cerrar</button>
              <button onClick={() => fileRef.current?.click()}
                disabled={bulkImport.isPending}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">
                {bulkImport.isPending ? "Importando…" : "Seleccionar archivo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel agente C# */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-white font-semibold mb-1">🖥️ Agente Dahua (búsqueda local)</h2>
            <p className="text-slate-400 text-sm">
              Ejecuta el agente en tu PC Windows para buscar grabaciones en DVRs de tu red local.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a
              href="https://pub-e6d29f7bdc1442c9801e662bce630b61.r2.dev/agents/DahuaAgent-win-x64.zip"
              target="_blank" rel="noopener noreferrer"
              className="shrink-0 bg-green-700 hover:bg-green-600 text-white text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
              ⬇ Descargar agente (.zip)
            </a>
            <a href="/api/agent/dahua-config" download="config.json"
              className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2">
              ⬇ config.json
            </a>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3 text-xs">
          <div className="bg-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-slate-300 font-medium">1. Descargar el agente</p>
            <p className="text-slate-500">Descarga el ZIP y extráelo en cualquier carpeta</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-slate-300 font-medium">2. Descargar config.json</p>
            <p className="text-slate-500">Colócalo en la misma carpeta del agente</p>
          </div>
          <div className="bg-slate-800 rounded-xl p-3 space-y-1">
            <p className="text-slate-300 font-medium">3. Ejecutar</p>
            <code className="text-green-400 text-xs block">DahuaAgent.exe</code>
            <p className="text-slate-500">El agente se queda activo esperando trabajos</p>
          </div>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative mb-4">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, IP o sede…"
          className="w-full max-w-sm bg-slate-900 border border-slate-700 text-white placeholder-slate-500 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500" />
      </div>

      {/* Tabla */}
      {isLoading ? (
        <p className="text-slate-500 text-sm">Cargando…</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-600">
          <div className="text-4xl mb-3">📹</div>
          <p className="text-sm">No hay DVRs registrados. Agrega uno o importa un CSV.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-800">
                <th className="text-left text-slate-400 font-medium px-4 py-3">Nombre / Sede</th>
                <th className="text-left text-slate-400 font-medium px-4 py-3">IP</th>
                <th className="text-left text-slate-400 font-medium px-4 py-3">Canales</th>
                <th className="text-left text-slate-400 font-medium px-4 py-3">Estado</th>
                <th className="text-left text-slate-400 font-medium px-4 py-3">Última verificación</th>
                <th className="text-left text-slate-400 font-medium px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.map(dvr => (
                <tr key={dvr.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{dvr.name}</p>
                    {dvr.location && <p className="text-slate-500 text-xs">{dvr.location}</p>}
                  </td>
                  <td className="px-4 py-3 text-xs space-y-1">
                    {dvr.serial && (
                      <div className="font-mono text-blue-400">🌐 S/N: {dvr.serial}</div>
                    )}
                    {dvr.localIp && (
                      <div className="font-mono text-green-400">🏠 {dvr.localIp}:{(dvr as {localPort?: number}).localPort ?? 37777}</div>
                    )}
                    {!dvr.serial && !dvr.localIp && (
                      <div className="font-mono text-slate-500">{dvr.ip}:{dvr.port}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">{dvr.channels} ch</td>
                  <td className="px-4 py-3"><StatusBadge status={dvr.status} /></td>
                  <td className="px-4 py-3 text-slate-600 text-xs">
                    {dvr.lastChecked ? new Date(dvr.lastChecked).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Link href={`/dvrs/${dvr.id}`}
                        className="text-blue-400 hover:text-blue-300 text-xs transition-colors font-medium">
                        🎬 Grabaciones
                      </Link>
                      {/* Test local — solo si tiene localIp */}
                      {dvr.localIp && (() => {
                        const localState = localTestResults[dvr.id];
                        return (
                          <button
                            onClick={() => testLocalConnection(dvr.id, dvr.localIp!, dvr.port)}
                            disabled={localState === "testing"}
                            className={`text-xs px-2 py-1 rounded-lg border transition-colors disabled:opacity-50
                              ${localState === "online"  ? "border-green-700 text-green-400 bg-green-900/20" :
                                localState === "offline" ? "border-red-800 text-red-400 bg-red-900/20" :
                                localState === "testing" ? "border-slate-700 text-slate-400" :
                                "border-slate-700 text-slate-500 hover:text-green-400 hover:border-green-800"}`}
                            title="Prueba si el DVR es accesible desde tu red local (sin pasar por el servidor)"
                          >
                            {localState === "testing" ? "🔄 Probando…" :
                             localState === "online"  ? "🏠 Local ✓" :
                             localState === "offline" ? "🏠 Local ✗" :
                             "🏠 Probar local"}
                          </button>
                        );
                      })()}
                      <button onClick={() => checkOne.mutate({ id: dvr.id })}
                        disabled={checkOne.isPending}
                        title="Verificar desde el servidor (necesita IP pública)"
                        className="text-slate-500 hover:text-yellow-400 text-xs transition-colors">
                        ⚡
                      </button>
                      <button onClick={() => { if (confirm(`¿Eliminar ${dvr.name}?`)) deleteDvr.mutate({ id: dvr.id }); }}
                        className="text-slate-600 hover:text-red-400 text-xs transition-colors opacity-0 group-hover:opacity-100">
                        🗑
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
  );
}
