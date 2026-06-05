import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";
import { isGo2rtcConfigured, streamName, unregisterStream } from "@/lib/go2rtc";

function requireAdmin(role: string) {
  if (role !== "ADMIN") throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores" });
}

export const vmsRouter = router({

  // ── Estado del módulo VMS ────────────────────────────────────────────────────
  status: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
    const tenantId = ctx.session.user.tenantId;

    const [dvrs, tunnel] = await Promise.all([
      prisma.dvr.findMany({
        where:  { tenantId },
        select: {
          id: true, name: true, status: true, channels: true,
          localIp: true, ip: true,
          serial: true, location: true, photoUrl: true,
          deviceModel: true, firmware: true, deviceType: true,
        },
      }),
      prisma.agentTunnel.findUnique({ where: { tenantId } }),
    ]);

    return {
      go2rtcConfigured: isGo2rtcConfigured(),
      tunnelActive:     !!(tunnel?.isActive && tunnel.tunnelUrl),
      tunnelUrl:        tunnel?.isActive ? tunnel.tunnelUrl : null,
      tunnelLastSeen:   tunnel?.lastSeen ?? null,
      dvrs,
    };
  }),

  // ── Detener un stream activo ─────────────────────────────────────────────────
  stopStream: protectedProcedure
    .input(z.object({ dvrId: z.string(), channel: z.number().int().min(1) }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const tenantId = ctx.session.user.tenantId;

      const dvr = await prisma.dvr.findFirst({ where: { id: input.dvrId, tenantId }, select: { id: true } });
      if (!dvr) throw new TRPCError({ code: "NOT_FOUND" });

      const tunnel = await prisma.agentTunnel.findUnique({ where: { tenantId } });
      const useTunnel = !!(tunnel?.isActive && tunnel.tunnelUrl);

      await unregisterStream(
        streamName(input.dvrId, input.channel),
        useTunnel ? tunnel!.tunnelUrl : undefined,
      );
      return { ok: true };
    }),

  // ── Info del tunnel del agente ───────────────────────────────────────────────
  getTunnel: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
    const tunnel = await prisma.agentTunnel.findUnique({
      where: { tenantId: ctx.session.user.tenantId },
    });
    return tunnel ?? null;
  }),
});
