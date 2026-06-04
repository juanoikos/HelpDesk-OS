import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";

function requireAdmin(role: string) {
  if (role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Solo los administradores pueden realizar esta acción",
    });
  }
}

export const networkDevicesRouter = router({
  // ── Listar scans únicos (por scanId) para el selector de sede ─────────────
  listScans: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;

    const scans = await prisma.networkDevice.groupBy({
      by: ["scanId", "scannedFrom", "subnet"],
      where: { tenantId },
      _count: { id: true },
      _max:   { lastSeenAt: true },
      orderBy: { _max: { lastSeenAt: "desc" } },
    });

    return scans.map((s) => ({
      scanId:      s.scanId,
      scannedFrom: s.scannedFrom,
      subnet:      s.subnet,
      deviceCount: s._count.id,
      lastSeenAt:  s._max.lastSeenAt,
    }));
  }),

  // ── Listar todos los dispositivos del tenant (con cruce a Activos) ──────────
  list: protectedProcedure
    .input(z.object({ scanId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const tenantId = ctx.session.user.tenantId;

    const [devices, assets] = await Promise.all([
      prisma.networkDevice.findMany({
        where:   { tenantId, ...(input?.scanId ? { scanId: input.scanId } : {}) },
        orderBy: [{ deviceType: "asc" }, { ip: "asc" }],
      }),
      prisma.asset.findMany({
        where:  { tenantId, hostname: { not: null } },
        select: {
          id:        true,
          hostname:  true,
          username:  true,
          cpu:       true,
          ramGB:     true,
          diskInfo:  true,
          osName:    true,
          type:      true,
          status:    true,
          assetNumber: true,
        },
      }),
    ]);

    // Índice de activos por hostname (case-insensitive)
    const assetByHostname = new Map(
      assets.map((a) => [a.hostname!.toLowerCase(), a])
    );

    return devices.map((d) => ({
      ...d,
      asset: d.hostname ? (assetByHostname.get(d.hostname.toLowerCase()) ?? null) : null,
    }));
  }),

  // ── Información del último scan ────────────────────────────────────────────
  getLastScan: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;

    // Buscar el dispositivo más recientemente visto (que pertenece al último scan)
    const latest = await prisma.networkDevice.findFirst({
      where:   { tenantId },
      orderBy: { lastSeenAt: "desc" },
      select: {
        scanId:      true,
        scannedFrom: true,
        subnet:      true,
        lastSeenAt:  true,
      },
    });

    if (!latest) return null;

    // Contar cuántos dispositivos tienen ese scanId
    const count = await prisma.networkDevice.count({
      where: { tenantId, scanId: latest.scanId },
    });

    return {
      scanId:      latest.scanId,
      scannedFrom: latest.scannedFrom,
      subnet:      latest.subnet,
      lastSeenAt:  latest.lastSeenAt,
      deviceCount: count,
    };
  }),

  // ── Eliminar un dispositivo (solo admins) ──────────────────────────────────
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const existing = await prisma.networkDevice.findFirst({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Dispositivo no encontrado" });
      }
      return prisma.networkDevice.delete({ where: { id: input.id } });
    }),

  // ── Eliminar todos los dispositivos del tenant (solo admins) ───────────────
  clearAll: protectedProcedure.mutation(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
    const tenantId = ctx.session.user.tenantId;
    const result = await prisma.networkDevice.deleteMany({ where: { tenantId } });
    return { deleted: result.count };
  }),
});
