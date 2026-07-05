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

// ── Heurística compartida: elegir checkType/puerto según los puertos detectados
//    por el scanner de red para un NetworkDevice. Usada por importFromNetwork
//    (import masivo) y pingNetworkDevice (import puntual desde el botón de ping). ──
function buildTargetDataForDevice(d: { ip: string; hostname: string | null; vendor: string | null; openPorts: unknown }) {
  // El agente PS1 serializa un array de un solo puerto como número suelto (no [n]),
  // así que openPorts puede llegar como number[], un number, null o undefined.
  const raw   = d.openPorts;
  const ports = Array.isArray(raw)
    ? raw.filter((p): p is number => typeof p === "number")
    : typeof raw === "number" ? [raw] : [];

  let checkType: "http" | "https" | "tcp" | "ping" = "ping";
  let port: number | undefined;

  if (ports.includes(443) || ports.includes(8443)) {
    checkType = "https";
    port = ports.includes(443) ? 443 : 8443;
  } else if (ports.includes(80) || ports.includes(8080) || ports.includes(8000)) {
    checkType = "http";
    port = ports.includes(80) ? undefined : ports.includes(8080) ? 8080 : 8000;
  } else if (ports.length > 0) {
    checkType = "tcp";
    const priority = [22, 554, 37777, 34567, 23];
    const preferred = priority.find((p) => ports.includes(p));
    port = preferred ?? ports[0];
  }

  const name = d.hostname ?? d.vendor ?? `Dispositivo ${d.ip}`;

  return {
    name:     name.slice(0, 100),
    host:     d.ip,
    checkType,
    port:     port ?? null,
    httpPath: "/",
    interval: 60,
    timeout:  5000,
    retries:  2,
    enabled:  true,
  };
}

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

  // ── Importar dispositivos desde el scanner de red ─────────────────────────
  importFromNetwork: protectedProcedure.mutation(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
    const tenantId = ctx.session.user.tenantId;

    const devices = await prisma.networkDevice.findMany({
      where: { tenantId },
    });

    if (devices.length === 0) return { created: 0, skipped: 0 };

    // IPs ya monitoreadas → no duplicar
    const existing = await prisma.monitorTarget.findMany({
      where:  { tenantId },
      select: { host: true },
    });
    const existingHosts = new Set(existing.map((t) => t.host));

    let created = 0;
    let skipped = 0;

    for (const d of devices) {
      if (existingHosts.has(d.ip)) { skipped++; continue; }

      await prisma.monitorTarget.create({
        data: {
          tenantId,
          ...buildTargetDataForDevice(d),
          networkType: "lan",
          agentHost:   d.scannedFrom, // el agente que escaneó esa red lo monitoreará
        },
      });

      existingHosts.add(d.ip);
      created++;
    }

    return { created, skipped };
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

  // ── Ping en vivo desde el Scanner de Red ────────────────────────────────────
  // Asegura un MonitorTarget "lan" para el dispositivo y avisa si el agente LAN
  // de esa red ha reportado recientemente (si no, el ping nunca va a resolver).
  pingNetworkDevice: protectedProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;

      const device = await prisma.networkDevice.findFirst({
        where: { id: input.deviceId, tenantId },
      });
      if (!device) throw new TRPCError({ code: "NOT_FOUND", message: "Dispositivo no encontrado" });

      let target = await prisma.monitorTarget.findFirst({
        where: { tenantId, host: device.ip },
      });

      if (!target) {
        target = await prisma.monitorTarget.create({
          data: {
            tenantId,
            ...buildTargetDataForDevice(device),
            networkType: "lan",
            agentHost:   device.scannedFrom,
          },
        });
      }

      const recentCheck = await prisma.monitorCheck.findFirst({
        where: {
          tenantId,
          checkedBy: device.scannedFrom,
          checkedAt: { gte: new Date(Date.now() - 3 * 60_000) },
        },
      });

      return {
        targetId:         target.id,
        requestedAt:      new Date().toISOString(),
        agentSeenRecently: !!recentCheck,
        agentHost:         device.scannedFrom,
      };
    }),

  // ── Estado actual de un target (para polling desde el botón de ping) ───────
  getTargetStatus: protectedProcedure
    .input(z.object({ targetId: z.string() }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      const target = await prisma.monitorTarget.findFirst({
        where:  { id: input.targetId, tenantId },
        select: { status: true, lastChecked: true, lastLatency: true, lastError: true },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      return target;
    }),
});
