"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";
import Link from "next/link";

export default function LocationsPage() {
  const utils = trpc.useUtils();
  const { data: locations, isLoading } = trpc.locations.list.useQuery();

  const [showAdd, setShowAdd]   = useState(false);
  const [editId,  setEditId]    = useState<string | null>(null);

  const [name,   setName]   = useState("");
  const [city,   setCity]   = useState("");
  const [hasVpn, setHasVpn] = useState(false);

  const createLoc = trpc.locations.create.useMutation({
    onSuccess: () => { utils.locations.list.invalidate(); closeModal(); },
    onError:   (e) => alert(e.message),
  });
  const updateLoc = trpc.locations.update.useMutation({
    onSuccess: () => { utils.locations.list.invalidate(); closeModal(); },
    onError:   (e) => alert(e.message),
  });
  const deleteLoc = trpc.locations.delete.useMutation({
    onSuccess: () => utils.locations.list.invalidate(),
    onError:   (e) => alert(e.message),
  });

  function closeModal() {
    setShowAdd(false);
    setEditId(null);
    setName(""); setCity(""); setHasVpn(false);
  }

  function openEdit(loc: { id: string; name: string; city: string | null; hasVpn: boolean }) {
    setEditId(loc.id);
    setName(loc.name);
    setCity(loc.city ?? "");
    setHasVpn(loc.hasVpn);
    setShowAdd(true);
  }

  function handleSave() {
    if (editId) {
      updateLoc.mutate({ id: editId, name, city: city || null, hasVpn });
    } else {
      createLoc.mutate({ name, city: city || undefined, hasVpn });
    }
  }

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">🏢 Sedes</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {locations?.length ?? 0} sede{(locations?.length ?? 0) !== 1 ? "s" : ""} registrada{(locations?.length ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dvrs" className="text-sm px-3 py-2 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 transition-colors">
            ← DVRs
          </Link>
          <button onClick={() => setShowAdd(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            + Agregar Sede
          </button>
        </div>
      </div>

      {/* Explicación breve */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 mb-6 text-sm text-slate-400">
        Una sede representa una red física (una oficina, bodega o local). Si varias ubicaciones comparten
        VPN, pueden tratarse como una sola sede lógica; si no tienen VPN entre sí, cada una necesita su
        propio agente instalado localmente.
      </div>

      {/* Modal: agregar/editar sede */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md space-y-4">
            <h2 className="text-white font-semibold text-lg">{editId ? "Editar sede" : "+ Agregar sede"}</h2>
            <div className="space-y-3">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre (ej: Bogotá - Bodega Norte)"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              <input value={city} onChange={e => setCity(e.target.value)} placeholder="Ciudad (opcional)"
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input type="checkbox" checked={hasVpn} onChange={e => setHasVpn(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800" />
                Esta sede comparte red vía VPN con otras sedes del mismo cliente
              </label>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={closeModal} className="text-slate-400 hover:text-white text-sm px-4 py-2">Cancelar</button>
              <button onClick={handleSave}
                disabled={!name.trim() || createLoc.isPending || updateLoc.isPending}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg">
                {createLoc.isPending || updateLoc.isPending ? "Guardando…" : editId ? "Guardar cambios" : "Agregar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      {isLoading ? (
        <p className="text-slate-500 text-sm">Cargando…</p>
      ) : !locations?.length ? (
        <div className="text-center py-16 text-slate-600">
          <div className="text-4xl mb-3">🏢</div>
          <p className="text-sm">No hay sedes registradas. Agrega la primera.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/50 border-b border-slate-800">
                <th className="text-left text-slate-400 font-medium px-4 py-3">Sede</th>
                <th className="text-left text-slate-400 font-medium px-4 py-3">VPN</th>
                <th className="text-left text-slate-400 font-medium px-4 py-3">DVRs</th>
                <th className="text-left text-slate-400 font-medium px-4 py-3">Túnel (Live View)</th>
                <th className="text-left text-slate-400 font-medium px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {locations.map(loc => (
                <tr key={loc.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-4 py-3">
                    <p className="text-white font-medium">{loc.name}</p>
                    {loc.city && <p className="text-slate-500 text-xs">{loc.city}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {loc.hasVpn
                      ? <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 border border-blue-800">VPN</span>
                      : <span className="text-xs text-slate-600">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="text-slate-300">{loc.dvrCount} total</span>
                    {loc.dvrCount > 0 && (
                      <span className="text-slate-500"> · <span className="text-green-400">{loc.dvrsOnline} online</span> · <span className="text-red-400">{loc.dvrsOffline} offline</span></span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {loc.tunnel ? (
                      <span className={`inline-flex items-center gap-1 ${loc.tunnel.isActive ? "text-green-400" : "text-slate-500"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${loc.tunnel.isActive ? "bg-green-400 animate-pulse" : "bg-slate-600"}`} />
                        {loc.tunnel.hostname ?? "configurado"}
                      </span>
                    ) : (
                      <span className="text-slate-600">Sin túnel aún</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => openEdit(loc)}
                        className="text-slate-500 hover:text-blue-400 text-xs transition-colors">
                        ✏️ Editar
                      </button>
                      <button
                        onClick={() => {
                          if (loc.dvrCount > 0 && !confirm(`Esta sede tiene ${loc.dvrCount} DVR(s) asignados, que quedarán sin sede. ¿Continuar?`)) return;
                          if (loc.dvrCount === 0 && !confirm(`¿Eliminar la sede "${loc.name}"?`)) return;
                          deleteLoc.mutate({ id: loc.id });
                        }}
                        className="text-slate-600 hover:text-red-400 text-xs transition-colors opacity-0 group-hover:opacity-100">
                        🗑 Eliminar
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
