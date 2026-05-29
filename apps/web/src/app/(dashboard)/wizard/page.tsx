"use client";

import { trpc } from "@/trpc/react";
import { TEMPLATES, type WizardConfig } from "@/lib/wizard-config";
import { useState } from "react";
import Link from "next/link";

type Method = "claude" | "template" | null;

// ─── Canales disponibles ──────────────────────────────────────────────────────

const ALL_CHANNELS = [
  { id: "email",    icon: "📧", label: "Email",    description: "Tickets por correo electrónico" },
  { id: "whatsapp", icon: "💬", label: "WhatsApp", description: "Tickets por WhatsApp (Baileys)" },
  { id: "phone",    icon: "📞", label: "Llamada",  description: "Tickets por llamada telefónica" },
];

// ─── Selector de método ───────────────────────────────────────────────────────

function StepMethod({
  onSelect,
  claudeAvailable,
}: {
  onSelect: (m: Method) => void;
  claudeAvailable: boolean;
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Configura tu empresa</h1>
        <p className="text-slate-400">Elige cómo quieres generar la configuración inicial.</p>
      </div>
      <div className="grid gap-4">
        <button
          onClick={() => onSelect("claude")}
          disabled={!claudeAvailable}
          className="bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700 rounded-2xl p-5 text-left transition-colors"
        >
          <div className="flex items-start gap-4">
            <span className="text-2xl">🤖</span>
            <div>
              <p className="text-white font-semibold">Describir con Claude (Anthropic)</p>
              <p className="text-slate-400 text-sm mt-0.5">
                Escribe en tus palabras qué hace tu empresa y Claude propone la configuración.
              </p>
              {!claudeAvailable && (
                <p className="text-amber-400 text-xs mt-1">Requiere ANTHROPIC_API_KEY en .env.local</p>
              )}
            </div>
          </div>
        </button>

        <button
          onClick={() => onSelect("template")}
          className="bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-2xl p-5 text-left transition-colors"
        >
          <div className="flex items-start gap-4">
            <span className="text-2xl">📋</span>
            <div>
              <p className="text-white font-semibold">Elegir template — Sin IA</p>
              <p className="text-slate-400 text-sm mt-0.5">
                Selecciona el tipo de empresa y carga categorías predefinidas.
                Sin API keys, funciona siempre.
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
}

// ─── Paso: Formulario de descripción (Claude) ─────────────────────────────────

function StepDescribe({
  onAnalyze,
  onBack,
  loading,
  error,
}: {
  onAnalyze: (description: string) => void;
  onBack: () => void;
  loading: boolean;
  error?: string;
}) {
  const [text, setText] = useState("");

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-300 text-sm mb-4 block">
          ← Cambiar método
        </button>
        <h1 className="text-2xl font-bold text-white mb-2">Describir con Claude</h1>
        <p className="text-slate-400">
          Describe tu empresa y Claude propondrá la configuración inicial.
        </p>
      </div>
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          ¿Qué hace tu empresa y qué tipo de soporte brinda?
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          placeholder="Ejemplo: Somos una empresa de soporte técnico con 5 técnicos. Atendemos clientes de hardware, software, redes e impresoras. Los clientes nos contactan por WhatsApp y correo electrónico..."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <p className="text-slate-600 text-xs mt-2">{text.length} caracteres · mínimo 20</p>
        {error && (
          <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-3 mt-4">
            {error}
          </p>
        )}
        <button
          onClick={() => onAnalyze(text)}
          disabled={loading || text.length < 20}
          className="mt-5 w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors text-sm flex items-center justify-center gap-2"
        >
          {loading ? <><span className="animate-spin inline-block">⟳</span> Analizando...</> : "✨ Analizar con Claude"}
        </button>
      </div>
    </div>
  );
}

// ─── Paso: Elegir template ────────────────────────────────────────────────────

function StepTemplate({
  onSelect,
  onBack,
}: {
  onSelect: (config: WizardConfig) => void;
  onBack: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <button onClick={onBack} className="text-slate-500 hover:text-slate-300 text-sm mb-4 block">
          ← Cambiar método
        </button>
        <h1 className="text-2xl font-bold text-white mb-2">Elige el tipo de empresa</h1>
        <p className="text-slate-400">Se cargarán categorías y canales predefinidos. Podrás editarlos después.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {Object.entries(TEMPLATES).map(([key, t]) => (
          <button
            key={key}
            onClick={() => onSelect(t.config)}
            className="bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-2xl p-5 text-left transition-colors"
          >
            <div className="text-3xl mb-3">{t.icon}</div>
            <p className="text-white font-semibold">{t.label}</p>
            <p className="text-slate-500 text-xs mt-1">
              {t.config.categories.length} categorías · {t.config.channels.join(", ")}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Paso: Revisión ───────────────────────────────────────────────────────────

function StepReview({
  config,
  onConfirm,
  onBack,
  loading,
}: {
  config: WizardConfig;
  onConfirm: (final: WizardConfig) => void;
  onBack: () => void;
  loading: boolean;
}) {
  const [channels, setChannels] = useState<string[]>(config.channels);

  const toggleChannel = (id: string) => {
    setChannels((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Configuración propuesta</h1>
        <p className="text-slate-400 text-sm">{config.summary}</p>
      </div>

      {/* Categorías */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 mb-4">
        <h2 className="text-white font-semibold mb-4">Categorías de tickets ({config.categories.length})</h2>
        <div className="grid grid-cols-2 gap-2">
          {config.categories.map((cat) => (
            <div key={cat.name} className="flex items-center gap-2.5 bg-slate-800 rounded-lg px-3 py-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-slate-200 text-sm">{cat.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Canales — selección manual */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 mb-6">
        <h2 className="text-white font-semibold mb-1">Canales de comunicación</h2>
        <p className="text-slate-500 text-xs mb-4">Activa o desactiva los canales que quieras usar.</p>
        <div className="grid grid-cols-2 gap-3">
          {ALL_CHANNELS.map((ch) => {
            const active = channels.includes(ch.id);
            return (
              <button
                key={ch.id}
                onClick={() => toggleChannel(ch.id)}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                  active
                    ? "border-blue-500 bg-blue-950"
                    : "border-slate-700 bg-slate-800 opacity-50"
                }`}
              >
                <span className="text-xl mt-0.5">{ch.icon}</span>
                <div>
                  <p className={`font-medium text-sm ${active ? "text-white" : "text-slate-400"}`}>
                    {ch.label}
                  </p>
                  <p className="text-slate-500 text-xs mt-0.5">{ch.description}</p>
                </div>
                <span className={`ml-auto text-xs font-semibold ${active ? "text-blue-400" : "text-slate-600"}`}>
                  {active ? "✓ Activo" : "Inactivo"}
                </span>
              </button>
            );
          })}
        </div>
        {channels.length === 0 && (
          <p className="text-amber-400 text-xs mt-3">⚠ Activa al menos un canal de comunicación.</p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-colors text-sm"
        >
          ← Volver
        </button>
        <button
          onClick={() => onConfirm({ ...config, channels })}
          disabled={loading || channels.length === 0}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors text-sm"
        >
          {loading ? "Guardando..." : "✓ Confirmar y guardar"}
        </button>
      </div>
    </div>
  );
}

// ─── Confirmación final ───────────────────────────────────────────────────────

function StepDone() {
  return (
    <div className="max-w-md mx-auto text-center py-12">
      <div className="w-16 h-16 bg-green-900 border border-green-700 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-green-400 text-2xl">✓</span>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">¡Empresa configurada!</h1>
      <p className="text-slate-400 mb-6">
        Categorías y canales guardados. Puedes editarlos cuando quieras desde Configuración.
      </p>
      <div className="flex gap-3 justify-center">
        <Link href="/dashboard" className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium px-5 py-2.5 rounded-xl transition-colors text-sm">
          Dashboard
        </Link>
        <Link href="/settings" className="bg-blue-600 hover:bg-blue-500 text-white font-medium px-5 py-2.5 rounded-xl transition-colors text-sm">
          Editar configuración →
        </Link>
      </div>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function WizardPage() {
  const [method, setMethod] = useState<Method>(null);
  const [config, setConfig] = useState<WizardConfig | null>(null);
  const [done, setDone] = useState(false);

  const { data: providers } = trpc.wizard.availableProviders.useQuery();
  const analyze = trpc.wizard.analyze.useMutation({ onSuccess: setConfig });
  const save = trpc.wizard.saveConfig.useMutation({ onSuccess: () => setDone(true) });

  if (done) return <StepDone />;

  if (config) {
    return (
      <StepReview
        config={config}
        onConfirm={(final) => save.mutate(final)}
        onBack={() => setConfig(null)}
        loading={save.isPending}
      />
    );
  }

  if (method === "template") {
    return <StepTemplate onSelect={setConfig} onBack={() => setMethod(null)} />;
  }

  if (method === "claude") {
    return (
      <StepDescribe
        onAnalyze={(description) => analyze.mutate({ description, provider: "claude" })}
        onBack={() => setMethod(null)}
        loading={analyze.isPending}
        error={analyze.error?.message}
      />
    );
  }

  return (
    <StepMethod
      onSelect={setMethod}
      claudeAvailable={providers?.claude ?? false}
    />
  );
}
