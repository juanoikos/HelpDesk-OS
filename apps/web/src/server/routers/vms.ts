import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";
import { isGo2rtcConfigured, streamName, unregisterStream } from "@/lib/go2rtc";
import { ptzStart, ptzStop, gotoPreset, setPreset, getPresets,
         getEncodeConfig, rebootDevice, getStorageInfo } from "@helpdesk-os/dahua-sdk";
import type { PtzCode } from "@helpdesk-os/dahua-sdk";
import { decrypt } from "@/lib/dvr-crypto";

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


export const vmsRouter = router({

  // â”€â”€ Estado del mÃ³dulo VMS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  status: adminProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;

    const [dvrs, tunnel] = await Promise.all([
      prisma.dvr.findMany({
        where:  { tenantId },
        select: {
          id: true, name: true, status: true, channels: true,
          localIp: true, ip: true,
          serial: true, address: true, photoUrl: true,
          deviceModel: true, firmware: true, deviceType: true,
        },
      }),
      // findFirst, no findUnique: tenantId ya no es Ãºnico en AgentTunnel
      // (ahora un tenant puede tener varias sedes, cada una con su propio tÃºnel).
      // Mientras solo exista una sede por tenant, esto devuelve el mismo tunnel de siempre.
      prisma.agentTunnel.findFirst({ where: { tenantId } }),
    ]);

    return {
      go2rtcConfigured: isGo2rtcConfigured(),
      tunnelActive:     !!(tunnel?.isActive && tunnel.tunnelUrl),
      tunnelUrl:        tunnel?.isActive ? tunnel.tunnelUrl : null,
      tunnelLastSeen:   tunnel?.lastSeen ?? null,
      dvrs,
    };
  }),

  // â”€â”€ Detener un stream activo â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  stopStream: adminProcedure
    .input(z.object({ dvrId: z.string(), channel: z.number().int().min(1) }))
    .mutation(async ({ input, ctx }) => {
      
      const tenantId = ctx.session.user.tenantId;

      const dvr = await prisma.dvr.findFirst({ where: { id: input.dvrId, tenantId }, select: { id: true } });
      if (!dvr) throw new TRPCError({ code: "NOT_FOUND" });

      const tunnel = await prisma.agentTunnel.findFirst({ where: { tenantId } });
      const useTunnel = !!(tunnel?.isActive && tunnel.tunnelUrl);

      await unregisterStream(
        streamName(input.dvrId, input.channel),
        useTunnel ? tunnel!.tunnelUrl : undefined,
      );
      return { ok: true };
    }),

  // â”€â”€ PTZ â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ptzMove: adminProcedure
    .input(z.object({
      dvrId:   z.string(),
      channel: z.number().int().min(1).default(1),
      code:    z.string() as z.ZodType<PtzCode>,
      speed:   z.number().int().min(1).max(10).default(5),
    }))
    .mutation(async ({ input, ctx }) => {
      
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      try {
        await ptzStart({ ip, httpPort, username, password, channel: input.channel }, input.code, input.speed);
        return { ok: true };
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: String(err) });
      }
    }),

  ptzStop: adminProcedure
    .input(z.object({ dvrId: z.string(), channel: z.number().int().min(1).default(1) }))
    .mutation(async ({ input, ctx }) => {
      
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      try { await ptzStop({ ip, httpPort, username, password, channel: input.channel }); }
      catch { /* ignorar error de stop */ }
      return { ok: true };
    }),

  ptzGetPresets: adminProcedure
    .input(z.object({ dvrId: z.string(), channel: z.number().int().min(1).default(1) }))
    .query(async ({ input, ctx }) => {
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      try { return await getPresets({ ip, httpPort, username, password, channel: input.channel }); }
      catch { return []; }
    }),

  ptzGotoPreset: adminProcedure
    .input(z.object({ dvrId: z.string(), channel: z.number().int().min(1).default(1), presetId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      await gotoPreset({ ip, httpPort, username, password, channel: input.channel }, input.presetId);
      return { ok: true };
    }),

  ptzSetPreset: adminProcedure
    .input(z.object({ dvrId: z.string(), channel: z.number().int().min(1).default(1), presetId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      await setPreset({ ip, httpPort, username, password, channel: input.channel }, input.presetId);
      return { ok: true };
    }),

  // â”€â”€ Alarmas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  listAlarms: adminProcedure
    .input(z.object({
      limit:   z.number().int().min(1).max(200).default(50),
      dvrId:   z.string().optional(),
      code:    z.string().optional(),
      onlyNew: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }) => {
      return prisma.dvrAlarm.findMany({
        where: {
          tenantId:     ctx.session.user.tenantId,
          ...(input.dvrId   ? { dvrId:        input.dvrId }   : {}),
          ...(input.code    ? { code:          input.code }    : {}),
          ...(input.onlyNew ? { acknowledged:  false }         : {}),
        },
        orderBy: { createdAt: "desc" },
        take:    input.limit,
      });
    }),

  acknowledgeAlarm: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      
      await prisma.dvrAlarm.updateMany({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
        data:  { acknowledged: true },
      });
      return { ok: true };
    }),

  acknowledgeAll: adminProcedure
    .mutation(async ({ ctx }) => {
      const { count } = await prisma.dvrAlarm.updateMany({
        where: { tenantId: ctx.session.user.tenantId, acknowledged: false },
        data:  { acknowledged: true },
      });
      return { count };
    }),

  alarmStats: adminProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // Ãºltimas 24h

    const [total, unread, byCode] = await Promise.all([
      prisma.dvrAlarm.count({ where: { tenantId, createdAt: { gte: since } } }),
      prisma.dvrAlarm.count({ where: { tenantId, acknowledged: false } }),
      prisma.dvrAlarm.groupBy({
        by: ["code"],
        where: { tenantId, createdAt: { gte: since } },
        _count: { _all: true },
        orderBy: { _count: { code: "desc" } },
      }),
    ]);

    return { total24h: total, unread, byCode: byCode.map(b => ({ code: b.code, count: b._count._all })) };
  }),

  // â”€â”€ E-Map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  listEmaps: adminProcedure.query(async ({ ctx }) => {
    return prisma.eMap.findMany({
      where:   { tenantId: ctx.session.user.tenantId },
      include: { devices: true },
      orderBy: { order: "asc" },
    });
  }),

  createEmap: adminProcedure
    .input(z.object({ name: z.string().min(1).max(80), imageUrl: z.string().url(), order: z.number().int().default(0) }))
    .mutation(async ({ input, ctx }) => {
      
      return prisma.eMap.create({ data: { tenantId: ctx.session.user.tenantId, ...input } });
    }),

  deleteEmap: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      
      await prisma.eMap.deleteMany({ where: { id: input.id, tenantId: ctx.session.user.tenantId } });
      return { ok: true };
    }),

  upsertEmapDevice: adminProcedure
    .input(z.object({
      emapId:  z.string(),
      dvrId:   z.string(),
      channel: z.number().int().min(1),
      x:       z.number().min(0).max(1),
      y:       z.number().min(0).max(1),
      label:   z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      
      const emap = await prisma.eMap.findFirst({ where: { id: input.emapId, tenantId: ctx.session.user.tenantId } });
      if (!emap) throw new TRPCError({ code: "NOT_FOUND" });
      return prisma.eMapDevice.upsert({
        where:  { emapId_dvrId_channel: { emapId: input.emapId, dvrId: input.dvrId, channel: input.channel } },
        create: input,
        update: { x: input.x, y: input.y, label: input.label },
      });
    }),

  removeEmapDevice: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      
      // Verificar que el dispositivo pertenezca al tenant del usuario
      await prisma.eMapDevice.deleteMany({
        where: { id: input.id, emap: { tenantId: ctx.session.user.tenantId } },
      });
      return { ok: true };
    }),

  // â”€â”€ Config remota â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getDeviceConfig: adminProcedure
    .input(z.object({ dvrId: z.string(), channel: z.number().int().min(1).default(1) }))
    .query(async ({ input, ctx }) => {
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      const [encode, storage] = await Promise.allSettled([
        getEncodeConfig({ ip, port: httpPort, username, password }, input.channel),
        getStorageInfo({ ip, port: httpPort, username, password }),
      ]);
      return {
        encode:  encode.status  === "fulfilled" ? encode.value  : null,
        storage: storage.status === "fulfilled" ? storage.value : null,
      };
    }),

  rebootDevice: adminProcedure
    .input(z.object({ dvrId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      
      const { username, password, ip, httpPort } = await getDvrCreds(input.dvrId, ctx.session.user.tenantId);
      await rebootDevice({ ip, port: httpPort, username, password });
      return { ok: true };
    }),

  // â”€â”€ Info del tunnel del agente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getTunnel: adminProcedure.query(async ({ ctx }) => {
    const tunnel = await prisma.agentTunnel.findFirst({
      where: { tenantId: ctx.session.user.tenantId },
    });
    return tunnel ?? null;
  }),
});


