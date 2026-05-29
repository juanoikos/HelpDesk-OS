"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const PRIORITIES = [
  { value: "LOW",    label: "🔵 Baja — no urgente" },
  { value: "MEDIUM", label: "🟡 Media — normal" },
  { value: "HIGH",   label: "🟠 Alta — impacta trabajo" },
  { value: "URGENT", label: "🔴 Urgente — sistema caído" },
];

const CHANNELS = [
  { value: "WEB",      icon: "🌐", label: "Portal web" },
  { value: "EMAIL",    icon: "📧", label: "Email" },
  { value: "WHATSAPP", icon: "💬", label: "WhatsApp" },
  { value: "PHONE",    icon: "📞", label: "Llamada" },
];

export default function NewTicketPage() {
  const router = useRouter();
  const { data: categories } = trpc.settings.listCategories.useQuery();

  const create = trpc.tickets.create.useMutation({
    onSuccess: (ticket) => router.push(`/tickets/${ticket.id}`),
  });

  const [form, setForm] = useState({
    title:      "",
    body:       "",
    priority:   "MEDIUM",
    categoryId: "",
    channel:    "WEB",
  });

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const canSubmit = form.title.length >= 5 && form.body.length >= 10 && !create.isPending;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6">
        <Link href="/tickets" className="text-slate-500 hover:text-slate-300 text-sm">
          ← Volver a tickets
        </Link>
        <h1 className="text-2xl font-bold text-white mt-3">Nuevo ticket</h1>
        <p className="text-slate-400 text-sm mt-0.5">Completa la información del problema a resolver.</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        {/* Título */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Título <span className="text-slate-600">*</span>
          </label>
          <input
            value={form.title}
            onChange={set("title")}
            placeholder="Ej: Impresora no imprime en sala de reuniones"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-slate-600 text-xs mt-1">{form.title.length}/5 caracteres mínimo</p>
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">
            Descripción del problema <span className="text-slate-600">*</span>
          </label>
          <textarea
            value={form.body}
            onChange={set("body")}
            rows={5}
            placeholder="Describe el problema con el mayor detalle posible: qué pasó, cuándo empezó, qué equipo es, qué intentaste..."
            className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* Categoría + Prioridad */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Categoría</label>
            <select
              value={form.categoryId}
              onChange={set("categoryId")}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Sin categoría</option>
              {categories?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Prioridad</label>
            <select
              value={form.priority}
              onChange={set("priority")}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl text-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Canal de entrada */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-1.5">Canal de entrada</label>
          <div className="grid grid-cols-4 gap-2">
            {CHANNELS.map((ch) => (
              <button
                key={ch.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, channel: ch.value }))}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-medium transition-colors ${
                  form.channel === ch.value
                    ? "border-blue-500 bg-blue-950 text-white"
                    : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600 hover:text-slate-200"
                }`}
              >
                <span className="text-xl">{ch.icon}</span>
                {ch.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {create.error && (
          <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-xl px-4 py-3">
            {create.error.message}
          </p>
        )}

        {/* Botones */}
        <div className="flex gap-3 pt-1">
          <Link
            href="/tickets"
            className="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-colors text-sm"
          >
            Cancelar
          </Link>
          <button
            onClick={() =>
              create.mutate({
                title:      form.title,
                body:       form.body,
                priority:   form.priority   as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
                channel:    form.channel    as "WEB" | "EMAIL" | "WHATSAPP" | "PHONE",
                categoryId: form.categoryId || undefined,
              })
            }
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
