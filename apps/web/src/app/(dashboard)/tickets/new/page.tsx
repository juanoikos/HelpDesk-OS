"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Opciones de cada campo ───────────────────────────────────────────────────

const TYPES = [
  { value: "INCIDENT", label: "🔴 Incidente",     desc: "Algo dejó de funcionar" },
  { value: "REQUEST",  label: "🔵 Requerimiento",  desc: "Solicitud de servicio" },
  { value: "CHANGE",   label: "🟡 Cambio",         desc: "Modificación planificada" },
];

const PRIORITIES = [
  { value: "LOW",    label: "Baja",    desc: "No urgente, puede esperar" },
  { value: "MEDIUM", label: "Media",   desc: "Impacto normal" },
  { value: "HIGH",   label: "Alta",    desc: "Impacta el trabajo" },
  { value: "URGENT", label: "Urgente", desc: "Sistema caído / crítico" },
];

const IMPACTS = [
  { value: "LOW",      label: "Solo el usuario" },
  { value: "MEDIUM",   label: "Área / departamento" },
  { value: "HIGH",     label: "Múltiples áreas" },
  { value: "CRITICAL", label: "Toda la empresa" },
];

const CHANNELS = [
  { value: "WEB",      icon: "🌐", label: "Portal web" },
  { value: "EMAIL",    icon: "📧", label: "Email" },
  { value: "WHATSAPP", icon: "💬", label: "WhatsApp" },
  { value: "PHONE",    icon: "📞", label: "Llamada" },
];

// ─── Componente ───────────────────────────────────────────────────────────────

export default function NewTicketPage() {
  const router = useRouter();
  const { data: categories } = trpc.settings.listCategories.useQuery();
  const { data: agents }     = trpc.tickets.listAgents.useQuery();

  const create = trpc.tickets.create.useMutation({
    onSuccess: (ticket) => router.push(`/tickets/${ticket.id}`),
  });

  const [form, setForm] = useState({
    title:            "",
    body:             "",
    type:             "INCIDENT",
    priority:         "MEDIUM",
    impact:           "LOW",
    categoryId:       "",
    subcategory:      "",
    area:             "",
    location:         "",
    affectedSystem:   "",
    appVersion:       "",
    channel:          "WEB",
    assignedToId:     "",
    requesterName:    "",
    requesterContact: "",
  });

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const canSubmit = form.title.length >= 5 && form.body.length >= 10 && !create.isPending;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6">
        <Link href="/tickets" className="text-slate-500 hover:text-slate-300 text-sm">
          ← Volver a tickets
        </Link>
        <h1 className="text-2xl font-bold text-white mt-3">Nuevo ticket</h1>
        <p className="text-slate-400 text-sm mt-0.5">Completa la información del problema o solicitud.</p>
      </div>

      <div className="space-y-5">

        {/* ── Sección 1: Tipo ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">Tipo de ticket</h2>
          <div className="grid grid-cols-3 gap-3">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                className={`flex flex-col items-start gap-1 p-3.5 rounded-xl border text-left transition-colors ${
                  form.type === t.value
                    ? "border-blue-500 bg-blue-950"
                    : "border-slate-700 bg-slate-800 hover:border-slate-600"
                }`}
              >
                <span className="text-sm font-medium text-white">{t.label}</span>
                <span className="text-xs text-slate-500">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── Sección 2: Descripción ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Descripción del problema</h2>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Asunto / título <span className="text-red-400">*</span>
            </label>
            <input
              value={form.title}
              onChange={set("title")}
              placeholder="Resumen breve del problema"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-slate-600 text-xs mt-1">{form.title.length} / mín. 5 caracteres</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Descripción detallada <span className="text-red-400">*</span>
            </label>
            <textarea
              value={form.body}
              onChange={set("body")}
              rows={5}
              placeholder="¿Qué pasó? ¿Cuándo empezó? ¿Qué equipo es? ¿Qué intentaste hacer?..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* ── Sección 2b: Solicitante ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-300">Solicitante</h2>
            <p className="text-xs text-slate-500 mt-0.5">Si el ticket lo reportó otra persona, ingresa sus datos.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Nombre del solicitante</label>
              <input value={form.requesterName} onChange={set("requesterName")}
                placeholder="Ej: María González"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Correo o teléfono</label>
              <input value={form.requesterContact} onChange={set("requesterContact")}
                placeholder="Ej: maria@empresa.com / 3001234567"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* ── Sección 3: Clasificación ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Clasificación</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Categoría</label>
              <select value={form.categoryId} onChange={set("categoryId")}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Sin categoría</option>
                {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Subcategoría</label>
              <input value={form.subcategory} onChange={set("subcategory")}
                placeholder="Ej: Impresoras, VPN, Office..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Sistema / Aplicación afectada</label>
              <input value={form.affectedSystem} onChange={set("affectedSystem")}
                placeholder="Ej: ERP, CRM, Correo, Windows..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Versión / Release</label>
              <input value={form.appVersion} onChange={set("appVersion")}
                placeholder="Ej: v2.3.1, Office 365..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>

        {/* ── Sección 4: Prioridad e impacto ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Prioridad e impacto</h2>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Prioridad</label>
            <div className="grid grid-cols-4 gap-2">
              {PRIORITIES.map((p) => (
                <button key={p.value} type="button"
                  onClick={() => setForm((f) => ({ ...f, priority: p.value }))}
                  className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-center transition-colors ${
                    form.priority === p.value
                      ? "border-blue-500 bg-blue-950 text-white"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                  }`}>
                  <span className="text-sm font-semibold">{p.label}</span>
                  <span className="text-xs text-slate-500 leading-tight">{p.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Impacto</label>
            <div className="grid grid-cols-4 gap-2">
              {IMPACTS.map((i) => (
                <button key={i.value} type="button"
                  onClick={() => setForm((f) => ({ ...f, impact: i.value }))}
                  className={`py-2 px-2 rounded-xl border text-xs font-medium text-center transition-colors ${
                    form.impact === i.value
                      ? "border-purple-500 bg-purple-950 text-white"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                  }`}>
                  {i.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sección 5: Ubicación y origen ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300">Ubicación y origen</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Área / Departamento</label>
              <input value={form.area} onChange={set("area")}
                placeholder="Ej: Ventas, Contabilidad, TI..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Sede / Ubicación</label>
              <input value={form.location} onChange={set("location")}
                placeholder="Ej: Bogotá, Piso 3, Sala A..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Canal de entrada</label>
            <div className="grid grid-cols-4 gap-2">
              {CHANNELS.map((ch) => (
                <button key={ch.value} type="button"
                  onClick={() => setForm((f) => ({ ...f, channel: ch.value }))}
                  className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                    form.channel === ch.value
                      ? "border-blue-500 bg-blue-950 text-white"
                      : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                  }`}>
                  <span className="text-lg">{ch.icon}</span>
                  {ch.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sección 6: Asignación ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-3">Asignación (opcional)</h2>
          <select value={form.assignedToId} onChange={set("assignedToId")}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Sin asignar</option>
            {agents?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>

        {/* Error */}
        {create.error && (
          <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-xl px-4 py-3">
            {create.error.message}
          </p>
        )}

        {/* Botones */}
        <div className="flex gap-3 pb-8">
          <Link href="/tickets"
            className="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-colors text-sm">
            Cancelar
          </Link>
          <button
            onClick={() => create.mutate({
              title:          form.title,
              body:           form.body,
              type:           form.type           as "INCIDENT" | "REQUEST" | "CHANGE",
              priority:       form.priority       as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
              impact:         form.impact         as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
              channel:        form.channel        as "WEB" | "EMAIL" | "WHATSAPP" | "PHONE",
              categoryId:       form.categoryId       || undefined,
              subcategory:      form.subcategory      || undefined,
              area:             form.area             || undefined,
              location:         form.location         || undefined,
              affectedSystem:   form.affectedSystem   || undefined,
              appVersion:       form.appVersion       || undefined,
              assignedToId:     form.assignedToId     || undefined,
              requesterName:    form.requesterName    || undefined,
              requesterContact: form.requesterContact || undefined,
            })}
            disabled={!canSubmit}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors text-sm"
          >
            {create.isPending ? "Creando..." : "Crear ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}
