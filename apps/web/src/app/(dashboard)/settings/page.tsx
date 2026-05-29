"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#f97316", "#ec4899",
  "#64748b", "#84cc16", "#a78bfa", "#34d399",
];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  AGENT: "Agente",
  USER:  "Usuario",
};

const CHANNEL_INFO: Record<string, { label: string; icon: string; description: string }> = {
  EMAIL:            { label: "Email",                 icon: "📧", description: "Recibe y responde tickets por correo electrónico" },
  WHATSAPP_BAILEYS: { label: "WhatsApp (Informal)",   icon: "💬", description: "Número personal de WhatsApp — sin cuenta Business" },
  WHATSAPP_META:    { label: "WhatsApp Business API", icon: "✅", description: "API oficial de Meta — requiere cuenta Business verificada" },
  PHONE:            { label: "Llamada telefónica",    icon: "📞", description: "Tickets creados a partir de llamadas entrantes" },
};

// ─── Formulario para agregar / editar categoría ───────────────────────────────

function CategoryForm({
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial?: { name: string; color: string };
  onSave: (name: string, color: string) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? "#3b82f6");

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="flex gap-3 items-start">
        <div className="flex-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de la categoría"
            className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex flex-wrap gap-2 mt-3">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-white ring-offset-1 ring-offset-slate-800 scale-110" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={() => onSave(name, color)}
            disabled={loading || name.trim().length < 2}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? "..." : "Guardar"}
          </button>
          <button
            onClick={onCancel}
            className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sección categorías ───────────────────────────────────────────────────────

function CategoriesSection() {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const utils = trpc.useUtils();

  const { data: categories, isLoading } = trpc.settings.listCategories.useQuery();

  const create = trpc.settings.createCategory.useMutation({
    onSuccess: () => { utils.settings.listCategories.invalidate(); setAdding(false); },
  });
  const update = trpc.settings.updateCategory.useMutation({
    onSuccess: () => { utils.settings.listCategories.invalidate(); setEditingId(null); },
  });
  const remove = trpc.settings.deleteCategory.useMutation({
    onSuccess: () => utils.settings.listCategories.invalidate(),
    onError: (err) => alert(err.message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-lg">Categorías de tickets</h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            + Nueva categoría
          </button>
        )}
      </div>

      {adding && (
        <div className="mb-3">
          <CategoryForm
            onSave={(name, color) => create.mutate({ name, color })}
            onCancel={() => setAdding(false)}
            loading={create.isPending}
          />
        </div>
      )}

      {isLoading ? (
        <p className="text-slate-500 text-sm">Cargando...</p>
      ) : categories?.length === 0 ? (
        <p className="text-slate-500 text-sm">No hay categorías. Agrega una arriba.</p>
      ) : (
        <div className="space-y-2">
          {categories?.map((cat) =>
            editingId === cat.id ? (
              <CategoryForm
                key={cat.id}
                initial={{ name: cat.name, color: cat.color ?? "#3b82f6" }}
                onSave={(name, color) => update.mutate({ id: cat.id, name, color })}
                onCancel={() => setEditingId(null)}
                loading={update.isPending}
              />
            ) : (
              <div
                key={cat.id}
                className="flex items-center gap-3 bg-slate-900 rounded-xl px-4 py-3 border border-slate-800"
              >
                <span
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color ?? "#64748b" }}
                />
                <span className="text-slate-200 text-sm flex-1">{cat.name}</span>
                <button
                  onClick={() => setEditingId(cat.id)}
                  className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                >
                  Editar
                </button>
                <button
                  onClick={() => remove.mutate({ id: cat.id })}
                  className="text-slate-500 hover:text-red-400 text-xs transition-colors ml-2"
                >
                  Eliminar
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sección canales ──────────────────────────────────────────────────────────

function ChannelsSection() {
  const utils = trpc.useUtils();
  const { data: channels } = trpc.settings.listChannels.useQuery();
  const toggle = trpc.settings.toggleChannel.useMutation({
    onSuccess: () => utils.settings.listChannels.invalidate(),
  });

  const activeTypes = new Set(channels?.filter((c) => c.isActive).map((c) => c.type) ?? []);

  return (
    <div>
      <h2 className="text-white font-semibold text-lg mb-4">Canales de comunicación</h2>
      <div className="space-y-3">
        {(Object.entries(CHANNEL_INFO) as [string, { label: string; icon: string; description: string }][]).map(
          ([type, info]) => {
            const active = activeTypes.has(type as Parameters<typeof activeTypes.has>[0]);
            return (
              <div
                key={type}
                className={`flex items-center gap-4 rounded-xl px-5 py-4 border transition-colors ${active ? "bg-slate-900 border-slate-700" : "bg-slate-900/50 border-slate-800"}`}
              >
                <span className="text-2xl">{info.icon}</span>
                <div className="flex-1">
                  <p className="text-slate-200 font-medium text-sm">{info.label}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{info.description}</p>
                </div>
                <button
                  onClick={() =>
                    toggle.mutate({
                      type: type as "EMAIL" | "WHATSAPP_BAILEYS" | "WHATSAPP_META" | "PHONE",
                      active: !active,
                    })
                  }
                  disabled={toggle.isPending}
                  className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${active ? "bg-green-900 text-green-400 hover:bg-red-900 hover:text-red-400" : "bg-slate-700 text-slate-400 hover:bg-green-900 hover:text-green-400"}`}
                >
                  {active ? "Activo" : "Inactivo"}
                </button>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}

// ─── Formulario para crear / editar grupo ────────────────────────────────────

function GroupForm({
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial?: { name: string; description?: string | null; color?: string | null };
  onSave:   (name: string, description: string, color: string) => void;
  onCancel: () => void;
  loading:  boolean;
}) {
  const [name,  setName]  = useState(initial?.name        ?? "");
  const [desc,  setDesc]  = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color       ?? "#3b82f6");

  return (
    <div className="bg-slate-800 rounded-xl p-4 border border-slate-700">
      <div className="space-y-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del grupo"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Descripción (opcional)"
          className="w-full bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex flex-wrap gap-2">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${color === c ? "ring-2 ring-white ring-offset-1 ring-offset-slate-800 scale-110" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onSave(name, desc, color)}
            disabled={loading || name.trim().length < 2}
            className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? "..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sección equipo ───────────────────────────────────────────────────────────

function TeamSection() {
  const utils = trpc.useUtils();

  const { data: members,     isLoading: loadingMembers } = trpc.teams.members.list.useQuery();
  const { data: groups,      isLoading: loadingGroups  } = trpc.teams.groups.list.useQuery();
  const { data: invitations, isLoading: loadingInvites } = trpc.teams.invite.list.useQuery();

  // Groups
  const [addingGroup,  setAddingGroup]  = useState(false);
  const [editGroupId,  setEditGroupId]  = useState<string | null>(null);

  const createGroup = trpc.teams.groups.create.useMutation({
    onSuccess: () => { utils.teams.groups.list.invalidate(); setAddingGroup(false); },
  });
  const updateGroup = trpc.teams.groups.update.useMutation({
    onSuccess: () => { utils.teams.groups.list.invalidate(); setEditGroupId(null); },
  });
  const deleteGroup = trpc.teams.groups.delete.useMutation({
    onSuccess: () => utils.teams.groups.list.invalidate(),
    onError:   (err) => alert(err.message),
  });

  // Invite modal
  const [showInvite,    setShowInvite]    = useState(false);
  const [inviteName,    setInviteName]    = useState("");
  const [inviteEmail,   setInviteEmail]   = useState("");
  const [inviteRole,    setInviteRole]    = useState<"AGENT" | "ADMIN">("AGENT");
  const [inviteGroupId, setInviteGroupId] = useState("");
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const sendInvite = trpc.teams.invite.send.useMutation({
    onSuccess: () => {
      utils.teams.invite.list.invalidate();
      setInviteSuccess(true);
      setInviteName("");
      setInviteEmail("");
      setInviteRole("AGENT");
      setInviteGroupId("");
    },
    onError: (err) => alert(err.message),
  });

  const cancelInvite = trpc.teams.invite.cancel.useMutation({
    onSuccess: () => utils.teams.invite.list.invalidate(),
  });

  function handleSendInvite() {
    setInviteSuccess(false);
    sendInvite.mutate({
      name:    inviteName,
      email:   inviteEmail,
      role:    inviteRole,
      groupId: inviteGroupId || undefined,
    });
  }

  return (
    <div className="space-y-8">
      {/* ── Miembros ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Miembros del equipo</h2>
          <button
            onClick={() => { setShowInvite(true); setInviteSuccess(false); }}
            className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            + Invitar persona
          </button>
        </div>

        {/* Invite form */}
        {showInvite && (
          <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 mb-4 space-y-3">
            <h3 className="text-slate-200 font-medium text-sm">Enviar invitación</h3>
            {inviteSuccess && (
              <p className="text-green-400 text-sm bg-green-950 border border-green-800 rounded-lg px-3 py-2">
                Invitación enviada correctamente.
              </p>
            )}
            <div className="grid grid-cols-2 gap-3">
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Nombre completo"
                className="bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="correo@empresa.com"
                type="email"
                className="bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as "AGENT" | "ADMIN")}
                className="bg-slate-700 border border-slate-600 rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="AGENT">Agente</option>
                <option value="ADMIN">Administrador</option>
              </select>
              <select
                value={inviteGroupId}
                onChange={(e) => setInviteGroupId(e.target.value)}
                className="bg-slate-700 border border-slate-600 rounded-lg text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Sin grupo</option>
                {groups?.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowInvite(false)}
                className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors"
              >
                Cerrar
              </button>
              <button
                onClick={handleSendInvite}
                disabled={sendInvite.isPending || !inviteName.trim() || !inviteEmail.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-600 disabled:cursor-not-allowed text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                {sendInvite.isPending ? "Enviando..." : "Enviar invitación"}
              </button>
            </div>
          </div>
        )}

        {/* Members table */}
        {loadingMembers ? (
          <p className="text-slate-500 text-sm">Cargando miembros...</p>
        ) : members?.length === 0 ? (
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
                  <th className="text-left text-slate-400 font-medium px-4 py-2.5">Se unió</th>
                </tr>
              </thead>
              <tbody>
                {members?.map((m, i) => (
                  <tr
                    key={m.id}
                    className={`border-t border-slate-800 ${i % 2 === 0 ? "" : "bg-slate-900/30"}`}
                  >
                    <td className="px-4 py-3 text-slate-200 font-medium">{m.name}</td>
                    <td className="px-4 py-3 text-slate-400">{m.email}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        m.role === "ADMIN"
                          ? "bg-purple-900/60 text-purple-300 border border-purple-800"
                          : "bg-blue-900/60 text-blue-300 border border-blue-800"
                      }`}>
                        {ROLE_LABEL[m.role] ?? m.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {m.groups.length === 0 ? (
                          <span className="text-slate-600 text-xs">—</span>
                        ) : (
                          m.groups.map(({ group }) => (
                            <span
                              key={group.id}
                              className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{
                                backgroundColor: `${group.color ?? "#3b82f6"}22`,
                                color:           group.color ?? "#3b82f6",
                                border:          `1px solid ${group.color ?? "#3b82f6"}44`,
                              }}
                            >
                              {group.name}
                            </span>
                          ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(m.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pending invitations */}
        {!loadingInvites && (invitations?.length ?? 0) > 0 && (
          <div className="mt-4">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Invitaciones pendientes</h3>
            <div className="space-y-2">
              {invitations?.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 bg-slate-900/60 rounded-xl px-4 py-2.5 border border-slate-800"
                >
                  <div className="flex-1">
                    <span className="text-slate-200 text-sm font-medium">{inv.name}</span>
                    <span className="text-slate-500 text-xs ml-2">{inv.email}</span>
                    <span className="text-slate-600 text-xs ml-2">
                      · expira {new Date(inv.expiresAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
                    </span>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    inv.role === "ADMIN"
                      ? "bg-purple-900/60 text-purple-300 border border-purple-800"
                      : "bg-blue-900/60 text-blue-300 border border-blue-800"
                  }`}>
                    {ROLE_LABEL[inv.role] ?? inv.role}
                  </span>
                  <button
                    onClick={() => cancelInvite.mutate({ id: inv.id })}
                    disabled={cancelInvite.isPending}
                    className="text-slate-500 hover:text-red-400 text-xs transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Grupos ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Grupos</h2>
          {!addingGroup && (
            <button
              onClick={() => setAddingGroup(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              + Nuevo grupo
            </button>
          )}
        </div>

        {addingGroup && (
          <div className="mb-3">
            <GroupForm
              onSave={(name, description, color) => createGroup.mutate({ name, description, color })}
              onCancel={() => setAddingGroup(false)}
              loading={createGroup.isPending}
            />
          </div>
        )}

        {loadingGroups ? (
          <p className="text-slate-500 text-sm">Cargando grupos...</p>
        ) : groups?.length === 0 ? (
          <p className="text-slate-500 text-sm">No hay grupos. Crea uno arriba.</p>
        ) : (
          <div className="space-y-2">
            {groups?.map((g) =>
              editGroupId === g.id ? (
                <GroupForm
                  key={g.id}
                  initial={{ name: g.name, description: g.description, color: g.color }}
                  onSave={(name, description, color) => updateGroup.mutate({ id: g.id, name, description, color })}
                  onCancel={() => setEditGroupId(null)}
                  loading={updateGroup.isPending}
                />
              ) : (
                <div
                  key={g.id}
                  className="flex items-center gap-3 bg-slate-900 rounded-xl px-4 py-3 border border-slate-800"
                >
                  <span
                    className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: g.color ?? "#64748b" }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-slate-200 text-sm font-medium">{g.name}</span>
                    {g.description && (
                      <span className="text-slate-500 text-xs ml-2">{g.description}</span>
                    )}
                  </div>
                  <span className="text-slate-500 text-xs">
                    {g._count.members} {g._count.members === 1 ? "miembro" : "miembros"}
                  </span>
                  <button
                    onClick={() => setEditGroupId(g.id)}
                    className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => deleteGroup.mutate({ id: g.id })}
                    className="text-slate-500 hover:text-red-400 text-xs transition-colors ml-2"
                  >
                    Eliminar
                  </button>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Configuración</h1>
        <p className="text-slate-400 text-sm">
          Gestiona las categorías, canales y equipo de tu empresa.
        </p>
      </div>

      <div className="space-y-10">
        <CategoriesSection />
        <div className="border-t border-slate-800" />
        <ChannelsSection />
        <div className="border-t border-slate-800" />
        <TeamSection />
      </div>
    </div>
  );
}
