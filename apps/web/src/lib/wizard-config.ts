// Este archivo es seguro para importar tanto en el servidor como en el cliente
// No tiene dependencias de tRPC ni de Node.js

export type WizardConfig = {
  categories: { name: string; color: string }[];
  channels: string[];
  summary: string;
};

export const TEMPLATES: Record<string, { label: string; icon: string; config: WizardConfig }> = {
  "soporte-ti": {
    label: "Soporte TI",
    icon: "🖥️",
    config: {
      categories: [
        { name: "Hardware", color: "#3b82f6" },
        { name: "Software", color: "#8b5cf6" },
        { name: "Redes", color: "#10b981" },
        { name: "Impresoras", color: "#f59e0b" },
        { name: "Usuarios y Accesos", color: "#ef4444" },
        { name: "Servidores", color: "#06b6d4" },
      ],
      channels: ["email"],
      summary: "Configuración estándar para empresas de soporte TI.",
    },
  },
  "ecommerce": {
    label: "E-commerce",
    icon: "🛒",
    config: {
      categories: [
        { name: "Pedidos", color: "#3b82f6" },
        { name: "Envíos y Logística", color: "#10b981" },
        { name: "Pagos y Facturación", color: "#f59e0b" },
        { name: "Devoluciones", color: "#ef4444" },
        { name: "Consultas Generales", color: "#8b5cf6" },
      ],
      channels: ["email", "whatsapp"],
      summary: "Configuración para tiendas en línea con soporte multicanal.",
    },
  },
  "salud": {
    label: "Salud / Clínica",
    icon: "🏥",
    config: {
      categories: [
        { name: "Citas y Agenda", color: "#10b981" },
        { name: "Facturación", color: "#f59e0b" },
        { name: "Urgencias", color: "#ef4444" },
        { name: "Consultas Médicas", color: "#3b82f6" },
        { name: "Medicamentos", color: "#8b5cf6" },
      ],
      channels: ["email", "whatsapp"],
      summary: "Configuración para clínicas y consultorios médicos.",
    },
  },
  "educacion": {
    label: "Educación",
    icon: "🎓",
    config: {
      categories: [
        { name: "Plataforma Virtual", color: "#3b82f6" },
        { name: "Matrículas", color: "#10b981" },
        { name: "Pagos y Becas", color: "#f59e0b" },
        { name: "Soporte Académico", color: "#8b5cf6" },
        { name: "Infraestructura TI", color: "#06b6d4" },
      ],
      channels: ["email"],
      summary: "Configuración para instituciones educativas.",
    },
  },
};
