"use client";

import { trpc } from "@/trpc/react";
import type { WizardConfig } from "@/server/routers/wizard";
import { useState } from "react";
import Link from "next/link";

// ─── Paso 1: Formulario de descripción ───────────────────────────────────────

function StepDescribe({
  onAnalyze,
  loading,
  error,
}: {
  onAnalyze: (description: string) => void;
  loading: boolean;
  error?: string;
}) {
  const [text, setText] = useState("");

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">
          Configura tu empresa con IA
        </h1>
        <p className="text-slate-400">
          Describe tu empresa en tus propias palabras. Claude analizará la
          descripción y propondrá la configuración inicial del sistema.
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
          placeholder={
            "Ejemplo: Somos una empresa de soporte técnico con 8 agentes. " +
            "Atendemos tickets de hardware, software, redes e impresoras. " +
            "Los usuarios nos contactan por correo y WhatsApp. " +
            "Manejamos equipos de escritorio, laptops y servidores."
          }
          className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <p className="text-slate-600 text-xs mt-2">
          Mínimo 20 caracteres · {text.length} escritos
        </p>

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
          {loading ? (
            <>
              <span className="animate-spin">⟳</span>
              Analizando con Claude...
            </>
          ) : (
            "✨ Analizar con IA"
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Paso 2: Revisión de la configuración sugerida ───────────────────────────

function StepReview({
  config,
  onConfirm,
  onBack,
  loading,
}: {
  config: WizardConfig;
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">
          Configuración propuesta por Claude
        </h1>
        <p className="text-slate-400 text-sm">{config.summary}</p>
      </div>

      {/* Categorías */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 mb-4">
        <h2 className="text-white font-semibold mb-4">
          Categorías de tickets ({config.categories.length})
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {config.categories.map((cat) => (
            <div
              key={cat.name}
              className="flex items-center gap-2.5 bg-slate-800 rounded-lg px-3 py-2"
            >
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: cat.color }}
              />
              <span className="text-slate-200 text-sm">{cat.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Canales */}
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 mb-6">
        <h2 className="text-white font-semibold mb-4">Canales de comunicación</h2>
        <div className="flex gap-2 flex-wrap">
          {config.channels.map((ch) => (
            <span
              key={ch}
              className="bg-slate-800 text-slate-300 text-sm px-3 py-1.5 rounded-lg capitalize"
            >
              {ch === "email" ? "📧 Email" : ch === "whatsapp" ? "💬 WhatsApp" : ch}
            </span>
          ))}
        </div>
      </div>

      {/* Botones */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={loading}
          className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-colors text-sm"
        >
          ← Volver a analizar
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors text-sm"
        >
          {loading ? "Guardando..." : "✓ Confirmar y guardar"}
        </button>
      </div>
    </div>
  );
}

// ─── Paso 3: Confirmación ─────────────────────────────────────────────────────

function StepDone() {
  return (
    <div className="max-w-md mx-auto text-center py-12">
      <div className="w-16 h-16 bg-green-900 border border-green-700 rounded-full flex items-center justify-center mx-auto mb-4">
        <span className="text-green-400 text-2xl">✓</span>
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">
        ¡Empresa configurada!
      </h1>
      <p className="text-slate-400 mb-6">
        Las categorías y canales quedaron guardados en la base de datos.
      </p>
      <Link
        href="/dashboard"
        className="inline-block bg-blue-600 hover:bg-blue-500 text-white font-medium px-6 py-3 rounded-xl transition-colors text-sm"
      >
        Ir al dashboard →
      </Link>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function WizardPage() {
  const [config, setConfig] = useState<WizardConfig | null>(null);
  const [done, setDone] = useState(false);

  const analyze = trpc.wizard.analyze.useMutation({
    onSuccess: (data) => setConfig(data),
  });

  const save = trpc.wizard.saveConfig.useMutation({
    onSuccess: () => setDone(true),
  });

  if (done) return <StepDone />;

  if (config) {
    return (
      <StepReview
        config={config}
        onConfirm={() => save.mutate(config)}
        onBack={() => setConfig(null)}
        loading={save.isPending}
      />
    );
  }

  return (
    <StepDescribe
      onAnalyze={(description) => analyze.mutate({ description })}
      loading={analyze.isPending}
      error={analyze.error?.message}
    />
  );
}
