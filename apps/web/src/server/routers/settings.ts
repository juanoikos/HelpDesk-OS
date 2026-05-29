import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido");

const categoryInput = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(50),
  color: colorSchema,
});

export const settingsRouter = router({
  // ── Categorías ─────────────────────────────────────────────────────────────
  listCategories: protectedProcedure.query(async ({ ctx }) => {
    return prisma.category.findMany({
      where: { tenantId: ctx.session.user.tenantId },
      orderBy: { createdAt: "asc" },
    });
  }),

  createCategory: protectedProcedure
    .input(categoryInput)
    .mutation(async ({ input, ctx }) => {
      return prisma.category.create({
        data: { tenantId: ctx.session.user.tenantId, ...input },
      });
    }),

  updateCategory: protectedProcedure
    .input(categoryInput.extend({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      return prisma.category.update({
        where: { id, tenantId: ctx.session.user.tenantId },
        data,
      });
    }),

  deleteCategory: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Evita borrar si hay tickets con esa categoría
      const tickets = await prisma.ticket.count({
        where: { categoryId: input.id, tenantId: ctx.session.user.tenantId },
      });
      if (tickets > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No puedes eliminar esta categoría — tiene ${tickets} ticket(s) asignado(s)`,
        });
      }
      return prisma.category.delete({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
      });
    }),

  // ── Canales ────────────────────────────────────────────────────────────────
  listChannels: protectedProcedure.query(async ({ ctx }) => {
    return prisma.channel.findMany({
      where: { tenantId: ctx.session.user.tenantId },
    });
  }),

  toggleChannel: protectedProcedure
    .input(
      z.object({
        type: z.enum(["EMAIL", "WHATSAPP_BAILEYS", "WHATSAPP_META", "PHONE"]),
        active: z.boolean(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      return prisma.channel.upsert({
        where: { tenantId_type: { tenantId, type: input.type } },
        update: { isActive: input.active },
        create: { tenantId, type: input.type, config: {}, isActive: input.active },
      });
    }),
});
