import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";

// Forma del objeto que devuelve Claude
const configSchema = z.object({
  categories: z.array(
    z.object({
      name: z.string(),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    })
  ).min(2).max(10),
  channels: z.array(z.string()),
  summary: z.string(),
});

export type WizardConfig = z.infer<typeof configSchema>;

export const wizardRouter = router({
  // Paso 1: Claude analiza la descripción y devuelve una configuración sugerida
  analyze: protectedProcedure
    .input(
      z.object({
        description: z.string().min(20, "Describe tu empresa con al menos 20 caracteres"),
      })
    )
    .mutation(async ({ input }) => {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Falta configurar ANTHROPIC_API_KEY en .env.local",
        });
      }

      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const message = await anthropic.messages.create({
        model: "claude-opus-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Eres un asistente configurando un sistema de helpdesk de soporte TI. El usuario describió su empresa:

"${input.description}"

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
- summary: 1-2 oraciones en español explicando cómo se configuró el sistema`,
          },
        ],
      });

      const text =
        message.content[0].type === "text" ? message.content[0].text.trim() : "";

      try {
        // Limpia posible markdown si Claude lo incluyó de todos modos
        const clean = text.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "");
        const parsed = JSON.parse(clean);
        return configSchema.parse(parsed);
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "No se pudo procesar la respuesta de Claude. Intenta de nuevo.",
        });
      }
    }),

  // Paso 2: Guarda la configuración confirmada en la base de datos
  saveConfig: protectedProcedure
    .input(configSchema)
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;

      // Reemplaza las categorías existentes con las nuevas
      await prisma.category.deleteMany({ where: { tenantId } });

      await prisma.category.createMany({
        data: input.categories.map((cat) => ({
          tenantId,
          name: cat.name,
          color: cat.color,
        })),
      });

      // Guarda los canales activos
      for (const ch of input.channels) {
        const type =
          ch === "email"
            ? ("EMAIL" as const)
            : ch === "whatsapp"
              ? ("WHATSAPP_BAILEYS" as const)
              : null;
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
