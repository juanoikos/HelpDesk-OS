"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Opciones estáticas ───────────────────────────────────────────────────────

const TYPES = [
  { value: "INCIDENT", label: "🔴 Incidente",      desc: "Algo dejó de funcionar" },
  { value: "REQUEST",  label: "🔵 Requerimiento",   desc: "Solicitud de servicio" },
  { value: "CHANGE",   label: "🟡 Cambio",          desc: "Modificación planificada" },
];

const PRIORITIES = [
  { value: "LOW",    label: "Baja",    desc: "No urgente" },
  { value: "MEDIUM", label: "Media",   desc: "Impacto normal" },
  { value: "HIGH",   label: "Alta",    desc: "Impacta el trabajo" },
  { value: "URGENT", label: "Urgente", desc: "Sistema caído" },
];

const IMPACTS = [
  { value: "LOW",      label: "Solo el usuario" },
  { value: "MEDIUM",   label: "Área / depto." },
  { value: "HIGH",     label: "Múltiples áreas" },
  { value: "CRITICAL", label: "Toda la empresa" },
];

const CHANNELS = [
  { value: "WEB",      icon: "🌐", label: "Portal web" },
  { value: "EMAIL",    icon: "📧", label: "Email" },
  { value: "WHATSAPP", icon: "💬", label: "WhatsApp" },
  { value: "PHONE",    icon: "📞", label: "Llamada" },
];

// Equipos por tipo de sede
const EQUIPMENT_OFFICE  = ["Desktop", "Portátil"];
const EQUIPMENT_POS     = ["POS Principal", "POS Secundario"];

const DEVICE_TYPES_OFFICE = ["Pantalla", "CPU", "Impresora", "Teclado", "Mouse"];
const DEVICE_TYPES_POS    = [
  "Pantalla", "CPU", "Impresora", "Escáner",
  "Teclado", "Mouse", "Impresora POS", "Impresora Administrativa",
];

// ─── Componentes auxiliares ───────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <h2 className="text-sm font-semibold text-slate-300">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const selectCls = inputCls;

// ─── Página principal ─────────────────────────────────────────────────────────

export default function NewTicketPage() {
  const router = useRouter();
  const { data: categories } = trpc.settings.listCategories.useQuery();
  const { data: agents }     = trpc.tickets.listAgents.useQuery();

  const create = trpc.tickets.create.useMutation({
    onSuccess: (ticket) => router.push(`/tickets/${ticket.id}`),
  });

  // ── Estado del formulario ──
  const [siteType, setSiteType] = useState<"OFFICE" | "POS" | null>(null);

  const [form, setForm] = useState({
    // Común
    type:           "INCIDENT",
    title:          "",
    body:           "",
    priority:       "MEDIUM",
    impact:         "LOW",
    categoryId:     "",
    subcategory:    "",
    affectedSystem: "",
    appVersion:     "",
    channel:        "WEB",
    assignedToId:   "",
    // Oficina central
    requesterName:    "",
    requesterContact: "",
    area:             "",
    location:         "",
    // Punto de venta
    posLocation:      "",   // ciudad / sede del PV (campo obligatorio en POS)
    posName:          "",   // nombre del punto de venta
    posPhone:         "",   // teléfono del PV
    posEmail:         "",   // correo del PV
    // Equipo
    equipmentName: "",
    deviceType:    "",
  });

  const set =
    (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const deviceOptions = siteType === "POS" ? DEVICE_TYPES_POS : DEVICE_TYPES_OFFICE;
  const equipOptions  = siteType === "POS" ? EQUIPMENT_POS    : EQUIPMENT_OFFICE;

  // Validación según tipo de sede
  const canSubmit = (() => {
    if (!siteType) return false;
    if (form.title.length < 5 || form.body.length < 10) return false;
    if (siteType === "POS" && (!form.posLocation.trim() || !form.posName.trim())) return false;
    if (create.isPending) return false;
    return true;
  })();

  const handleSubmit = () => {
    const isPOS = siteType === "POS";
    create.mutate({
      title:          form.title,
      body:           form.body,
      type:           form.type           as "INCIDENT" | "REQUEST" | "CHANGE",
      priority:       form.priority       as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      impact:         form.impact         as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      channel:        form.channel        as "WEB" | "EMAIL" | "WHATSAPP" | "PHONE",
      categoryId:     form.categoryId     || undefined,
      subcategory:    form.subcategory    || undefined,
      affectedSystem: form.affectedSystem || undefined,
      appVersion:     form.appVersion     || undefined,
      assignedToId:   form.assignedToId   || undefined,
      siteType,
      equipmentName:    form.equipmentName    || undefined,
      deviceType:       form.deviceType       || undefined,
      // Oficina
      requesterName:    isPOS ? form.posName    : (form.requesterName    || undefined),
      requesterContact: isPOS ? (form.posEmail || form.posPhone) : (form.requesterContact || undefined),
      area:             !isPOS ? (form.area     || undefined) : undefined,
      location:         isPOS  ? form.posLocation : (form.location || undefined),
    });
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto">
      {/* Encabezado */}
      <div className="mb-6">
        <Link href="/tickets" className="text-slate-500 hover:text-slate-300 text-sm">← Volver a tickets</Link>
        <h1 className="text-2xl font-bold text-white mt-3">Nuevo ticket</h1>
        <p className="text-slate-400 text-sm mt-0.5">Completa la información del problema o solicitud.</p>
      </div>

      <div className="space-y-5">

        {/* ── PASO 0: Tipo de sede ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-slate-300 mb-4">¿Desde dónde se reporta?</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: "OFFICE", icon: "🏢", label: "Oficina Central",  desc: "Usuarios de oficina, equipos de escritorio o portátiles" },
              { value: "POS",    icon: "🏪", label: "Punto de Venta",   desc: "Tiendas, puntos de venta, cajas, terminales POS" },
            ].map((opt) => (
              <button key={opt.value} type="button"
                onClick={() => { setSiteType(opt.value as "OFFICE" | "POS"); setForm((f) => ({ ...f, equipmentName: "", deviceType: "" })); }}
                className={`flex flex-col items-start gap-2 p-4 rounded-2xl border text-left transition-colors ${
                  siteType === opt.value
                    ? "border-blue-500 bg-blue-950"
                    : "border-slate-700 bg-slate-800 hover:border-slate-600"
                }`}>
                <span className="text-3xl">{opt.icon}</span>
                <span className="text-white font-semibold text-sm">{opt.label}</span>
                <span className="text-slate-500 text-xs leading-snug">{opt.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── El resto del formulario solo aparece al elegir sede ── */}
        {siteType && (
          <>
            {/* ── Tipo de ticket ── */}
            <SectionCard title="Tipo de ticket">
              <div className="grid grid-cols-3 gap-3">
                {TYPES.map((t) => (
                  <button key={t.value} type="button"
                    onClick={() => setForm((f) => ({ ...f, type: t.value }))}
                    className={`flex flex-col items-start gap-1 p-3.5 rounded-xl border text-left transition-colors ${
                      form.type === t.value ? "border-blue-500 bg-blue-950" : "border-slate-700 bg-slate-800 hover:border-slate-600"
                    }`}>
                    <span className="text-sm font-medium text-white">{t.label}</span>
                    <span className="text-xs text-slate-500">{t.desc}</span>
                  </button>
                ))}
              </div>
            </SectionCard>

            {/* ── PUNTO DE VENTA: Ubicación primero (obligatorio) ── */}
            {siteType === "POS" && (
              <SectionCard title="Ubicación del punto de venta">
                {/*
                  TODO: cuando se importe la BD de puntos de venta, reemplazar
                  posLocation por un select de ciudades y posName por un select
                  filtrado por ciudad. Por ahora son campos de texto obligatorios.
                */}
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Ciudad / Sede" required>
                    <input value={form.posLocation} onChange={set("posLocation")}
                      placeholder="Ej: Bogotá, Medellín, Cali..."
                      className={inputCls} />
                  </Field>
                  <Field label="Nombre del Punto de Venta" required>
                    <input value={form.posName} onChange={set("posName")}
                      placeholder="Ej: Juan Valdez CC Andino"
                      className={inputCls} />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Correo del PV">
                    <input value={form.posEmail} onChange={set("posEmail")}
                      placeholder="correo@puntodeventa.com"
                      className={inputCls} />
                  </Field>
                  <Field label="Teléfono del PV">
                    <input value={form.posPhone} onChange={set("posPhone")}
                      placeholder="3001234567"
                      className={inputCls} />
                  </Field>
                </div>
              </SectionCard>
            )}

            {/* ── OFICINA CENTRAL: Solicitante ── */}
            {siteType === "OFFICE" && (
              <SectionCard title="Solicitante">
                {/*
                  TODO: reemplazar por <ContactAutocomplete> que busca en tabla Contact.
                  Al seleccionar nombre → autofill correo/teléfono.
                  Ver: TODO-contactos-y-ubicaciones
                */}
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Nombre del solicitante">
                    <input value={form.requesterName} onChange={set("requesterName")}
                      placeholder="Ej: María González"
                      className={inputCls} />
                  </Field>
                  <Field label="Correo o teléfono">
                    <input value={form.requesterContact} onChange={set("requesterContact")}
                      placeholder="maria@empresa.com / 3001234567"
                      className={inputCls} />
                  </Field>
                </div>
              </SectionCard>
            )}

            {/* ── Descripción ── */}
            <SectionCard title="Descripción del problema">
              <Field label="Asunto / Título" required>
                <input value={form.title} onChange={set("title")}
                  placeholder="Resumen breve del problema"
                  className={inputCls} />
                <p className="text-slate-600 text-xs mt-1">{form.title.length} / mín. 5 caracteres</p>
              </Field>
              <Field label="Descripción detallada" required>
                <textarea value={form.body} onChange={set("body")} rows={5}
                  placeholder="¿Qué pasó? ¿Cuándo empezó? ¿Qué intentaste?..."
                  className={inputCls + " resize-none"} />
              </Field>
            </SectionCard>

            {/* ── Equipo afectado ── */}
            <SectionCard title="Equipo afectado">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Equipo">
                  <select value={form.equipmentName}
                    onChange={(e) => setForm((f) => ({ ...f, equipmentName: e.target.value, deviceType: "" }))}
                    className={selectCls}>
                    <option value="">Seleccionar...</option>
                    {equipOptions.map((e) => <option key={e} value={e}>{e}</option>)}
                  </select>
                </Field>
                <Field label="Tipo de componente">
                  <select value={form.deviceType} onChange={set("deviceType")} className={selectCls}>
                    <option value="">Seleccionar...</option>
                    {deviceOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                  </select>
                </Field>
              </div>
            </SectionCard>

            {/* ── Clasificación ── */}
            <SectionCard title="Clasificación">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Categoría">
                  <select value={form.categoryId} onChange={set("categoryId")} className={selectCls}>
                    <option value="">Sin categoría</option>
                    {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Subcategoría">
                  <input value={form.subcategory} onChange={set("subcategory")}
                    placeholder="Ej: Impresoras, VPN, Office..."
                    className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Sistema / Aplicación afectada">
                  <input value={form.affectedSystem} onChange={set("affectedSystem")}
                    placeholder="Ej: ERP, CRM, Correo..."
                    className={inputCls} />
                </Field>
                <Field label="Versión / Release">
                  <input value={form.appVersion} onChange={set("appVersion")}
                    placeholder="Ej: v2.3.1, Office 365..."
                    className={inputCls} />
                </Field>
              </div>
            </SectionCard>

            {/* ── Prioridad e impacto ── */}
            <SectionCard title="Prioridad e impacto">
              <Field label="Prioridad">
                <div className="grid grid-cols-4 gap-2">
                  {PRIORITIES.map((p) => (
                    <button key={p.value} type="button"
                      onClick={() => setForm((f) => ({ ...f, priority: p.value }))}
                      className={`flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl border text-center transition-colors ${
                        form.priority === p.value ? "border-blue-500 bg-blue-950 text-white" : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                      }`}>
                      <span className="text-sm font-semibold">{p.label}</span>
                      <span className="text-xs text-slate-500 leading-tight">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Impacto">
                <div className="grid grid-cols-4 gap-2">
                  {IMPACTS.map((i) => (
                    <button key={i.value} type="button"
                      onClick={() => setForm((f) => ({ ...f, impact: i.value }))}
                      className={`py-2 px-2 rounded-xl border text-xs font-medium text-center transition-colors ${
                        form.impact === i.value ? "border-purple-500 bg-purple-950 text-white" : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                      }`}>
                      {i.label}
                    </button>
                  ))}
                </div>
              </Field>
            </SectionCard>

            {/* ── Ubicación y origen (solo Oficina Central) ── */}
            {siteType === "OFFICE" && (
              <SectionCard title="Ubicación y origen">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Área / Departamento">
                    <input value={form.area} onChange={set("area")}
                      placeholder="Ej: Ventas, Contabilidad, TI..."
                      className={inputCls} />
                  </Field>
                  <Field label="Sede / Piso / Sala">
                    {/* TODO: cambiar por <LocationSelect> con tabla Location */}
                    <input value={form.location} onChange={set("location")}
                      placeholder="Ej: Bogotá, Piso 3, Sala A..."
                      className={inputCls} />
                  </Field>
                </div>
                <Field label="Canal de entrada">
                  <div className="grid grid-cols-4 gap-2">
                    {CHANNELS.map((ch) => (
                      <button key={ch.value} type="button"
                        onClick={() => setForm((f) => ({ ...f, channel: ch.value }))}
                        className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                          form.channel === ch.value ? "border-blue-500 bg-blue-950 text-white" : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                        }`}>
                        <span className="text-lg">{ch.icon}</span>
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </Field>
              </SectionCard>
            )}

            {/* ── Canal de entrada (Punto de Venta) ── */}
            {siteType === "POS" && (
              <SectionCard title="Canal de entrada">
                <div className="grid grid-cols-4 gap-2">
                  {CHANNELS.map((ch) => (
                    <button key={ch.value} type="button"
                      onClick={() => setForm((f) => ({ ...f, channel: ch.value }))}
                      className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                        form.channel === ch.value ? "border-blue-500 bg-blue-950 text-white" : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                      }`}>
                      <span className="text-lg">{ch.icon}</span>
                      {ch.label}
                    </button>
                  ))}
                </div>
              </SectionCard>
            )}

            {/* ── Asignación ── */}
            <SectionCard title="Asignación (opcional)">
              <select value={form.assignedToId} onChange={set("assignedToId")} className={selectCls}>
                <option value="">Sin asignar</option>
                {agents?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </SectionCard>

            {/* Error */}
            {create.error && (
              <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-xl px-4 py-3">
                {create.error.message}
              </p>
            )}

            {/* Aviso campos obligatorios POS */}
            {siteType === "POS" && (!form.posLocation.trim() || !form.posName.trim()) && (
              <p className="text-amber-400 text-xs bg-amber-950 border border-amber-900 rounded-xl px-4 py-3">
                ⚠ La ciudad/sede y el nombre del punto de venta son obligatorios.
              </p>
            )}

            {/* Botones */}
            <div className="flex gap-3 pb-8">
              <Link href="/tickets"
                className="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl transition-colors text-sm">
                Cancelar
              </Link>
              <button onClick={handleSubmit} disabled={!canSubmit}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-colors text-sm">
                {create.isPending ? "Creando..." : "Crear ticket"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
