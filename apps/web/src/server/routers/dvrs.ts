import { z } from "zod";
import { router, adminProcedure, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";
import { fetchDeviceInfo, DahuaRPC2Client } from "@helpdesk-os/dahua-sdk";
import { encrypt, decrypt } from "@/lib/dvr-crypto";

// â”€â”€â”€ Router â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const dvrsRouter = router({

  // â”€â”€ Credencial global del tenant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getCredential: adminProcedure.query(async ({ ctx }) => {
    const cred = await prisma.dvrCredential.findUnique({
      where: { tenantId: ctx.session.user.tenantId },
    });
    return cred ? { username: cred.username, hasPassword: true } : null;
  }),

  saveCredential: adminProcedure
    .input(z.object({
      username: z.string().min(1).default("admin"),
      password: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      
      const tenantId = ctx.session.user.tenantId;
      return prisma.dvrCredential.upsert({
        where:  { tenantId },
        create: { tenantId, username: input.username, password: encrypt(input.password) },
        update: { username: input.username, password: encrypt(input.password) },
      });
    }),

  // ── Intervalo del chequeo activo de cámaras (channel-heartbeat.ts) ───────────
  getChannelCheckInterval: adminProcedure.query(async ({ ctx }) => {
    const settings = await prisma.tenantSettings.findUnique({
      where:  { tenantId: ctx.session.user.tenantId },
      select: { channelCheckIntervalMin: true },
    });
    return { minutes: settings?.channelCheckIntervalMin ?? 5 };
  }),

  setChannelCheckInterval: adminProcedure
    .input(z.object({ minutes: z.number().int().min(1).max(120) }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      await prisma.tenantSettings.upsert({
        where:  { tenantId },
        create: { tenantId, channelCheckIntervalMin: input.minutes },
        update: { channelCheckIntervalMin: input.minutes },
      });
      return { minutes: input.minutes };
    }),

  // â”€â”€ CRUD DVRs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  list: adminProcedure.query(async ({ ctx }) => {
    return prisma.dvr.findMany({
      where:   { tenantId: ctx.session.user.tenantId },
      orderBy: [{ address: "asc" }, { name: "asc" }],
      take:    500,
      // Excluir contraseñas cifradas — nunca se muestran en la UI
      select: {
        id: true, tenantId: true, name: true, serial: true,
        ip: true, localIp: true, localPort: true, port: true,
        channels: true, address: true, notes: true, photoUrl: true,
        deviceModel: true, firmware: true, deviceType: true,
        channelNames: true, lastInfoFetch: true,
        status: true, lastChecked: true,
        createdAt: true, updatedAt: true,
        // username/password deliberadamente excluidos
        cameras: {
          select: { channelNumber: true, isConnected: true, lastEventAt: true, lastCheckedAt: true },
          orderBy: { channelNumber: "asc" },
        },
        location: { select: { id: true, name: true } },
      },
    });
  }),

  create: adminProcedure
    .input(z.object({
      name:      z.string().min(1).max(100),
      serial:    z.string().optional(),
      ip:        z.string().min(1),
      localIp:   z.string().optional(),
      localPort: z.number().int().default(37777),
      port:      z.number().int().default(80),
      channels:  z.number().int().refine(v => [4, 8, 16, 32].includes(v)).default(8),
      username:  z.string().optional(),
      password:  z.string().optional(),
      address:   z.string().max(100).optional(),
      locationId: z.string().optional(),
      notes:     z.string().max(300).optional(),
      photoUrl:  z.string().url().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      
      const { password, ...rest } = input;
      return prisma.dvr.create({
        data: {
          tenantId: ctx.session.user.tenantId,
          ...rest,
          password: password ? encrypt(password) : undefined,
        },
      });
    }),

  update: adminProcedure
    .input(z.object({
      id:        z.string(),
      name:      z.string().min(1).max(100).optional(),
      serial:    z.string().optional().nullable(),
      ip:        z.string().min(1).optional(),
      localIp:   z.string().optional().nullable(),
      localPort: z.number().int().optional(),
      port:      z.number().int().optional(),
      channels:  z.number().int().optional(),
      username:  z.string().optional().nullable(),
      password:  z.string().optional().nullable(),
      address:   z.string().max(100).optional().nullable(),
      locationId: z.string().optional().nullable(),
      notes:     z.string().max(300).optional().nullable(),
      photoUrl:  z.string().url().optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      
      const tenantId = ctx.session.user.tenantId;
      const { id, password, ...data } = input;
      // Verificar pertenencia antes de actualizar (evita el cast peligroso)
      const existing = await prisma.dvr.findFirst({ where: { id, tenantId }, select: { id: true } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return prisma.dvr.update({
        where: { id },
        data: {
          ...data,
          ...(password !== undefined
            ? { password: password ? encrypt(password) : null }
            : {}),
        },
      });
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      
      const tenantId = ctx.session.user.tenantId;
      // Verificar pertenencia antes de eliminar
      const existing = await prisma.dvr.findFirst({ where: { id: input.id, tenantId }, select: { id: true } });
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      return prisma.dvr.delete({ where: { id: input.id } });
    }),

  // â”€â”€ Dispositivos de red candidatos a DVR (para importar desde scan) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  networkCandidates: adminProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;

    const [devices, existingDvrs] = await Promise.all([
      prisma.networkDevice.findMany({
        where: {
          tenantId,
          deviceType: { in: ["dvr_nvr", "ip_camera", "unknown", "web_device"] },
        },
        orderBy: { ip: "asc" },
      }),
      prisma.dvr.findMany({ where: { tenantId }, select: { ip: true } }),
    ]);

    const existingIPs = new Set(existingDvrs.map(d => d.ip));

    return devices.map(d => ({
      id:         d.id,
      ip:         d.ip,
      hostname:   d.hostname,
      vendor:     d.vendor,
      deviceType: d.deviceType,
      openPorts:  d.openPorts as number[] | null,
      lastSeenAt: d.lastSeenAt,
      alreadyAdded: existingIPs.has(d.ip),
    }));
  }),

  // â”€â”€ Importaciâ€Ã³n masiva por CSV/JSON â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  bulkImport: adminProcedure
    .input(z.array(z.object({
      name:     z.string().min(1),
      ip:       z.string().min(1),
      port:     z.number().int().default(80),
      channels: z.number().int().default(8),
      address:  z.string().optional(),
    })).max(500))  // límite para evitar payloads que bloqueen el servidor
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;

      // Obtener IPs existentes en una sola query (en vez de N queries en loop)
      const existingIps = new Set(
        (await prisma.dvr.findMany({ where: { tenantId }, select: { ip: true } })).map(d => d.ip)
      );

      const toCreate = input.filter(row => !existingIps.has(row.ip));
      const skipped  = input.length - toCreate.length;

      if (toCreate.length > 0) {
        await prisma.dvr.createMany({
          data:          toCreate.map(row => ({ tenantId, ...row })),
          skipDuplicates: true,
        });
      }

      return { created: toCreate.length, skipped };
    }),

  // â”€â”€ Verificar conectividad de un DVR (auto-detecta puerto) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  checkStatus: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      
      const dvr = await prisma.dvr.findFirst({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
      });
      if (!dvr) throw new TRPCError({ code: "NOT_FOUND" });

      const { port: foundPort } = await probePort(dvr.ip, dvr.port);
      const status = foundPort ? "ONLINE" : "OFFLINE";

      await prisma.dvr.update({
        where: { id: dvr.id },
        data:  {
          status:      status as "ONLINE" | "OFFLINE",
          lastChecked: new Date(),
          ...(foundPort && foundPort !== dvr.port ? { port: foundPort } : {}),
        },
      });
      return { status, port: foundPort ?? dvr.port };
    }),

  // â”€â”€ Verificar todos los DVRs del tenant (auto-detecta puertos) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  checkAll: adminProcedure.mutation(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    const dvrs     = await prisma.dvr.findMany({ where: { tenantId } });

    const results = await Promise.all(dvrs.map(async (dvr) => {
      const { port: foundPort } = await probePort(dvr.ip, dvr.port);
      const status = (foundPort ? "ONLINE" : "OFFLINE") as "ONLINE" | "OFFLINE";
      await prisma.dvr.update({
        where: { id: dvr.id },
        data:  {
          status,
          lastChecked: new Date(),
          ...(foundPort && foundPort !== dvr.port ? { port: foundPort } : {}),
        },
      });
      return { id: dvr.id, status, port: foundPort ?? dvr.port };
    }));

    const online  = results.filter(r => r.status === "ONLINE").length;
    const offline = results.filter(r => r.status === "OFFLINE").length;
    return { total: dvrs.length, online, offline };
  }),

  // â”€â”€ Buscar grabaciones en un DVR (Dahua HTTP API) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // channels: array de canales (vacâ€Ío = todos)
  findRecordings: adminProcedure
    .input(z.object({
      dvrId:     z.string(),
      channels:  z.array(z.number().int().min(1)), // [] = todos
      date:      z.string(),       // "YYYY-MM-DD"
      startTime: z.string().default("00:00"), // "HH:MM"
      endTime:   z.string().default("23:59"), // "HH:MM"
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;

      const [dvr, cred] = await Promise.all([
        prisma.dvr.findFirst({ where: { id: input.dvrId, tenantId } }),
        prisma.dvrCredential.findUnique({ where: { tenantId } }),
      ]);
      if (!dvr) throw new TRPCError({ code: "NOT_FOUND", message: "DVR no encontrado" });

      // Credencial: usa la propia del DVR si tiene, si no la global
      let username: string;
      let password: string;
      if (dvr.username && dvr.password) {
        username = dvr.username;
        password = decrypt(dvr.password);
      } else if (cred) {
        username = cred.username;
        password = decrypt(cred.password);
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Configura las credenciales primero" });
      }

      const base        = `http://${dvr.ip}:${dvr.port}`;
      const start       = `${input.date} ${input.startTime}:00`;
      const end         = `${input.date} ${input.endTime}:59`;
      const authHeader  = buildDigestAuth(username, password);

      // Canales a consultar: array vacâ€Ío = todos
      const channels = input.channels.length === 0
        ? Array.from({ length: dvr.channels }, (_, i) => i + 1)
        : input.channels;

      async function fetchChannel(ch: number) {
        const url = `${base}/cgi-bin/mediaFileFind.cgi?action=findFile&object=0&condition.Channel=${ch}&condition.StartTime=${encodeURIComponent(start)}&condition.EndTime=${encodeURIComponent(end)}&condition.Flags[0]=General`;
        try {
          const ctrl = new AbortController();
          const t    = setTimeout(() => ctrl.abort(), 8000);
          const res  = await fetch(url, { signal: ctrl.signal, headers: { Authorization: authHeader } });
          clearTimeout(t);
          if (!res.ok) return [];
          const text = await res.text();
          return parseDahuaFileFind(text, base, ch);
        } catch {
          return [];
        }
      }

      // Consultar todos los canales en paralelo
      let allRecordings: { channel: number; start: string; end: string; size: number; filePath: string }[] = [];
      try {
        const results = await Promise.all(channels.map(ch => fetchChannel(ch)));
        allRecordings = results.flatMap((recs, i) =>
          recs.map(r => ({ channel: channels[i]!, ...r }))
        );
      } catch (e) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `No se pudo conectar al DVR: ${String(e)}` });
      }

      return {
        recordings: allRecordings,
        localIp:    dvr.localIp ?? dvr.ip ?? null,
        port:       dvr.port,
      };
    }),

  // â”€â”€ Obtener info del dispositivo via SDK (modelo, firmware, canales) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  fetchDeviceInfo: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      
      const tenantId = ctx.session.user.tenantId;

      const [dvr, cred] = await Promise.all([
        prisma.dvr.findFirst({ where: { id: input.id, tenantId } }),
        prisma.dvrCredential.findUnique({ where: { tenantId } }),
      ]);
      if (!dvr) throw new TRPCError({ code: "NOT_FOUND" });

      let username: string;
      let password: string;
      if (dvr.username && dvr.password) {
        username = dvr.username;
        password = decrypt(dvr.password);
      } else if (cred) {
        username = cred.username;
        password = decrypt(cred.password);
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Configura las credenciales primero" });
      }

      const ip   = dvr.localIp ?? dvr.ip;
      const port = dvr.port ?? 80;

      let info: Awaited<ReturnType<typeof fetchDeviceInfo>>;
      try {
        info = await fetchDeviceInfo({ ip, port, username, password, timeoutMs: 8000 });
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `No se pudo conectar: ${String(err)}` });
      }

      const sys  = info.systemInfo;
      const prod = info.productDef;

      await prisma.dvr.update({
        where: { id: dvr.id },
        data: {
          deviceModel:   sys?.hardwareVersion ?? prod?.deviceType ?? null,
          firmware:      sys?.softwareVersion ?? null,
          deviceType:    sys?.deviceType      ?? prod?.deviceType ?? null,
          channelNames:  info.channelTitles.length > 0 ? JSON.parse(JSON.stringify(info.channelTitles)) : undefined,
          lastInfoFetch: new Date(),
          ...(prod?.maxCamera && prod.maxCamera > 0 ? { channels: prod.maxCamera } : {}),
          status:        "ONLINE",
          lastChecked:   new Date(),
        },
      });

      return {
        deviceModel:   sys?.hardwareVersion ?? prod?.deviceType ?? null,
        firmware:      sys?.softwareVersion ?? null,
        deviceType:    sys?.deviceType      ?? null,
        serialNumber:  sys?.serialNumber    ?? dvr.serial ?? null,
        channels:      prod?.maxCamera      ?? dvr.channels,
        channelTitles: info.channelTitles,
      };
    }),

  // â”€â”€ Snapshot en vivo de un canal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getSnapshotUrl: adminProcedure
    .input(z.object({ id: z.string(), channel: z.number().int().min(1).default(1) }))
    .mutation(async ({ input, ctx }) => {
      
      const tenantId = ctx.session.user.tenantId;

      const [dvr, cred] = await Promise.all([
        prisma.dvr.findFirst({ where: { id: input.id, tenantId } }),
        prisma.dvrCredential.findUnique({ where: { tenantId } }),
      ]);
      if (!dvr) throw new TRPCError({ code: "NOT_FOUND" });

      let username: string;
      let password: string;
      if (dvr.username && dvr.password) {
        username = dvr.username;
        password = decrypt(dvr.password);
      } else if (cred) {
        username = cred.username;
        password = decrypt(cred.password);
      } else {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Configura las credenciales primero" });
      }

      const ip   = dvr.localIp ?? dvr.ip;
      const port = dvr.port ?? 80;

      try {
        const client = new DahuaRPC2Client({ ip, port, username, password, timeoutMs: 6000 });
        const buffer = await client.getSnapshot(input.channel);
        const b64    = buffer.toString("base64");
        return { dataUrl: `data:image/jpeg;base64,${b64}` };
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Snapshot fallido: ${String(err)}` });
      }
    }),

  // â”€â”€ Crear job de scan local â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  createScanJob: adminProcedure
    .input(z.object({
      dvrId:     z.string(),
      channels:  z.array(z.number().int().min(1)),
      date:      z.string(),
      startTime: z.string().default("00:00"),
      endTime:   z.string().default("23:59"),
    }))
    .mutation(async ({ input, ctx }) => {
      
      const tenantId = ctx.session.user.tenantId;

      const dvr = await prisma.dvr.findFirst({ where: { id: input.dvrId, tenantId } });
      if (!dvr) throw new TRPCError({ code: "NOT_FOUND", message: "DVR no encontrado" });
      if (!dvr.localIp && !dvr.ip) throw new TRPCError({ code: "BAD_REQUEST", message: "El DVR no tiene IP local configurada" });

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      const job = await prisma.dvrScanJob.create({
        data: {
          tenantId,
          dvrId:     input.dvrId,
          channels:  input.channels,
          date:      input.date,
          startTime: input.startTime,
          endTime:   input.endTime,
          expiresAt,
        },
      });

      return { jobId: job.id };
    }),

  // â”€â”€ Consultar resultado de un job â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  getScanJob: protectedProcedure
    .input(z.object({ jobId: z.string() }))
    .query(async ({ input, ctx }) => {
      const job = await prisma.dvrScanJob.findFirst({
        where: { id: input.jobId, tenantId: ctx.session.user.tenantId },
      });
      if (!job) throw new TRPCError({ code: "NOT_FOUND" });
      return {
        status:  job.status,
        results: job.results as { channel: number; start: string; end: string; size: number; filePath: string }[] | null,
        error:   job.error,
      };
    }),
});

// â”€â”€â”€ Auto-detecciâ€Ã³n de puerto â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Puertos HTTP que usan los DVRs/NVRs Dahua e Hikvision, en orden de preferencia
const DVR_PORTS = [80, 8080, 8000, 443, 8443, 9000, 81, 82];

async function probePort(ip: string, currentPort: number): Promise<{ port: number | null }> {
  // Primero prueba el puerto actual (mâ€¡s râ€¡pido si ya funcionaba)
  const portsToTry = [currentPort, ...DVR_PORTS.filter(p => p !== currentPort)];

  for (const port of portsToTry) {
    try {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), 3000);
      const res  = await fetch(`http://${ip}:${port}/`, {
        signal: ctrl.signal,
        method: "HEAD",
      });
      clearTimeout(t);
      if (res.status < 600) return { port };
    } catch {
      // puerto no responde, probar el siguiente
    }
  }
  return { port: null };
}

// â”€â”€â”€ Helpers Dahua â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildDigestAuth(username: string, password: string): string {
  // Basic auth como primer intento (Dahua acepta ambos)
  const b64 = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${b64}`;
}

function parseDahuaFileFind(text: string, baseUrl: string, channel: number) {
  const recordings: { start: string; end: string; size: number; filePath: string }[] = [];
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  const found = parseInt(lines.find(l => l.startsWith("found="))?.split("=")[1] ?? "0");
  if (!found) return recordings;

  for (let i = 0; i < found; i++) {
    const get = (key: string) =>
      lines.find(l => l.startsWith(`items[${i}].${key}=`))?.split("=").slice(1).join("=") ?? "";

    const filePath = get("FilePath");
    const start    = get("StartTime").replace(/\//g, "-");
    const end      = get("EndTime").replace(/\//g, "-");
    const size     = parseInt(get("Length") ?? "0");

    if (filePath) recordings.push({ start, end, size, filePath });
  }
  return recordings;
}


