import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";

function requireAdmin(role: string) {
  if (role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo los administradores pueden realizar esta acción" });
  }
}

const targetInput = z.object({
  name:        z.string().min(1).max(100),
  host:        z.string().min(1).max(255),
  checkType:   z.enum(["http", "https", "tcp", "ping"]),
  port:        z.number().int().min(1).max(65535).optional(),
  httpPath:    z.string().default("/"),
  interval:    z.number().int().min(10).max(3600).default(60),
  timeout:     z.number().int().min(1000).max(30000).default(5000),
  retries:     z.number().int().min(0).max(5).default(2),
  enabled:     z.boolean().default(true),
  networkType: z.enum(["lan", "wan"]).default("wan"),
  agentHost:   z.string().optional(),
});

export const monitoringRouter = router({

  // ── Listar targets con últimos 40 checks (para timeline) ───────────────────
  listTargets: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;

    const targets = await prisma.monitorTarget.findMany({
      where:   { tenantId },
      orderBy: [{ networkType: "asc" }, { name: "asc" }],
      include: {
        checks: {
          take:    40,
          orderBy: { checkedAt: "desc" },
          select:  { status: true, latency: true, checkedAt: true },
        },
      },
    });

    return targets.map((t) => {
      const checks = t.checks;
      const upCount = checks.filter((c) => c.status === "up").length;
      const uptime  = checks.length > 0 ? Math.round((upCount / checks.length) * 100) : null;
      return { ...t, uptime };
    });
  }),

  // ── Listar agentes LAN conocidos (máquinas que han enviado scans) ──────────
  listAgents: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;

    // Agentes de red (scanner) ya conocidos
    const networkAgents = await prisma.networkDevice.groupBy({
      by:    ["scannedFrom"],
      where: { tenantId },
      _max:  { lastSeenAt: true },
      orderBy: { _max: { lastSeenAt: "desc" } },
    });

    // Agentes de monitor LAN ya registrados
    const monitorAgents = await prisma.monitorCheck.groupBy({
      by:    ["checkedBy"],
      where: { tenantId, checkedBy: { not: "server" } },
      _max:  { checkedAt: true },
      orderBy: { _max: { checkedAt: "desc" } },
    });

    const known = new Set([
      ...networkAgents.map((a) => a.scannedFrom),
      ...monitorAgents.map((a) => a.checkedBy),
    ]);

    return Array.from(known);
  }),

  // ── Crear target ───────────────────────────────────────────────────────────
  createTarget: protectedProcedure
    .input(targetInput)
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      return prisma.monitorTarget.create({
        data: { ...input, tenantId: ctx.session.user.tenantId },
      });
    }),

  // ── Editar target ──────────────────────────────────────────────────────────
  updateTarget: protectedProcedure
    .input(z.object({ id: z.string() }).merge(targetInput.partial()))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const { id, ...data } = input;
      const existing = await prisma.monitorTarget.findFirst({
        where: { id, tenantId: ctx.session.user.tenantId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return prisma.monitorTarget.update({ where: { id }, data });
    }),

  // ── Activar / desactivar ───────────────────────────────────────────────────
  toggleTarget: protectedProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const existing = await prisma.monitorTarget.findFirst({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return prisma.monitorTarget.update({
        where: { id: input.id },
        data:  { enabled: input.enabled },
      });
    }),

  // ── Eliminar target + histórico ────────────────────────────────────────────
  deleteTarget: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const existing = await prisma.monitorTarget.findFirst({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
      });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return prisma.monitorTarget.delete({ where: { id: input.id } });
    }),

  // ── Historial de checks de un target ──────────────────────────────────────
  getChecks: protectedProcedure
    .input(z.object({ targetId: z.string(), limit: z.number().int().max(500).default(100) }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      const target = await prisma.monitorTarget.findFirst({
        where: { id: input.targetId, tenantId },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      return prisma.monitorCheck.findMany({
        where:   { targetId: input.targetId, tenantId },
        orderBy: { checkedAt: "desc" },
        take:    input.limit,
      });
    }),

  // ── Estadísticas de uptime: 1h, 24h, 7d ──────────────────────────────────
  getUptimeStats: protectedProcedure
    .input(z.object({ targetId: z.string() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      const target = await prisma.monitorTarget.findFirst({
        where: { id: input.targetId, tenantId },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      const now = Date.now();

      async function uptimeFor(ms: number) {
        const since = new Date(now - ms);
        const [total, up] = await Promise.all([
          prisma.monitorCheck.count({ where: { targetId: input.targetId, tenantId, checkedAt: { gte: since } } }),
          prisma.monitorCheck.count({ where: { targetId: input.targetId, tenantId, status: "up", checkedAt: { gte: since } } }),
        ]);
        return total > 0 ? Math.round((up / total) * 100 * 10) / 10 : null;
      }

      const [h1, h24, d7] = await Promise.all([
        uptimeFor(3_600_000),
        uptimeFor(86_400_000),
        uptimeFor(604_800_000),
      ]);

      return { h1, h24, d7 };
    }),

  // ── Disparar check WAN inmediato (desde UI) ───────────────────────────────
  triggerCheck: protectedProcedure
    .input(z.object({ targetId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      const target = await prisma.monitorTarget.findFirst({
        where: { id: input.targetId, tenantId },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      if (target.networkType !== "wan") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Solo se pueden disparar checks manuales en targets WAN" });
      }

      // Importa el worker y ejecuta un check puntual
      const { performAndSaveCheck } = await import("../../lib/wan-monitor");
      await performAndSaveCheck(target);

      const updated = await prisma.monitorTarget.findUnique({ where: { id: input.targetId } });
      return updated;
    }),
});
