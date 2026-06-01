import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "crypto";

function requireAdmin(role: string) {
  if (role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo los administradores pueden realizar esta acción",
    });
  }
}

export const assetsRouter = router({
  // ── List all assets for tenant ──────────────────────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    return prisma.asset.findMany({
      where:   { tenantId: ctx.session.user.tenantId },
      select: {
        id:           true,
        name:         true,
        type:         true,
        serialNumber: true,
        brand:        true,
        model:        true,
        status:       true,
        purchasedAt:  true,
        createdAt:    true,
        updatedAt:    true,
        hostname:     true,
        username:     true,
        ipAddress:    true,
        macAddress:   true,
        osName:       true,
        cpu:          true,
        ramGB:        true,
        diskInfo:     true,
        motherboard:  true,
        agentVersion: true,
        lastSeenAt:   true,
        _count:       { select: { tickets: true } },
      },
      orderBy: [
        { lastSeenAt: { sort: "desc", nulls: "last" } },
        { createdAt:  "desc" },
      ],
    });
  }),

  // ── Get single asset with full hardwareData ─────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const asset = await prisma.asset.findFirst({
        where:   { id: input.id, tenantId: ctx.session.user.tenantId },
        include: { _count: { select: { tickets: true } } },
      });
      if (!asset) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activo no encontrado" });
      }
      return asset;
    }),

  // ── Create asset manually ───────────────────────────────────────────────────
  create: protectedProcedure
    .input(z.object({
      name:         z.string().min(1, "El nombre es requerido").max(100),
      type:         z.enum(["LAPTOP", "DESKTOP", "MONITOR", "PHONE", "PRINTER", "SERVER", "NETWORK", "OTHER"]),
      serialNumber: z.string().max(100).optional(),
      brand:        z.string().max(80).optional(),
      model:        z.string().max(80).optional(),
      status:       z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE", "RETIRED"]).default("ACTIVE"),
    }))
    .mutation(async ({ input, ctx }) => {
      return prisma.asset.create({
        data: {
          tenantId: ctx.session.user.tenantId,
          ...input,
        },
      });
    }),

  // ── Update asset fields ─────────────────────────────────────────────────────
  update: protectedProcedure
    .input(z.object({
      id:           z.string(),
      name:         z.string().min(1).max(100).optional(),
      type:         z.enum(["LAPTOP", "DESKTOP", "MONITOR", "PHONE", "PRINTER", "SERVER", "NETWORK", "OTHER"]).optional(),
      serialNumber: z.string().max(100).optional().nullable(),
      brand:        z.string().max(80).optional().nullable(),
      model:        z.string().max(80).optional().nullable(),
      status:       z.enum(["ACTIVE", "INACTIVE", "MAINTENANCE", "RETIRED"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const existing = await prisma.asset.findFirst({
        where: { id, tenantId: ctx.session.user.tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activo no encontrado" });
      }
      return prisma.asset.update({ where: { id }, data });
    }),

  // ── Delete asset ────────────────────────────────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const existing = await prisma.asset.findFirst({
        where:   { id: input.id, tenantId: ctx.session.user.tenantId },
        include: { _count: { select: { tickets: true } } },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Activo no encontrado" });
      }
      if (existing._count.tickets > 0) {
        throw new TRPCError({
          code:    "BAD_REQUEST",
          message: `No puedes eliminar este activo — tiene ${existing._count.tickets} ticket(s) vinculado(s)`,
        });
      }
      return prisma.asset.delete({ where: { id: input.id } });
    }),

  // ── Generate / regenerate agent token (admin only) ──────────────────────────
  generateToken: protectedProcedure.mutation(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
    const tenantId = ctx.session.user.tenantId;
    const newToken = randomUUID();
    const settings = await prisma.tenantSettings.upsert({
      where:  { tenantId },
      create: { tenantId, agentToken: newToken },
      update: { agentToken: newToken },
    });
    return { agentToken: settings.agentToken };
  }),

  // ── Get current agent token (admin only) ────────────────────────────────────
  getToken: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
    const tenantId = ctx.session.user.tenantId;
    const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });
    return { agentToken: settings?.agentToken ?? null };
  }),
});
