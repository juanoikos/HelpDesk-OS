import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";
import { isGo2rtcConfigured, streamName, unregisterStream } from "@/lib/go2rtc";
import { ptzStart, ptzStop, gotoPreset, setPreset, getPresets } from "@helpdesk-os/dahua-sdk";
import type { PtzCode } from "@helpdesk-os/dahua-sdk";
import crypto from "crypto";

const ENC_KEY = (process.env.AUTH_SECRET ?? "helpdesk-dvr-secret-key-32chars!").slice(0, 32);
function decrypt(text: string): string {
  const [ivHex, encHex] = text.split(":");
  const iv  = Buffer.from(ivHex,  "hex");
  const enc = Buffer.from(encHex, "hex");
  const d   = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENC_KEY), iv);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

async function getDvrCreds(dvrId: string, tenantId: string) {
  const [dvr, cred] = await Promise.all([
    prisma.dvr.findFirst({ where: { id: dvrId, tenantId } }),
    prisma.dvrCredential.findUnique({ where: { tenantId } }),
  ]);
  if (!dvr) throw new TRPCError({ code: "NOT_FOUND", message: "DVR no encontrado" });

  let username: string, password: string;
  if (dvr.username && dvr.password) { username = dvr.username; password = decrypt(dvr.password); }
  else if (cred) { username = cred.username; password = decrypt(cred.password); }
  else throw new TRPCError({ code: "BAD_REQUEST", message: "Configura las credenciales primero" });

  const ip       = dvr.localIp ?? dvr.ip;
  const httpPort = dvr.port ?? 80;
  return { dvr, username, password, ip, httpPort };
}

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

  // ── PTZ ──────────────────────────────────────────────────────────────────────
  ptzMove: protectedProcedure
    .input(z.object({
      dvrId:   z.string(),
      channel: z.number().int().min(1).default(1),
      code:    z.string() as z.ZodType<PtzCode>,
      speed:   z.number().int().min(1).max(10).default(5),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      try {
        await ptzStart({ ip, httpPort, username, password, channel: input.channel }, input.code, input.speed);
        return { ok: true };
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(err) });
      }
    }),

  ptzStop: protectedProcedure
    .input(z.object({ dvrId: z.string(), channel: z.number().int().min(1).default(1) }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      try { await ptzStop({ ip, httpPort, username, password, channel: input.channel }); }
      catch { /* ignorar error de stop */ }
      return { ok: true };
    }),

  ptzGetPresets: protectedProcedure
    .input(z.object({ dvrId: z.string(), channel: z.number().int().min(1).default(1) }))
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      try { return await getPresets({ ip, httpPort, username, password, channel: input.channel }); }
      catch { return []; }
    }),

  ptzGotoPreset: protectedProcedure
    .input(z.object({ dvrId: z.string(), channel: z.number().int().min(1).default(1), presetId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      await gotoPreset({ ip, httpPort, username, password, channel: input.channel }, input.presetId);
      return { ok: true };
    }),

  ptzSetPreset: protectedProcedure
    .input(z.object({ dvrId: z.string(), channel: z.number().int().min(1).default(1), presetId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      await setPreset({ ip, httpPort, username, password, channel: input.channel }, input.presetId);
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
