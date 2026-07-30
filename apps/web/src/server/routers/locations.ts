import { z } from "zod";
import { router, adminProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";

// ─── Router de Sedes (Location) ─────────────────────────────────────────────────

export const locationsRouter = router({

  // ── Listar sedes del tenant, con conteo de DVRs y estado del tunnel ────────
  list: adminProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;

    const locations = await prisma.location.findMany({
      where:   { tenantId },
      orderBy: { name: "asc" },
      include: {
        dvrs: { select: { id: true, status: true } },
        agentTunnel: { select: { hostname: true, isActive: true, lastSeen: true } },
      },
    });

    return locations.map(loc => ({
      id:        loc.id,
      name:      loc.name,
      city:      loc.city,
      hasVpn:    loc.hasVpn,
      isActive:  loc.isActive,
      createdAt: loc.createdAt,
      dvrCount:  loc.dvrs.length,
      dvrsOnline:  loc.dvrs.filter(d => d.status === "ONLINE").length,
      dvrsOffline: loc.dvrs.filter(d => d.status === "OFFLINE").length,
      tunnel:    loc.agentTunnel
        ? { hostname: loc.agentTunnel.hostname, isActive: loc.agentTunnel.isActive, lastSeen: loc.agentTunnel.lastSeen }
        : null,
    }));
  }),

  // ── Crear sede ───────────────────────────────────────────────────────────────────
  create: adminProcedure
    .input(z.object({
      name:   z.string().min(1).max(100),
      city:   z.string().max(100).optional(),
      hasVpn: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      return prisma.location.create({
        data: {
          tenantId: ctx.session.user.tenantId,
          name:     input.name,
          city:     input.city,
          hasVpn:   input.hasVpn,
        },
      });
    }),

  // ── Editar sede ──────────────────────────────────────────────────────────────────
  update: adminProcedure
    .input(z.object({
      id:       z.string(),
      name:     z.string().min(1).max(100).optional(),
      city:     z.string().max(100).optional().nullable(),
      hasVpn:   z.boolean().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      const { id, ...data } = input;
      const existing = await prisma.location.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return prisma.location.update({ where: { id }, data });
    }),

  // ── Eliminar sede ─────────────────────────────────────────────────────────────
  // Los DVRs asignados quedan sin sede (locationId -> null), no se borran.
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      const existing = await prisma.location.findFirst({ where: { id: input.id, tenantId }, select: { id: true } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      await prisma.location.delete({ where: { id: input.id } });
      return { ok: true };
    }),
});
