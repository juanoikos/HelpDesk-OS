import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";

function requireAdmin(role: string) {
  if (role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo los administradores pueden realizar esta acción" });
  }
}

export const cannedResponsesRouter = router({

  // Listar todas las respuestas del tenant (accesible para todos)
  list: protectedProcedure.query(async ({ ctx }) => {
    return prisma.cannedResponse.findMany({
      where:   { tenantId: ctx.session.user.tenantId },
      orderBy: { title: "asc" },
    });
  }),

  // Crear
  create: protectedProcedure
    .input(z.object({
      title: z.string().min(2, "Mínimo 2 caracteres").max(80),
      body:  z.string().min(5, "Mínimo 5 caracteres"),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      return prisma.cannedResponse.create({
        data: { tenantId: ctx.session.user.tenantId, ...input },
      });
    }),

  // Actualizar
  update: protectedProcedure
    .input(z.object({
      id:    z.string(),
      title: z.string().min(2).max(80).optional(),
      body:  z.string().min(5).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const { id, ...data } = input;
      return prisma.cannedResponse.update({
        where: { id, tenantId: ctx.session.user.tenantId },
        data,
      });
    }),

  // Eliminar
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      return prisma.cannedResponse.delete({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
      });
    }),
});
