"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#06b6d4", "#f97316", "#ec4899",
  "#64748b", "#84cc16", "#a78bfa", "#34d399",
];

const CHANNEL_INFO: Record<string, { label: string; icon: string; description: string }> = {
  EMAIL: { label: "Email", icon: "📧", description: "Recibe y responde tickets por correo electrónico" },
  WHATSAPP_BAILEYS: { label: "WhatsApp (Informal)", icon: "💬", description: "Número personal de WhatsApp — sin cuenta Business" },
  WHATSAPP_META: { label: "WhatsApp Business API", icon: "✅", description: "API oficial de Meta — requiere cuenta Business verificada" },
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
            const active = activeTypes.has(type);
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
                      type: type as "EMAIL" | "WHATSAPP_BAILEYS" | "WHATSAPP_META",
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

// ─── Página principal ─────────────────────────────────────────────────────────

export default function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-1">Configuración</h1>
        <p className="text-slate-400 text-sm">
          Gestiona las categorías y canales de tu empresa.
        </p>
      </div>

      <div className="space-y-10">
        <CategoriesSection />
        <div className="border-t border-slate-800" />
        <ChannelsSection />
      </div>
    </div>
  );
}
