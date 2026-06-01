"use client";

import React, { useState } from "react";
import { trpc } from "@/trpc/react";

// ─── Paleta de colores ────────────────────────────────────────────────────────
const PRESET_COLORS = [
  "#3b82f6","#8b5cf6","#10b981","#f59e0b",
  "#ef4444","#06b6d4","#f97316","#ec4899",
  "#64748b","#84cc16","#a78bfa","#34d399",
];

const ROLE_LABEL: Record<string, string> = { ADMIN: "Admin", AGENT: "Agente", USER: "Usuario" };

const CHANNEL_INFO: Record<string, { label: string; icon: string; description: string }> = {
  EMAIL:            { label: "Email",                 icon: "📧", description: "Recibe y responde tickets por correo electrónico" },
  WHATSAPP_BAILEYS: { label: "WhatsApp (Informal)",   icon: "💬", description: "Número personal de WhatsApp — sin cuenta Business" },
  WHATSAPP_META:    { label: "WhatsApp Business API", icon: "✅", description: "API oficial de Meta — requiere cuenta Business verificada" },
  PHONE:            { label: "Llamada telefónica",    icon: "📞", description: "Tickets creados a partir de llamadas entrantes" },
  TEAMS:            { label: "Microsoft Teams",       icon: "🟦", description: "Recibe y gestiona tickets desde canales de Teams" },
};

const USER_VIEW_FIELDS = [
  { key: "area",             label: "Área / Departamento",        desc: "¿A qué área pertenece el solicitante?" },
  { key: "location",         label: "Sede / Ubicación",           desc: "¿Desde qué sede reporta?" },
  { key: "requesterContact", label: "Contacto del solicitante",   desc: "Teléfono o correo del usuario" },
  { key: "equipmentName",    label: "Equipo o servicio afectado", desc: "¿Qué dispositivo o sistema falla?" },
  { key: "subcategory",      label: "Subcategoría",               desc: "Detalle adicional de la categoría" },
];

const AGENT_VIEW_FIELDS = [
  { key: "type",             label: "Tipo de ticket",           desc: "Incidencia, solicitud, cambio, etc." },
  { key: "priority",         label: "Prioridad",                desc: "Baja, media, alta, urgente" },
  { key: "impact",           label: "Impacto",                  desc: "Alcance del problema" },
  { key: "area",             label: "Área / Departamento",      desc: "Área del solicitante" },
  { key: "location",         label: "Sede / Ubicación",         desc: "Sede desde donde se reporta" },
  { key: "affectedSystem",   label: "Sistema afectado",         desc: "Aplicación o sistema involucrado" },
  { key: "appVersion",       label: "Versión de aplicación",    desc: "Versión del software afectado" },
  { key: "siteType",         label: "Tipo de sede",             desc: "Oficina o punto de venta" },
  { key: "deviceType",       label: "Componente",               desc: "Pantalla, CPU, software, etc." },
  { key: "deviceDetail",     label: "Detalle del componente",   desc: "Especificación libre" },
  { key: "requesterName",    label: "Nombre del solicitante",   desc: "Quién reportó el problema" },
  { key: "requesterContact", label: "Contacto del solicitante", desc: "Teléfono o correo" },
  { key: "equipmentName",    label: "Equipo afectado",          desc: "Dispositivo o equipo" },
  { key: "techCategory",     label: "Categoría técnica TI",     desc: "Clasificación interna TI" },
  { key: "urgency",          label: "Urgencia",                 desc: "Urgencia percibida" },
  { key: "diagnosis",        label: "Diagnóstico",              desc: "Causa técnica" },
];

type Tab = "perfil" | "categorias" | "equipo" | "vistas" | "canales" | "respuestas";

// ─── Mi perfil ────────────────────────────────────────────────────────────────

function ProfileSection() {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.settings.getProfile.useQuery();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [curPwd,   setCurPwd]   = useState("");
  const [newPwd,   setNewPwd]   = useState("");
  const [newPwd2,  setNewPwd2]  = useState("");
  const [pwdMode,  setPwdMode]  = useState(false);
  const [pwdMsg,   setPwdMsg]   = useState<{ ok: boolean; text: string } | null>(null);
  const [profMsg,  setProfMsg]  = useState<{ ok: boolean; text: string } | null>(null);
  const [sig,      setSig]      = useState("");
  const [sigMode,  setSigMode]  = useState(false);
  const [sigMsg,   setSigMsg]   = useState<{ ok: boolean; text: string } | null>(null);

  function startEdit() {
    setName(profile?.name ?? "");
    setEmail(profile?.email ?? "");
    setProfMsg(null);
    setEditMode(true);
  }

  const updateProfile = trpc.settings.updateProfile.useMutation({
    onSuccess: () => { utils.settings.getProfile.invalidate(); setEditMode(false); setProfMsg({ ok: true, text: "Perfil actualizado correctamente." }); },
    onError: (e) => setProfMsg({ ok: false, text: e.message }),
  });

  const changePassword = trpc.settings.changePassword.useMutation({
    onSuccess: () => { setCurPwd(""); setNewPwd(""); setNewPwd2(""); setPwdMode(false); setPwdMsg({ ok: true, text: "Contraseña cambiada correctamente." }); },
    onError: (e) => setPwdMsg({ ok: false, text: e.message }),
  });

  const updateSignature = trpc.settings.updateSignature.useMutation({
    onSuccess: () => { utils.settings.getProfile.invalidate(); setSigMode(false); setSigMsg({ ok: true, text: "Firma guardada correctamente." }); },
    onError:   (e) => setSigMsg({ ok: false, text: e.message }),
  });

  if (isLoading) return <p className="text-slate-500 text-sm">Cargando...</p>;

  return (
    <div className="space-y-8 max-w-lg">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Información personal</h2>
          {!editMode && <button onClick={startEdit} className="text-blue-400 hover:text-blue-300 text-sm transition-colors">Editar</button>}
        </div>
        {profMsg && (
          <p className={`text-sm mb-3 px-3 py-2 rounded-lg border ${profMsg.ok ? "text-green-400 bg-green-950 border-green-800" : "text-red-400 bg-red-950 border-red-800"}`}>
            {profMsg.text}
          </p>
        )}
        {editMode ? (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Nombre completo</label>
              <input value={name} onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-slate-400 text-xs mb-1 block">Correo electrónico</label>
              <input value={email} type="email" onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditMode(false)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">Cancelar</button>
              <button onClick={() => updateProfile.mutate({ name: name || undefined, email: email || undefined })} disabled={updateProfile.isPending}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                {updateProfile.isPending ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {[
              { label: "Nombre",  value: profile?.name },
              { label: "Correo",  value: profile?.email },
              { label: "Rol",     value: ROLE_LABEL[profile?.role ?? ""] ?? profile?.role },
              { label: "Empresa", value: profile?.tenant?.name },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center gap-4 px-4 py-3 bg-slate-900 rounded-xl border border-slate-800">
                <span className="text-slate-500 text-sm w-20 flex-shrink-0">{label}</span>
                <span className="text-slate-200 text-sm">{value ?? "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Contraseña</h2>
          {!pwdMode && <button onClick={() => { setPwdMode(true); setPwdMsg(null); }} className="text-blue-400 hover:text-blue-300 text-sm transition-colors">Cambiar</button>}
        </div>
        {pwdMsg && (
          <p className={`text-sm mb-3 px-3 py-2 rounded-lg border ${pwdMsg.ok ? "text-green-400 bg-green-950 border-green-800" : "text-red-400 bg-red-950 border-red-800"}`}>
            {pwdMsg.text}
          </p>
        )}
        {pwdMode ? (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
            {[
              { label: "Contraseña actual",    value: curPwd, set: setCurPwd },
              { label: "Nueva contraseña",     value: newPwd, set: setNewPwd },
              { label: "Confirmar contraseña", value: newPwd2, set: setNewPwd2 },
            ].map(({ label, value, set }) => (
              <div key={label}>
                <label className="text-slate-400 text-xs mb-1 block">{label}</label>
                <input type="password" value={value} onChange={(e) => set(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setPwdMode(false); setCurPwd(""); setNewPwd(""); setNewPwd2(""); }}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">Cancelar</button>
              <button
                onClick={() => {
                  if (newPwd !== newPwd2) { setPwdMsg({ ok: false, text: "Las contraseñas no coinciden" }); return; }
                  changePassword.mutate({ currentPassword: curPwd, newPassword: newPwd });
                }}
                disabled={changePassword.isPending || !curPwd || !newPwd || !newPwd2}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                {changePassword.isPending ? "Cambiando..." : "Cambiar contraseña"}
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-3 bg-slate-900 rounded-xl border border-slate-800">
            <span className="text-slate-500 text-sm">••••••••••••</span>
          </div>
        )}
      </div>

      {/* ── Firma de email ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white font-semibold text-lg">Firma de email</h2>
            <p className="text-slate-500 text-xs mt-0.5">Se añade automáticamente al pie de cada respuesta que envíes.</p>
          </div>
          {!sigMode && (
            <button onClick={() => { setSig(profile?.emailSignature ?? ""); setSigMode(true); setSigMsg(null); }}
              className="text-blue-400 hover:text-blue-300 text-sm transition-colors">
              {profile?.emailSignature ? "Editar" : "Añadir"}
            </button>
          )}
        </div>
        {sigMsg && (
          <p className={`text-sm mb-3 px-3 py-2 rounded-lg border ${sigMsg.ok ? "text-green-400 bg-green-950 border-green-800" : "text-red-400 bg-red-950 border-red-800"}`}>
            {sigMsg.text}
          </p>
        )}
        {sigMode ? (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
            <textarea value={sig} onChange={(e) => setSig(e.target.value)} rows={4}
              placeholder={"Ej:\nJuan Pablo Morales\nSoporte TI — Altra Investments\njmorales@altrainv.com | +57 300 000 0000"}
              className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            <p className="text-slate-600 text-xs">{sig.length} / 500 caracteres</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSigMode(false)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">Cancelar</button>
              <button onClick={() => updateSignature.mutate({ signature: sig })}
                disabled={updateSignature.isPending || sig.length > 500}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                {updateSignature.isPending ? "Guardando..." : "Guardar firma"}
              </button>
            </div>
          </div>
        ) : profile?.emailSignature ? (
          <div className="px-4 py-3 bg-slate-900 rounded-xl border border-slate-800">
            <p className="text-slate-400 text-sm whitespace-pre-wrap leading-relaxed">{profile.emailSignature}</p>
          </div>
        ) : (
          <div className="px-4 py-3 bg-slate-900 rounded-xl border border-dashed border-slate-700 text-center">
            <p className="text-slate-600 text-sm">Sin firma configurada</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Formulario categoría ─────────────────────────────────────────────────────

function CategoryForm({ initial, onSave, onCancel, loading, isSubcat = false }: {
  initial?: { name: string; color: string };
  onSave: (name: string, color: string) => void;
  onCancel: () => void;
  loading: boolean;
  isSubcat?: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#3b82f6");
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex gap-3 items-start">
        <div className="flex-1">
          <input value={name} onChange={(e) => setName(e.target.value)}
            placeholder={isSubcat ? "Nombre de la subcategoría" : "Nombre de la categoría"}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {!isSubcat && (
            <div className="flex flex-wrap gap-2 mt-3">
              {PRESET_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-white ring-offset-1 ring-offset-slate-800 scale-110" : ""}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button onClick={() => onSave(name, color)} disabled={loading || name.trim().length < 2}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg transition-colors">
            {loading ? "..." : "Guardar"}
          </button>
          <button onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Categorías ───────────────────────────────────────────────────────────────

function CategoriesSection() {
  const utils = trpc.useUtils();
  const { data: categories, isLoading } = trpc.settings.listCategories.useQuery();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addingSubId, setAddingSubId] = useState<string | null>(null);

  const inv = () => utils.settings.listCategories.invalidate();
  const create    = trpc.settings.createCategory.useMutation({ onSuccess: () => { inv(); setAdding(false); } });
  const update    = trpc.settings.updateCategory.useMutation({ onSuccess: () => { inv(); setEditingId(null); } });
  const remove    = trpc.settings.deleteCategory.useMutation({ onSuccess: inv, onError: (e) => alert(e.message) });
  const createSub = trpc.settings.createCategory.useMutation({ onSuccess: () => { inv(); setAddingSubId(null); } });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-lg">Categorías de tickets</h2>
        {!adding && (
          <button onClick={() => setAdding(true)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">+ Nueva categoría</button>
        )}
      </div>
      {adding && (
        <div className="mb-3">
          <CategoryForm onSave={(name, color) => create.mutate({ name, color })} onCancel={() => setAdding(false)} loading={create.isPending} />
        </div>
      )}
      {isLoading ? (
        <p className="text-slate-500 text-sm">Cargando...</p>
      ) : categories?.length === 0 ? (
        <p className="text-slate-500 text-sm">No hay categorías. Agrega una arriba.</p>
      ) : (
        <div className="space-y-2">
          {categories?.map((cat) => (
            <div key={cat.id}>
              {editingId === cat.id ? (
                <CategoryForm
                  initial={{ name: cat.name, color: cat.color ?? "#3b82f6" }}
                  onSave={(name, color) => update.mutate({ id: cat.id, name, color })}
                  onCancel={() => setEditingId(null)}
                  loading={update.isPending}
                />
              ) : (
                <div className="bg-slate-900 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color ?? "#64748b" }} />
                    <span className="text-slate-200 text-sm flex-1 font-medium">{cat.name}</span>
                    <span className="text-slate-600 text-xs">{cat._count.tickets} tickets</span>
                    <button onClick={() => setExpandedId(expandedId === cat.id ? null : cat.id)}
                      className="text-slate-500 hover:text-slate-300 text-xs transition-colors ml-2">
                      {cat.children.length > 0 ? `${cat.children.length} sub` : "sub"} {expandedId === cat.id ? "▲" : "▼"}
                    </button>
                    <button onClick={() => setEditingId(cat.id)} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">Editar</button>
                    <button onClick={() => remove.mutate({ id: cat.id })} className="text-slate-500 hover:text-red-400 text-xs transition-colors ml-2">Eliminar</button>
                  </div>
                  {expandedId === cat.id && (
                    <div className="border-t border-slate-800 px-4 pb-3 pt-2 space-y-1">
                      {cat.children.map((sub) => (
                        <div key={sub.id} className="flex items-center gap-2 py-1.5 pl-3 border-l-2 border-slate-700">
                          <span className="text-slate-400 text-sm flex-1">{sub.name}</span>
                          <button onClick={() => remove.mutate({ id: sub.id })} className="text-slate-600 hover:text-red-400 text-xs transition-colors">✕</button>
                        </div>
                      ))}
                      {addingSubId === cat.id ? (
                        <CategoryForm isSubcat
                          onSave={(name, color) => createSub.mutate({ name, color, parentId: cat.id })}
                          onCancel={() => setAddingSubId(null)}
                          loading={createSub.isPending}
                        />
                      ) : (
                        <button onClick={() => setAddingSubId(cat.id)} className="text-blue-400 hover:text-blue-300 text-xs transition-colors mt-1 pl-3">
                          + Agregar subcategoría
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Grupo form ───────────────────────────────────────────────────────────────

function GroupForm({ initial, onSave, onCancel, loading }: {
  initial?: { name: string; description?: string | null; color?: string | null };
  onSave: (name: string, description: string, color: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [desc, setDesc] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? "#3b82f6");
  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 space-y-3">
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del grupo"
        className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción (opcional)"
        className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button key={c} onClick={() => setColor(c)}
            className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-white ring-offset-1 ring-offset-slate-800 scale-110" : ""}`}
            style={{ backgroundColor: c }} />
        ))}
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">Cancelar</button>
        <button onClick={() => onSave(name, desc, color)} disabled={loading || name.trim().length < 2}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
          {loading ? "..." : "Guardar"}
        </button>
      </div>
    </div>
  );
}

// ─── Equipo ───────────────────────────────────────────────────────────────────

function TeamSection() {
  const utils = trpc.useUtils();
  const { data: members, isLoading: loadingMembers } = trpc.teams.members.list.useQuery();
  const { data: groups, isLoading: loadingGroups } = trpc.teams.groups.list.useQuery();
  const { data: invitations, isLoading: loadingInvites } = trpc.teams.invite.list.useQuery();

  const [addingGroup, setAddingGroup] = useState(false);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [expandMemberId, setExpandMemberId] = useState<string | null>(null);

  const createGroup  = trpc.teams.groups.create.useMutation({ onSuccess: () => { utils.teams.groups.list.invalidate(); setAddingGroup(false); } });
  const updateGroup  = trpc.teams.groups.update.useMutation({ onSuccess: () => { utils.teams.groups.list.invalidate(); setEditGroupId(null); } });
  const deleteGroup  = trpc.teams.groups.delete.useMutation({ onSuccess: () => utils.teams.groups.list.invalidate(), onError: (e) => alert(e.message) });
  const addMember    = trpc.teams.groups.addMember.useMutation({ onSuccess: () => utils.teams.members.list.invalidate() });
  const removeMember = trpc.teams.groups.removeMember.useMutation({ onSuccess: () => utils.teams.members.list.invalidate() });
  const updateRole   = trpc.teams.members.updateRole.useMutation({ onSuccess: () => utils.teams.members.list.invalidate(), onError: (e) => alert(e.message) });

  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"AGENT" | "ADMIN">("AGENT");
  const [inviteGroupId, setInviteGroupId] = useState("");
  const [inviteOk, setInviteOk] = useState(false);

  const sendInvite = trpc.teams.invite.send.useMutation({
    onSuccess: () => { utils.teams.invite.list.invalidate(); setInviteOk(true); setInviteName(""); setInviteEmail(""); setInviteRole("AGENT"); setInviteGroupId(""); },
    onError: (e) => alert(e.message),
  });
  const cancelInvite = trpc.teams.invite.cancel.useMutation({ onSuccess: () => utils.teams.invite.list.invalidate() });

  return (
    <div className="space-y-8">
      {/* Miembros */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Miembros del equipo</h2>
          <button onClick={() => { setShowInvite(true); setInviteOk(false); }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">+ Invitar persona</button>
        </div>

        {showInvite && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-4 space-y-3">
            <h3 className="text-slate-200 font-medium text-sm">Enviar invitación</h3>
            {inviteOk && <p className="text-green-400 text-sm bg-green-950 border border-green-800 rounded-lg px-3 py-2">Invitación enviada correctamente.</p>}
            <div className="grid grid-cols-2 gap-3">
              <input value={inviteName} onChange={(e) => setInviteName(e.target.value)} placeholder="Nombre completo"
                className="bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <input value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="correo@empresa.com" type="email"
                className="bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as "AGENT" | "ADMIN")}
                className="bg-slate-700 border border-slate-600 rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="AGENT">Agente</option>
                <option value="ADMIN">Administrador</option>
              </select>
              <select value={inviteGroupId} onChange={(e) => setInviteGroupId(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Sin grupo</option>
                {groups?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowInvite(false)} className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors">Cerrar</button>
              <button onClick={() => sendInvite.mutate({ name: inviteName, email: inviteEmail, role: inviteRole, groupId: inviteGroupId || undefined })}
                disabled={sendInvite.isPending || !inviteName.trim() || !inviteEmail.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                {sendInvite.isPending ? "Enviando..." : "Enviar invitación"}
              </button>
            </div>
          </div>
        )}

        {loadingMembers ? (
          <p className="text-slate-500 text-sm">Cargando miembros...</p>
        ) : (members?.length ?? 0) === 0 ? (
          <p className="text-slate-500 text-sm">No hay miembros aún.</p>
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/50">
                  <th className="text-left text-slate-400 font-medium px-4 py-2.5">Nombre</th>
                  <th className="text-left text-slate-400 font-medium px-4 py-2.5">Correo</th>
                  <th className="text-left text-slate-400 font-medium px-4 py-2.5">Rol</th>
                  <th className="text-left text-slate-400 font-medium px-4 py-2.5">Grupos</th>
                  <th className="text-left text-slate-400 font-medium px-4 py-2.5">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members?.map((m, i) => (
                  <React.Fragment key={m.id}>
                    <tr className={`border-t border-slate-800 ${i % 2 === 0 ? "" : "bg-slate-900/30"}`}>
                      <td className="px-4 py-3 text-slate-200 font-medium">{m.name}</td>
                      <td className="px-4 py-3 text-slate-400">{m.email}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${m.role === "ADMIN" ? "bg-purple-900/60 text-purple-300 border border-purple-800" : "bg-blue-900/60 text-blue-300 border border-blue-800"}`}>
                          {ROLE_LABEL[m.role] ?? m.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {m.groups.length === 0 ? (
                            <span className="text-slate-600 text-xs">—</span>
                          ) : m.groups.map(({ group }) => (
                            <span key={group.id} className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ backgroundColor: `${group.color ?? "#3b82f6"}22`, color: group.color ?? "#3b82f6", border: `1px solid ${group.color ?? "#3b82f6"}44` }}>
                              {group.name}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button onClick={() => setExpandMemberId(expandMemberId === m.id ? null : m.id)}
                          className="text-blue-400 hover:text-blue-300 text-xs transition-colors">
                          Asignar grupo {expandMemberId === m.id ? "▲" : "▼"}
                        </button>
                      </td>
                    </tr>
                    {expandMemberId === m.id && (
                      <tr className="border-t border-slate-800 bg-slate-900/50">
                        <td colSpan={5} className="px-6 py-3 space-y-3">
                          {/* Cambiar rol */}
                          <div>
                            <p className="text-slate-500 text-xs mb-2">Rol del usuario:</p>
                            <div className="flex gap-2">
                              {(["AGENT", "ADMIN"] as const).map((r) => (
                                <button key={r}
                                  onClick={() => updateRole.mutate({ userId: m.id, role: r })}
                                  disabled={m.role === r || updateRole.isPending}
                                  className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors ${m.role === r
                                    ? r === "ADMIN" ? "bg-purple-900/60 text-purple-300 border-purple-800 cursor-default" : "bg-blue-900/60 text-blue-300 border-blue-800 cursor-default"
                                    : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500"}`}>
                                  {r === "ADMIN" ? "👑 Administrador" : "🎧 Agente"}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Asignar grupos */}
                          <p className="text-slate-500 text-xs mb-2">Grupos de trabajo:</p>
                          <div className="flex flex-wrap gap-2">
                            {loadingGroups ? (
                              <span className="text-slate-500 text-xs">Cargando grupos...</span>
                            ) : groups?.map((g) => {
                              const isMember = m.groups.some(({ group }) => group.id === g.id);
                              return (
                                <button key={g.id}
                                  onClick={() => isMember
                                    ? removeMember.mutate({ groupId: g.id, userId: m.id })
                                    : addMember.mutate({ groupId: g.id, userId: m.id })}
                                  className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${isMember ? "text-white" : "bg-slate-800 text-slate-400 border-slate-700 hover:border-slate-500"}`}
                                  style={isMember ? { backgroundColor: `${g.color ?? "#3b82f6"}33`, color: g.color ?? "#3b82f6", borderColor: `${g.color ?? "#3b82f6"}66` } : {}}>
                                  {isMember ? "✓ " : "+ "}{g.name}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loadingInvites && (invitations?.length ?? 0) > 0 && (
          <div className="mt-4">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Invitaciones pendientes</h3>
            <div className="space-y-2">
              {invitations?.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 bg-slate-900/60 rounded-xl px-4 py-2.5 border border-slate-800">
                  <div className="flex-1">
                    <span className="text-slate-200 text-sm font-medium">{inv.name}</span>
                    <span className="text-slate-500 text-xs ml-2">{inv.email}</span>
                    <span className="text-slate-600 text-xs ml-2">· expira {new Date(inv.expiresAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}</span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${inv.role === "ADMIN" ? "bg-purple-900/60 text-purple-300 border border-purple-800" : "bg-blue-900/60 text-blue-300 border border-blue-800"}`}>
                    {ROLE_LABEL[inv.role] ?? inv.role}
                  </span>
                  <button onClick={() => cancelInvite.mutate({ id: inv.id })} disabled={cancelInvite.isPending}
                    className="text-slate-500 hover:text-red-400 text-xs transition-colors">Cancelar</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Grupos */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Grupos de trabajo</h2>
          {!addingGroup && (
            <button onClick={() => setAddingGroup(true)} className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">+ Nuevo grupo</button>
          )}
        </div>
        {addingGroup && (
          <div className="mb-3">
            <GroupForm onSave={(name, description, color) => createGroup.mutate({ name, description, color })} onCancel={() => setAddingGroup(false)} loading={createGroup.isPending} />
          </div>
        )}
        {loadingGroups ? (
          <p className="text-slate-500 text-sm">Cargando grupos...</p>
        ) : (groups?.length ?? 0) === 0 ? (
          <p className="text-slate-500 text-sm">No hay grupos. Crea uno arriba.</p>
        ) : (
          <div className="space-y-2">
            {groups?.map((g) => editGroupId === g.id ? (
              <GroupForm key={g.id}
                initial={{ name: g.name, description: g.description, color: g.color }}
                onSave={(name, description, color) => updateGroup.mutate({ id: g.id, name, description, color })}
                onCancel={() => setEditGroupId(null)}
                loading={updateGroup.isPending}
              />
            ) : (
              <div key={g.id} className="flex items-center gap-3 bg-slate-900 rounded-xl px-4 py-3 border border-slate-800">
                <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color ?? "#64748b" }} />
                <div className="flex-1 min-w-0">
                  <span className="text-slate-200 text-sm font-medium">{g.name}</span>
                  {g.description && <span className="text-slate-500 text-xs ml-2">{g.description}</span>}
                </div>
                <span className="text-slate-500 text-xs">{g._count.members} {g._count.members === 1 ? "miembro" : "miembros"}</span>
                <button onClick={() => setEditGroupId(g.id)} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">Editar</button>
                <button onClick={() => deleteGroup.mutate({ id: g.id })} className="text-slate-500 hover:text-red-400 text-xs transition-colors ml-2">Eliminar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vistas de ticket ─────────────────────────────────────────────────────────

function TicketViewsSection() {
  const utils = trpc.useUtils();
  const { data: config, isLoading } = trpc.settings.getFormConfig.useQuery();
  const [activeView, setActiveView] = useState<"user" | "agent">("user");
  const [localConfig, setLocalConfig] = useState<Record<string, "hidden" | "optional" | "required"> | null>(null);
  const [saved, setSaved] = useState(false);

  const currentConfig = localConfig ?? (activeView === "user" ? config?.userView : config?.agentView) ?? {};
  const fields = activeView === "user" ? USER_VIEW_FIELDS : AGENT_VIEW_FIELDS;

  const updateMut = trpc.settings.updateFormConfig.useMutation({
    onSuccess: () => { utils.settings.getFormConfig.invalidate(); setLocalConfig(null); setSaved(true); setTimeout(() => setSaved(false), 3000); },
    onError: (e) => alert(e.message),
  });

  function toggle(key: string, value: "hidden" | "optional" | "required") {
    setLocalConfig({ ...(currentConfig as Record<string, "hidden" | "optional" | "required">), [key]: value });
    setSaved(false);
  }

  function switchView(v: "user" | "agent") {
    setActiveView(v);
    setLocalConfig(null);
    setSaved(false);
  }

  if (isLoading) return <p className="text-slate-500 text-sm">Cargando...</p>;

  return (
    <div>
      <h2 className="text-white font-semibold text-lg mb-1">Vistas de ticket</h2>
      <p className="text-slate-500 text-sm mb-6">Configura qué campos aparecen en cada formulario de creación de tickets.</p>
      <div className="flex gap-2 mb-6">
        {(["user", "agent"] as const).map((v) => (
          <button key={v} onClick={() => switchView(v)}
            className={`flex-1 text-left px-4 py-3 rounded-xl border transition-colors ${activeView === v ? "bg-blue-900/40 border-blue-700" : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-600"}`}>
            <div className={`font-medium text-sm ${activeView === v ? "text-blue-300" : ""}`}>{v === "user" ? "👤 Vista usuario" : "🔧 Vista TI"}</div>
            <div className="text-xs opacity-70 mt-0.5">{v === "user" ? "Formulario simple para empleados" : "Formulario completo para técnicos"}</div>
          </button>
        ))}
      </div>
      <div className="space-y-2 mb-4">
        {fields.map(({ key, label, desc }) => {
          const current = (currentConfig[key] as string) ?? "hidden";
          const visible = current !== "hidden";
          return (
            <div key={key} className={`flex items-center gap-4 px-4 py-3 rounded-xl border transition-colors ${visible ? "bg-slate-900 border-slate-700" : "bg-slate-900/40 border-slate-800"}`}>
              <div className="flex-1">
                <p className="text-slate-200 text-sm font-medium">{label}</p>
                <p className="text-slate-500 text-xs mt-0.5">{desc}</p>
              </div>
              <div className="flex gap-1">
                {(["hidden", "optional", "required"] as const).map((state) => (
                  <button key={state} onClick={() => toggle(key, state)}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${current === state
                      ? state === "required" ? "bg-red-900/60 text-red-300 border border-red-800"
                      : state === "optional" ? "bg-blue-900/60 text-blue-300 border border-blue-800"
                      : "bg-slate-700 text-slate-400 border border-slate-600"
                      : "bg-slate-900 text-slate-600 border border-slate-800 hover:text-slate-400"}`}>
                    {state === "hidden" ? "Oculto" : state === "optional" ? "Opcional" : "Requerido"}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button onClick={() => updateMut.mutate({ view: activeView, config: currentConfig })}
          disabled={updateMut.isPending || !localConfig}
          className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm px-5 py-2 rounded-lg transition-colors">
          {updateMut.isPending ? "Guardando..." : "Guardar cambios"}
        </button>
        {saved && <span className="text-green-400 text-sm">✓ Guardado</span>}
        {localConfig && !saved && <span className="text-amber-400 text-xs">Tienes cambios sin guardar</span>}
      </div>
    </div>
  );
}

// ─── Canales ──────────────────────────────────────────────────────────────────

function ChannelsSection() {
  const utils = trpc.useUtils();
  const { data: channels } = trpc.settings.listChannels.useQuery();
  const toggle = trpc.settings.toggleChannel.useMutation({ onSuccess: () => utils.settings.listChannels.invalidate() });
  const activeTypes = new Set(channels?.filter((c) => c.isActive).map((c) => c.type) ?? []);

  return (
    <div>
      <h2 className="text-white font-semibold text-lg mb-4">Canales de comunicación</h2>
      <div className="space-y-3">
        {(Object.entries(CHANNEL_INFO) as [string, { label: string; icon: string; description: string }][]).map(([type, info]) => {
          const active = activeTypes.has(type as Parameters<typeof activeTypes.has>[0]);
          return (
            <div key={type} className={`flex items-center gap-4 rounded-xl px-5 py-4 border transition-colors ${active ? "bg-slate-900 border-slate-700" : "bg-slate-900/50 border-slate-800"}`}>
              <span className="text-2xl">{info.icon}</span>
              <div className="flex-1">
                <p className="text-slate-200 font-medium text-sm">{info.label}</p>
                <p className="text-slate-500 text-xs mt-0.5">{info.description}</p>
              </div>
              <button onClick={() => toggle.mutate({ type: type as "EMAIL" | "WHATSAPP_BAILEYS" | "WHATSAPP_META" | "PHONE" | "TEAMS", active: !active })}
                disabled={toggle.isPending}
                className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${active ? "bg-green-900 text-green-400 hover:bg-red-900 hover:text-red-400" : "bg-slate-700 text-slate-400 hover:bg-green-900 hover:text-green-400"}`}>
                {active ? "Activo" : "Inactivo"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { data: profile } = trpc.settings.getProfile.useQuery();
  const isAdmin = profile?.role === "ADMIN";
  const [tab, setTab] = useState<Tab>("perfil");

  const TABS: { key: Tab; label: string; icon: string; adminOnly?: boolean }[] = [
    { key: "perfil",     label: "Mi perfil",       icon: "👤" },
    { key: "categorias", label: "Categorías",       icon: "🏷️",  adminOnly: true },
    { key: "equipo",     label: "Equipo",           icon: "👥",  adminOnly: true },
    { key: "vistas",     label: "Vistas de ticket", icon: "🎛️",  adminOnly: true },
    { key: "canales",    label: "Canales",            icon: "📡",  adminOnly: true },
    { key: "respuestas", label: "Respuestas rápidas", icon: "💬",  adminOnly: true },
  ];

  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Configuración</h1>
        <p className="text-slate-400 text-sm">Gestiona tu perfil y la configuración de tu organización.</p>
      </div>

      <div className="flex gap-1 mb-8 bg-slate-900 p-1 rounded-xl border border-slate-800 overflow-x-auto">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${tab === t.key ? "bg-slate-700 text-white" : "text-slate-500 hover:text-slate-300"}`}>
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "perfil"     && <ProfileSection />}
      {tab === "categorias" && <CategoriesSection />}
      {tab === "equipo"     && <TeamSection />}
      {tab === "vistas"     && <TicketViewsSection />}
      {tab === "canales"    && <ChannelsSection />}
      {tab === "respuestas" && <CannedResponsesSection />}
    </div>
  );
}

// ─── Respuestas predefinidas ──────────────────────────────────────────────────

function CannedResponsesSection() {
  const utils = trpc.useUtils();
  const { data: items, isLoading } = trpc.cannedResponses.list.useQuery();

  const [showForm, setShowForm]   = useState(false);
  const [editId,   setEditId]     = useState<string | null>(null);
  const [title,    setTitle]      = useState("");
  const [body,     setBody]       = useState("");
  const [err,      setErr]        = useState<string | null>(null);

  const inputCls  = "w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  const invalidate = () => utils.cannedResponses.list.invalidate();

  const create = trpc.cannedResponses.create.useMutation({
    onSuccess: () => { invalidate(); resetForm(); },
    onError:   (e) => setErr(e.message),
  });

  const update = trpc.cannedResponses.update.useMutation({
    onSuccess: () => { invalidate(); resetForm(); },
    onError:   (e) => setErr(e.message),
  });

  const remove = trpc.cannedResponses.delete.useMutation({
    onSuccess: invalidate,
  });

  function resetForm() {
    setShowForm(false);
    setEditId(null);
    setTitle("");
    setBody("");
    setErr(null);
  }

  function startEdit(item: { id: string; title: string; body: string; createdAt: Date; updatedAt: Date; tenantId: string }) {
    setEditId(item.id);
    setTitle(item.title);
    setBody(item.body);
    setShowForm(true);
    setErr(null);
  }

  function handleSave() {
    if (!title.trim() || !body.trim()) { setErr("Título y texto son obligatorios"); return; }
    if (editId) {
      update.mutate({ id: editId, title: title.trim(), body: body.trim() });
    } else {
      create.mutate({ title: title.trim(), body: body.trim() });
    }
  }

  if (isLoading) return <p className="text-slate-500 text-sm">Cargando...</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Respuestas rápidas</h2>
          <p className="text-slate-500 text-xs mt-0.5">Textos predefinidos que los agentes pueden insertar al responder tickets.</p>
        </div>
        {!showForm && (
          <button onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors">
            + Nueva respuesta
          </button>
        )}
      </div>

      {/* Formulario crear/editar */}
      {showForm && (
        <div className="bg-slate-900 border border-blue-800/50 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-200">{editId ? "Editar respuesta" : "Nueva respuesta"}</h3>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Título (nombre corto para identificarla)</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Solicitar más información, Ticket resuelto, Pendiente de proveedor..."
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Texto de la respuesta</label>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
              placeholder="Escribe el texto completo que se insertará al usar esta respuesta..."
              className={inputCls + " resize-none"} />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {["{nombre}","{numero}","{titulo}","{agente}","{empresa}"].map((v) => (
                <button key={v} type="button"
                  onClick={() => setBody((p) => p + v)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded transition-colors font-mono">
                  {v}
                </button>
              ))}
              <span className="text-slate-600 text-xs self-center ml-1">← variables disponibles</span>
            </div>
          </div>
          {err && <p className="text-red-400 text-xs">{err}</p>}
          <div className="flex gap-2">
            <button onClick={handleSave}
              disabled={create.isPending || update.isPending}
              className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium px-5 py-2 rounded-xl transition-colors">
              {create.isPending || update.isPending ? "Guardando..." : editId ? "Guardar cambios" : "Crear respuesta"}
            </button>
            <button onClick={resetForm}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium px-4 py-2 rounded-xl transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Lista */}
      {!items?.length ? (
        <div className="text-center py-12 text-slate-600 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-2xl mb-2">💬</p>
          <p className="text-sm">No hay respuestas rápidas todavía.</p>
          <p className="text-xs mt-1">Crea respuestas para que el equipo las use al atender tickets.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-start gap-4 group">
              <div className="flex-1 min-w-0">
                <p className="text-slate-200 text-sm font-semibold">{item.title}</p>
                <p className="text-slate-500 text-xs mt-1 line-clamp-2 leading-relaxed">{item.body}</p>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button onClick={() => startEdit(item)}
                  className="text-xs text-slate-500 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors">
                  Editar
                </button>
                <button onClick={() => remove.mutate({ id: item.id })}
                  disabled={remove.isPending}
                  className="text-xs text-red-500 hover:text-red-400 bg-slate-800 hover:bg-red-950 px-3 py-1.5 rounded-lg transition-colors">
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
