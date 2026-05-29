"use client";

import { trpc } from "@/trpc/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── Datos estáticos ──────────────────────────────────────────────────────────

// ── Vista Usuario ──
const USER_TYPES = [
  { value: "INCIDENT",           label: "🔴 Incidencia",         desc: "Algo dejó de funcionar" },
  { value: "REQUEST",            label: "🔵 Solicitud",           desc: "Necesito algo" },
  { value: "ACCESS_PERMISSIONS", label: "🔑 Acceso y permisos",   desc: "No puedo entrar a un sistema" },
  { value: "PURCHASE",           label: "🛒 Compra / insumo",     desc: "Necesito un equipo o material" },
  { value: "QUERY",              label: "💬 Consulta",            desc: "Tengo una pregunta" },
];

const WHERE_OPTIONS = [
  { value: "Oficina",             icon: "🏢", siteType: "OFFICE" as const },
  { value: "Punto de venta",      icon: "🏪", siteType: "POS"    as const },
  { value: "Bodega / Backoffice", icon: "📦", siteType: "OFFICE" as const },
  { value: "Remoto / Teletrabajo",icon: "💻", siteType: "OFFICE" as const },
];

const WHAT_NEEDED = [
  "No puedo acceder",
  "No funciona mi equipo",
  "No imprime",
  "No tengo internet / red",
  "No funciona el correo o Teams",
  "No funciona el POS / caja",
  "No funciona el datáfono",
  "No funciona el lector de código",
  "Necesito instalar software",
  "Necesito un equipo o accesorio",
  "Otro",
];

const AFFECTED_SERVICE_OPTIONS = [
  "Portátil","Ordenador de mesa","Impresora","POS / Caja","Datáfono",
  "Lector de código","Monitor / pantalla","Correo / Outlook","Teams",
  "Internet / Wi-Fi","Aplicación / software","Otro",
];

const IMPACT_USER = [
  { value: "CRITICAL", label: "🚨 No puedo trabajar" },
  { value: "CRITICAL", label: "🚫 No se puede vender / facturar" },
  { value: "HIGH",     label: "⚠️ Afecta a varias personas" },
  { value: "MEDIUM",   label: "🟡 Puedo trabajar con dificultad" },
  { value: "LOW",      label: "💬 Solo es una consulta" },
];

// ── Vista TI ──
const TI_TYPES = [
  { value: "INCIDENT",           label: "🔴 Incidencia" },
  { value: "REQUEST",            label: "🔵 Solicitud de servicio" },
  { value: "ACCESS_PERMISSIONS", label: "🔑 Acceso y permisos" },
  { value: "PURCHASE",           label: "🛒 Compra / reposición / insumo" },
  { value: "QUERY",              label: "💬 Consulta" },
  { value: "PROBLEM",            label: "🔶 Problema" },
  { value: "CHANGE",             label: "🟡 Cambio" },
];

const LOCATION_OPTIONS = ["Oficina","Punto de venta","Bodega / Backoffice","Remoto / Teletrabajo"];

// ── Matriz de dependencias: Tipo → Categoría → { subcategorías, activos, grupo sugerido } ──
// Fuente: Matriz_dependencias_tickets.xlsx — Matriz maestra (162 filas)
type MatrixEntry = { subcategories: string[]; assets: string[]; group: string };
const TICKET_MATRIX: Record<string, Record<string, MatrixEntry>> = {
  INCIDENT: {
    "Equipos de trabajo": {
      subcategories: ["Portátil","Desktop","Monitor / pantalla","Docking station","Teclado","Ratón","Cámara web","Auriculares / diadema","Micrófono","Otro periférico"],
      assets: ["Portátil","Desktop","Monitor","Docking","Teclado","Ratón","Cámara web","Diadema"],
      group: "Mesa de ayuda / Soporte de campo",
    },
    "Impresión": {
      subcategories: ["Impresora de oficina","Impresora térmica","Escáner","No imprime","Imprime mal","Atasco de papel","Sin conexión","Cambio de tóner / cinta / papel","Instalación / configuración"],
      assets: ["Impresora de oficina","Impresora térmica","Escáner","Servidor de impresión"],
      group: "Mesa de ayuda / Soporte de campo / Proveedor externo",
    },
    "Red e internet": {
      subcategories: ["Sin internet","Internet lento","Wi-Fi","Red cableada","VPN","Telefonía IP","Puerto de red","Router / switch / access point","Intermitencia"],
      assets: ["Router","Switch","Access point","Puerto de red","Firewall","Enlace de internet","Teléfono IP"],
      group: "Infraestructura y redes / Mesa de ayuda / Proveedor externo",
    },
    "Correo y colaboración": {
      subcategories: ["Correo Outlook","Microsoft Teams","Calendario","OneDrive","SharePoint","Firma de correo","Buzón compartido","Videollamadas / audio"],
      assets: ["Correo Exchange / Outlook","Teams","OneDrive","SharePoint","Buzón compartido","Calendario"],
      group: "Mesa de ayuda / Aplicaciones",
    },
    "Software y aplicaciones": {
      subcategories: ["Sistema operativo","Microsoft Office","ERP / sistema contable","CRM","Navegador web","Antivirus","Aplicación corporativa","Instalación de software","Actualización de software","Licencia / activación"],
      assets: ["Portátil","Desktop","Servidor","ERP","CRM","Office","Antivirus","Aplicación corporativa"],
      group: "Aplicaciones / Mesa de ayuda / Infraestructura y redes / Proveedor externo",
    },
    "Accesos y permisos": {
      subcategories: ["Restablecer contraseña","Desbloqueo de cuenta","Alta de usuario","Baja de usuario","Permisos de carpeta","Permisos de correo","Permisos de sistema","MFA / autenticación"],
      assets: ["Usuario","Correo","Carpeta compartida","SharePoint","ERP","CRM","VPN","MFA"],
      group: "Mesa de ayuda / Aplicaciones / Infraestructura y redes",
    },
    "Punto de venta (POS)": {
      subcategories: ["POS / caja","Facturación","Cierre de caja","Apertura de caja","Impresora de tickets","Lector de código de barras","Cajón monedero","Balanza","Pantalla cliente","Tablet de tienda"],
      assets: ["POS","Caja","Impresora térmica","Lector de código","Cajón monedero","Balanza","Pantalla cliente","Tablet"],
      group: "POS / retail / Soporte de campo / Mesa de ayuda / Proveedor externo",
    },
    "Pagos y datáfonos": {
      subcategories: ["Datáfono no funciona","Datáfono sin conexión","No procesa pago","Pago rechazado","Integración POS – datáfono","Cambio de papel","Configuración"],
      assets: ["Datáfono","POS","Red tienda","Pasarela / integración"],
      group: "POS / retail / Proveedor externo / Mesa de ayuda",
    },
    "Seguridad electrónica": {
      subcategories: ["CCTV / cámaras","Grabador DVR / NVR","Control de acceso","Alarma","Videoportero","Sin imagen","Sin grabación","Revisión de cámaras"],
      assets: ["Cámara","DVR","NVR","Controladora","Alarma","Videoportero"],
      group: "Seguridad electrónica / Proveedor externo / Soporte de campo",
    },
    "Energía y protección eléctrica": {
      subcategories: ["UPS","Regulador","Fuente de poder","Equipo no enciende","Cortes de energía","Batería UPS","Alarma UPS"],
      assets: ["UPS","Regulador","Fuente de poder","Circuito eléctrico","Equipo afectado"],
      group: "Soporte de campo / Infraestructura y redes / Proveedor externo",
    },
    "Otro": {
      subcategories: ["Otro","No clasificado"],
      assets: ["Otro"],
      group: "Mesa de ayuda",
    },
  },
  REQUEST: {
    "Equipos de trabajo": {
      subcategories: ["Nuevo portátil","Nuevo monitor","Nuevo teclado","Nueva diadema","Nuevo ratón","Nuevo docking"],
      assets: ["Portátil","Monitor","Teclado","Diadema","Ratón","Docking"],
      group: "Compras TI / Mesa de ayuda",
    },
    "Software y aplicaciones": {
      subcategories: ["Instalación de software","Licencia nueva","Alta en aplicación","Configuración de aplicación"],
      assets: ["Portátil","Desktop","ERP","CRM","Office","Aplicación corporativa"],
      group: "Aplicaciones / Mesa de ayuda",
    },
    "Accesos y permisos": {
      subcategories: ["Nuevo acceso","Permiso adicional","Alta de usuario","Cambio de rol"],
      assets: ["Usuario","Correo","Carpeta compartida","SharePoint","ERP","CRM","VPN","MFA"],
      group: "Mesa de ayuda / Aplicaciones",
    },
    "Correo y colaboración": {
      subcategories: ["Nuevo buzón compartido","Lista de distribución","Permiso de calendario","Espacio en SharePoint / Teams"],
      assets: ["Correo Exchange / Outlook","Teams","OneDrive","SharePoint","Buzón compartido","Calendario"],
      group: "Mesa de ayuda / Aplicaciones",
    },
    "Compras e insumos": {
      subcategories: ["Tóner / tinta","Papel","Reposición de periférico","Cotización"],
      assets: ["Impresora","Tóner","Papel","Periférico"],
      group: "Compras TI",
    },
    "Punto de venta (POS)": {
      subcategories: ["Alta de caja","Configuración de POS","Nueva impresora térmica","Nuevo lector de código","Nueva balanza"],
      assets: ["POS","Caja","Impresora térmica","Lector de código","Balanza"],
      group: "POS / retail / Soporte de campo / Compras TI",
    },
    "Pagos y datáfonos": {
      subcategories: ["Nuevo datáfono","Reposición de datáfono","Configuración de datáfono"],
      assets: ["Datáfono","POS","Pasarela / integración"],
      group: "POS / retail / Compras TI / Proveedor externo",
    },
    "Otro": {
      subcategories: ["Otro"],
      assets: ["Otro"],
      group: "Mesa de ayuda",
    },
  },
  ACCESS_PERMISSIONS: {
    "Accesos y permisos": {
      subcategories: ["Restablecer contraseña","Desbloqueo de cuenta","Alta de usuario","Baja de usuario","Permisos de carpeta","Permisos de correo","Permisos de sistema","MFA / autenticación"],
      assets: ["Usuario","Correo","Carpeta compartida","SharePoint","ERP","CRM","VPN","MFA"],
      group: "Mesa de ayuda / Aplicaciones / Infraestructura y redes",
    },
  },
  PURCHASE: {
    "Compras e insumos": {
      subcategories: ["Tóner / tinta","Papel","Cotización","Reposición de equipo"],
      assets: ["Tóner","Papel","Equipo","Periférico"],
      group: "Compras TI",
    },
    "Equipos de trabajo": {
      subcategories: ["Portátil","Monitor","Teclado","Ratón","Docking","Diadema"],
      assets: ["Portátil","Monitor","Teclado","Ratón","Docking","Diadema"],
      group: "Compras TI / Mesa de ayuda",
    },
    "Impresión": {
      subcategories: ["Impresora de oficina","Impresora térmica","Escáner","Tóner / cinta"],
      assets: ["Impresora de oficina","Impresora térmica","Escáner","Tóner"],
      group: "Compras TI / Proveedor externo",
    },
    "Punto de venta (POS)": {
      subcategories: ["Impresora térmica","Lector de código","Cajón monedero","Balanza","Tablet de tienda"],
      assets: ["Impresora térmica","Lector de código","Cajón monedero","Balanza","Tablet"],
      group: "Compras TI / POS / retail",
    },
    "Pagos y datáfonos": {
      subcategories: ["Datáfono","Reposición de datáfono"],
      assets: ["Datáfono"],
      group: "Compras TI / POS / retail / Proveedor externo",
    },
  },
  QUERY: {
    "Software y aplicaciones": {
      subcategories: ["Uso de aplicación","Duda funcional","Buenas prácticas","Configuración básica"],
      assets: ["ERP","CRM","Office","Aplicación corporativa","Portátil","Desktop"],
      group: "Mesa de ayuda / Aplicaciones",
    },
    "Accesos y permisos": {
      subcategories: ["Cómo solicitar acceso","Estado de acceso","Qué permiso necesito"],
      assets: ["Usuario","Correo","SharePoint","ERP","CRM","VPN"],
      group: "Mesa de ayuda / Aplicaciones",
    },
    "Correo y colaboración": {
      subcategories: ["Cómo usar Teams","Cómo compartir calendario","Uso de SharePoint / OneDrive"],
      assets: ["Teams","Calendario","SharePoint","OneDrive","Correo Exchange / Outlook"],
      group: "Mesa de ayuda / Aplicaciones",
    },
    "Punto de venta (POS)": {
      subcategories: ["Cómo reimprimir cierre","Uso de POS","Consulta operativa de caja"],
      assets: ["POS","Caja","Impresora térmica"],
      group: "POS / retail / Mesa de ayuda",
    },
    "Otro": {
      subcategories: ["Otro"],
      assets: ["Otro"],
      group: "Mesa de ayuda",
    },
  },
};
// PROBLEM y CHANGE no están en la matriz → usan las mismas categorías que INCIDENT
TICKET_MATRIX.PROBLEM = TICKET_MATRIX.INCIDENT;
TICKET_MATRIX.CHANGE  = TICKET_MATRIX.INCIDENT;

function categoriesFor(type: string)              { return Object.keys(TICKET_MATRIX[type] ?? {}); }
function subcategoriesFor(type: string, cat: string) { return TICKET_MATRIX[type]?.[cat]?.subcategories ?? []; }
function assetsFor(type: string, cat: string)     { return TICKET_MATRIX[type]?.[cat]?.assets ?? []; }
function suggestedGroup(type: string, cat: string){ return TICKET_MATRIX[type]?.[cat]?.group ?? ""; }

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
  { value: "WEB",      icon: "🌐", label: "Portal" },
  { value: "EMAIL",    icon: "📧", label: "Email" },
  { value: "WHATSAPP", icon: "💬", label: "WhatsApp" },
  { value: "PHONE",    icon: "📞", label: "Llamada" },
];

// ─── Utilidades UI ────────────────────────────────────────────────────────────

const inputCls  = "w-full bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";
const selectCls = inputCls;

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function F({ label, req, children }: { label: string; req?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">
        {label}{req && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function NewTicketPage() {
  const router = useRouter();
  const { data: me }         = trpc.tickets.me.useQuery();
  // categories de BD disponibles para futuro uso (filtros, validación)
  const { data: _categories } = trpc.settings.listCategories.useQuery();
  const { data: agents }     = trpc.tickets.listAgents.useQuery();

  const create = trpc.tickets.create.useMutation({
    onSuccess: (ticket) => router.push(`/tickets/${ticket.id}`),
  });

  const isUser = me?.role === "USER";

  if (!me) return <div className="text-slate-500 text-sm py-8 text-center">Cargando...</div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link href="/tickets" className="text-slate-500 hover:text-slate-300 text-sm">← Volver a tickets</Link>
        <h1 className="text-2xl font-bold text-white mt-3">Nuevo ticket</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {isUser ? "Cuéntanos qué necesitas — lo atenderemos a la brevedad." : "Clasificación técnica completa para el área de TI."}
        </p>
      </div>

      {isUser
        ? <UserForm create={create} />
        : <TIForm   create={create} agents={agents} />
      }
    </div>
  );
}

// ─── FORMULARIO USUARIO FINAL ─────────────────────────────────────────────────

function UserForm({ create }: { create: ReturnType<typeof trpc.tickets.create.useMutation> }) {
  const [f, setF] = useState({
    type:            "",
    where:           "",
    siteType:        "" as "OFFICE" | "POS" | "",
    whatNeeded:      "",
    affectedService: "",
    impactValue:     "",
    impactLabel:     "",
    sede:            "",
    title:           "",
    body:            "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  const canSubmit = f.type && f.where && f.whatNeeded && f.body.length >= 10 && !create.isPending;

  const handleSubmit = () => {
    const autoTitle = f.title.trim() || `${f.whatNeeded}${f.where ? ` — ${f.where}` : ""}`;
    create.mutate({
      title:              autoTitle,
      body:               f.body,
      type:               f.type as "INCIDENT"|"REQUEST"|"ACCESS_PERMISSIONS"|"PURCHASE"|"QUERY",
      priority:           f.impactValue === "CRITICAL" ? "URGENT" : f.impactValue === "HIGH" ? "HIGH" : f.impactValue === "MEDIUM" ? "MEDIUM" : "LOW",
      impact:             (f.impactValue || "LOW") as "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
      location:           f.where,
      siteType:           (f.siteType || undefined) as "OFFICE"|"POS"|undefined,
      whatNeeded:         f.whatNeeded,
      affectedService:    f.affectedService || undefined,
      requesterName:      undefined,
      channel:            "WEB",
      createdFromUserView: true,
    });
  };

  return (
    <div className="space-y-4">
      {/* Tipo */}
      <Section title="¿Qué tipo de solicitud es?">
        <div className="grid grid-cols-1 gap-2">
          {USER_TYPES.map((t) => (
            <button key={t.value} type="button"
              onClick={() => setF((p) => ({ ...p, type: t.value }))}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                f.type === t.value ? "border-blue-500 bg-blue-950" : "border-slate-700 bg-slate-800 hover:border-slate-600"
              }`}>
              <span className="text-lg">{t.label.split(" ")[0]}</span>
              <div>
                <span className="text-white text-sm font-medium">{t.label.slice(t.label.indexOf(" ")+1)}</span>
                <span className="text-slate-500 text-xs ml-2">{t.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </Section>

      {f.type && (
        <>
          {/* ¿Dónde? */}
          <Section title="¿Dónde ocurre?">
            <div className="grid grid-cols-2 gap-3">
              {WHERE_OPTIONS.map((w) => (
                <button key={w.value} type="button"
                  onClick={() => setF((p) => ({ ...p, where: w.value, siteType: w.siteType }))}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                    f.where === w.value ? "border-blue-500 bg-blue-950" : "border-slate-700 bg-slate-800 hover:border-slate-600"
                  }`}>
                  <span className="text-xl">{w.icon}</span>
                  <span className="text-white text-sm">{w.value}</span>
                </button>
              ))}
            </div>
          </Section>

          {f.where && (
            <>
              {/* ¿Qué necesitas? */}
              <Section title="¿Qué necesitas?" sub="Elige la opción que mejor describe tu problema.">
                <div className="grid grid-cols-2 gap-2">
                  {WHAT_NEEDED.map((w) => (
                    <button key={w} type="button"
                      onClick={() => setF((p) => ({ ...p, whatNeeded: w }))}
                      className={`px-3 py-2.5 rounded-xl border text-sm text-left transition-colors ${
                        f.whatNeeded === w ? "border-blue-500 bg-blue-950 text-white" : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600"
                      }`}>
                      {w}
                    </button>
                  ))}
                </div>
              </Section>

              {/* Equipo o servicio */}
              <Section title="Equipo o servicio afectado">
                <select value={f.affectedService} onChange={set("affectedService")} className={selectCls}>
                  <option value="">Seleccionar (opcional)...</option>
                  {AFFECTED_SERVICE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </Section>

              {/* Impacto */}
              <Section title="¿Cómo te afecta?">
                <div className="space-y-2">
                  {IMPACT_USER.map((i) => (
                    <button key={i.label} type="button"
                      onClick={() => setF((p) => ({ ...p, impactValue: i.value, impactLabel: i.label }))}
                      className={`w-full text-left px-4 py-2.5 rounded-xl border text-sm transition-colors ${
                        f.impactLabel === i.label ? "border-blue-500 bg-blue-950 text-white" : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600"
                      }`}>
                      {i.label}
                    </button>
                  ))}
                </div>
              </Section>

              {/* Sede */}
              <Section title="Sede, tienda o caja" sub="¿En qué lugar exactamente ocurre?">
                <input value={f.sede} onChange={set("sede")}
                  placeholder={f.siteType === "POS" ? "Ej: Juan Valdez CC Andino — Caja 2" : "Ej: Bogotá, Piso 3, Sala A"}
                  className={inputCls} />
              </Section>

              {/* Descripción */}
              <Section title="Descripción" sub="Cuéntanos con tus palabras qué pasó.">
                <F label="Resumen breve (opcional — si lo dejas vacío lo generamos automáticamente)">
                  <input value={f.title} onChange={set("title")} placeholder="Ej: No imprime la factura" className={inputCls} />
                </F>
                <F label="Descripción del problema" req>
                  <textarea value={f.body} onChange={set("body")} rows={4}
                    placeholder="¿Qué pasó? ¿Cuándo empezó? ¿Intentaste algo?..."
                    className={inputCls + " resize-none"} />
                </F>
              </Section>

              {create.error && (
                <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-xl px-4 py-3">{create.error.message}</p>
              )}

              <div className="flex gap-3 pb-8">
                <Link href="/tickets" className="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl text-sm">
                  Cancelar
                </Link>
                <button onClick={handleSubmit} disabled={!canSubmit}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl text-sm">
                  {create.isPending ? "Enviando..." : "Enviar solicitud"}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── FORMULARIO ÁREA DE TI ────────────────────────────────────────────────────

function TIForm({
  create,
  agents,
}: {
  create:  ReturnType<typeof trpc.tickets.create.useMutation>;
  agents:  { id: string; name: string }[] | undefined;
}) {
  const [f, setF] = useState({
    type:           "INCIDENT",
    location:       "",
    siteType:       "" as "OFFICE"|"POS"|"",
    techCategory:   "",
    subcategory:    "",
    affectedAsset:  "",
    assignedGroup:  "",
    priority:       "MEDIUM",
    impact:         "LOW",
    urgency:        "LOW",
    title:          "",
    body:           "",
    requesterName:    "",
    requesterContact: "",
    channel:        "WEB",
    assignedToId:   "",
    categoryId:     "",
    affectedSystem: "",
    appVersion:     "",
    diagnosis:      "",
  });

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  // Al cambiar tipo → limpiar categoría, subcategoría, activo y grupo
  const setType = (type: string) =>
    setF((p) => ({ ...p, type, techCategory: "", subcategory: "", affectedAsset: "", assignedGroup: "" }));

  // Al cambiar categoría → limpiar subcategoría y activo, y pre-rellenar grupo sugerido
  const setCategory = (cat: string) =>
    setF((p) => ({ ...p, techCategory: cat, subcategory: "", affectedAsset: "", assignedGroup: suggestedGroup(p.type, cat) }));

  const availableCategories   = categoriesFor(f.type);
  const availableSubcategories = subcategoriesFor(f.type, f.techCategory);
  const availableAssets       = assetsFor(f.type, f.techCategory);

  const canSubmit = f.title.length >= 5 && f.body.length >= 10 && !create.isPending;

  return (
    <div className="space-y-5">

      {/* Tipo */}
      <Section title="Tipo de ticket">
        <div className="grid grid-cols-2 gap-2">
          {TI_TYPES.map((t) => (
            <button key={t.value} type="button"
              onClick={() => setType(t.value)}
              className={`px-3 py-2.5 rounded-xl border text-sm text-left transition-colors ${
                f.type === t.value ? "border-blue-500 bg-blue-950 text-white" : "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600"
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Ubicación */}
      <Section title="Ubicación">
        <div className="grid grid-cols-4 gap-2">
          {LOCATION_OPTIONS.map((loc) => {
            const st = loc === "Punto de venta" ? "POS" : "OFFICE";
            return (
              <button key={loc} type="button"
                onClick={() => setF((p) => ({ ...p, location: loc, siteType: st as "OFFICE"|"POS" }))}
                className={`py-2.5 px-2 rounded-xl border text-xs text-center transition-colors ${
                  f.location === loc ? "border-blue-500 bg-blue-950 text-white" : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                }`}>
                {loc}
              </button>
            );
          })}
        </div>
      </Section>

      {/* Categoría técnica + subcategoría (dependientes del tipo) */}
      <Section title="Categoría técnica"
        sub={availableCategories.length === 0 ? "Elige un tipo de ticket primero" : undefined}>
        <div className="grid grid-cols-2 gap-4">
          <F label="Categoría">
            <select value={f.techCategory}
              onChange={(e) => setCategory(e.target.value)}
              className={selectCls}
              disabled={availableCategories.length === 0}>
              <option value="">
                {availableCategories.length === 0 ? "Primero elige el tipo" : "Seleccionar..."}
              </option>
              {availableCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </F>
          <F label="Subcategoría">
            <select value={f.subcategory} onChange={set("subcategory")} className={selectCls}
              disabled={availableSubcategories.length === 0}>
              <option value="">
                {availableSubcategories.length === 0 ? "Elige categoría primero" : "Seleccionar..."}
              </option>
              {availableSubcategories.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </F>
        </div>
        {/* Grupo sugerido auto-rellenado, editable */}
        {f.assignedGroup && (
          <p className="text-xs text-slate-500 mt-1">
            Grupo sugerido: <span className="text-slate-300">{f.assignedGroup}</span>
          </p>
        )}
      </Section>

      {/* Activo + Grupo asignado (activos filtrados según tipo + categoría) */}
      <Section title="Activo y asignación técnica">
        <div className="grid grid-cols-2 gap-4">
          <F label="Activo / CI afectado">
            <select value={f.affectedAsset} onChange={set("affectedAsset")} className={selectCls}
              disabled={availableAssets.length === 0}>
              <option value="">
                {availableAssets.length === 0 ? "Elige categoría primero" : "Seleccionar (opcional)..."}
              </option>
              {availableAssets.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </F>
          <F label="Grupo asignado">
            {/* Pre-rellenado automáticamente al elegir categoría; editable manualmente */}
            <select value={f.assignedGroup} onChange={set("assignedGroup")} className={selectCls}>
              <option value="">Sin asignar</option>
              {["Mesa de ayuda","Soporte de campo","Infraestructura y redes","Aplicaciones",
                "POS / retail","Seguridad electrónica","Compras TI","Proveedor externo",
              ].map((g) => <option key={g} value={g}>{g}</option>)}
              {/* Grupo compuesto sugerido (no está en la lista base) */}
              {f.assignedGroup && !["Mesa de ayuda","Soporte de campo","Infraestructura y redes",
                "Aplicaciones","POS / retail","Seguridad electrónica","Compras TI","Proveedor externo",
              ].includes(f.assignedGroup) && (
                <option value={f.assignedGroup}>{f.assignedGroup}</option>
              )}
            </select>
          </F>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <F label="Sistema / Aplicación afectada">
            <input value={f.affectedSystem} onChange={set("affectedSystem")} placeholder="Ej: SAP, Office 365..." className={inputCls} />
          </F>
          <F label="Versión / Release">
            <input value={f.appVersion} onChange={set("appVersion")} placeholder="Ej: v2.3, Windows 11..." className={inputCls} />
          </F>
        </div>
      </Section>

      {/* Descripción */}
      <Section title="Descripción del problema">
        <F label="Asunto / Título" req>
          <input value={f.title} onChange={set("title")} placeholder="Resumen breve del problema" className={inputCls} />
          <p className="text-slate-600 text-xs mt-1">{f.title.length} / mín. 5</p>
        </F>
        <F label="Descripción detallada" req>
          <textarea value={f.body} onChange={set("body")} rows={4}
            placeholder="¿Qué pasó? ¿Cuándo empezó? ¿Pasos para reproducir?..."
            className={inputCls + " resize-none"} />
        </F>
        <F label="Causa / Diagnóstico (si ya se identificó)">
          <input value={f.diagnosis} onChange={set("diagnosis")} placeholder="Ej: Driver desactualizado, cable suelto..." className={inputCls} />
        </F>
      </Section>

      {/* Solicitante */}
      <Section title="Solicitante">
        <div className="grid grid-cols-2 gap-4">
          <F label="Nombre del solicitante">
            {/* TODO: ContactAutocomplete → autofill correo/teléfono */}
            <input value={f.requesterName} onChange={set("requesterName")} placeholder="Ej: María González" className={inputCls} />
          </F>
          <F label="Correo o teléfono">
            <input value={f.requesterContact} onChange={set("requesterContact")} placeholder="maria@empresa.com / 3001234567" className={inputCls} />
          </F>
        </div>
      </Section>

      {/* Prioridad, impacto, urgencia */}
      <Section title="Prioridad, impacto y urgencia">
        <F label="Prioridad">
          <div className="grid grid-cols-4 gap-2">
            {PRIORITIES.map((p) => (
              <button key={p.value} type="button" onClick={() => setF((prev) => ({ ...prev, priority: p.value }))}
                className={`flex flex-col items-center gap-1 py-2.5 rounded-xl border text-center transition-colors ${
                  f.priority === p.value ? "border-blue-500 bg-blue-950 text-white" : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                }`}>
                <span className="text-sm font-semibold">{p.label}</span>
                <span className="text-xs text-slate-500">{p.desc}</span>
              </button>
            ))}
          </div>
        </F>
        <div className="grid grid-cols-2 gap-4">
          <F label="Impacto">
            <select value={f.impact} onChange={set("impact")} className={selectCls}>
              {IMPACTS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </F>
          <F label="Urgencia">
            <select value={f.urgency} onChange={set("urgency")} className={selectCls}>
              {IMPACTS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
          </F>
        </div>
      </Section>

      {/* Canal + Técnico asignado */}
      <Section title="Canal de entrada y asignación">
        <F label="Canal de entrada">
          <div className="grid grid-cols-4 gap-2">
            {CHANNELS.map((ch) => (
              <button key={ch.value} type="button" onClick={() => setF((p) => ({ ...p, channel: ch.value }))}
                className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  f.channel === ch.value ? "border-blue-500 bg-blue-950 text-white" : "border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-600"
                }`}>
                <span className="text-lg">{ch.icon}</span>{ch.label}
              </button>
            ))}
          </div>
        </F>
        <F label="Asignar a técnico (opcional)">
          <select value={f.assignedToId} onChange={set("assignedToId")} className={selectCls}>
            <option value="">Sin asignar</option>
            {agents?.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </F>
      </Section>

      {create.error && (
        <p className="text-red-400 text-sm bg-red-950 border border-red-800 rounded-xl px-4 py-3">{create.error.message}</p>
      )}

      <div className="flex gap-3 pb-8">
        <Link href="/tickets" className="flex-1 text-center bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-3 rounded-xl text-sm">
          Cancelar
        </Link>
        <button
          onClick={() => create.mutate({
            title:            f.title,
            body:             f.body,
            type:             f.type             as "INCIDENT"|"REQUEST"|"ACCESS_PERMISSIONS"|"PURCHASE"|"QUERY"|"PROBLEM"|"CHANGE",
            priority:         f.priority         as "LOW"|"MEDIUM"|"HIGH"|"URGENT",
            impact:           f.impact           as "LOW"|"MEDIUM"|"HIGH"|"CRITICAL",
            channel:          f.channel          as "WEB"|"EMAIL"|"WHATSAPP"|"PHONE",
            location:         f.location         || undefined,
            siteType:         (f.siteType        || undefined) as "OFFICE"|"POS"|undefined,
            techCategory:     f.techCategory     || undefined,
            subcategory:      f.subcategory      || undefined,
            affectedAsset:    f.affectedAsset    || undefined,
            assignedGroup:    f.assignedGroup    || undefined,
            urgency:          f.urgency          || undefined,
            diagnosis:        f.diagnosis        || undefined,
            affectedSystem:   f.affectedSystem   || undefined,
            appVersion:       f.appVersion       || undefined,
            requesterName:    f.requesterName    || undefined,
            requesterContact: f.requesterContact || undefined,
            assignedToId:     f.assignedToId     || undefined,
            categoryId:       f.categoryId       || undefined,
          })}
          disabled={!canSubmit}
          className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl text-sm">
          {create.isPending ? "Creando..." : "Crear ticket"}
        </button>
      </div>
    </div>
  );
}
