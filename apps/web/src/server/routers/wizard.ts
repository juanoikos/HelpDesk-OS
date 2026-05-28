import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";

// ─── Forma del objeto de configuración ───────────────────────────────────────

const configSchema = z.object({
  categories: z
    .array(z.object({ name: z.string(), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }))
    .min(2)
    .max(10),
  channels: z.array(z.string()),
  summary: z.string(),
});

export type WizardConfig = z.infer<typeof configSchema>;

// ─── Templates predefinidos (Opción B) ───────────────────────────────────────

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

// ─── Función de análisis con IA ───────────────────────────────────────────────

const AI_PROMPT = (description: string) => `Eres un asistente configurando un sistema de helpdesk de soporte TI. El usuario describió su empresa:

"${description}"

Genera una configuración inicial en JSON. Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin bloques markdown:
{
  "categories": [{"name": "Nombre", "color": "#hexcolor"}],
  "channels": ["email"],
  "summary": "Una oración explicando la configuración."
}

Reglas:
- Entre 4 y 8 categorías, específicas para el tipo de empresa descrito
- Colores hex variados y visualmente distintos: #3b82f6 #8b5cf6 #10b981 #f59e0b #ef4444 #06b6d4 #f97316 #ec4899
- channels: siempre incluye "email"; agrega "whatsapp" solo si lo mencionan explícitamente
- summary: 1-2 oraciones en español explicando cómo se configuró el sistema`;

async function analyzeWithClaude(description: string): Promise<WizardConfig> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const message = await anthropic.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 1024,
    messages: [{ role: "user", content: AI_PROMPT(description) }],
  });
  const text = message.content[0].type === "text" ? message.content[0].text.trim() : "";
  const clean = text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
  return configSchema.parse(JSON.parse(clean));
}

async function analyzeWithGemini(description: string): Promise<WizardConfig> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genai.getGenerativeModel({ model: "gemini-1.5-flash" });
  const result = await model.generateContent(AI_PROMPT(description));
  const text = result.response.text().trim();
  const clean = text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
  return configSchema.parse(JSON.parse(clean));
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const wizardRouter = router({
  // Devuelve qué proveedores de IA están disponibles
  availableProviders: protectedProcedure.query(() => ({
    claude: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
  })),

  // Análisis con IA (Claude o Gemini según el proveedor elegido)
  analyze: protectedProcedure
    .input(
      z.object({
        description: z.string().min(20, "Describe tu empresa con al menos 20 caracteres"),
        provider: z.enum(["claude", "gemini"]).default("claude"),
      })
    )
    .mutation(async ({ input }) => {
      try {
        if (input.provider === "gemini") {
          if (!process.env.GEMINI_API_KEY)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Falta GEMINI_API_KEY en .env.local" });
          return await analyzeWithGemini(input.description);
        } else {
          if (!process.env.ANTHROPIC_API_KEY)
            throw new TRPCError({ code: "BAD_REQUEST", message: "Falta ANTHROPIC_API_KEY en .env.local" });
          return await analyzeWithClaude(input.description);
        }
      } catch (err) {
        if (err instanceof TRPCError) throw err;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo procesar la respuesta de la IA. Intenta de nuevo.",
        });
      }
    }),

  // Guarda la configuración confirmada
  saveConfig: protectedProcedure
    .input(configSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      await prisma.category.deleteMany({ where: { tenantId } });
      await prisma.category.createMany({
        data: input.categories.map((cat) => ({ tenantId, name: cat.name, color: cat.color })),
      });
      for (const ch of input.channels) {
        const type =
          ch === "email" ? ("EMAIL" as const) :
          ch === "whatsapp" ? ("WHATSAPP_BAILEYS" as const) : null;
        if (!type) continue;
        await prisma.channel.upsert({
          where: { tenantId_type: { tenantId, type } },
          update: { isActive: true },
          create: { tenantId, type, config: {}, isActive: true },
        });
      }
      return { ok: true };
    }),
});
