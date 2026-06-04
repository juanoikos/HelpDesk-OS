import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";
import crypto from "crypto";

// ─── Cifrado simple AES-256 para contraseñas DVR ────────────────────────────
const ENC_KEY = (process.env.AUTH_SECRET ?? "helpdesk-dvr-secret-key-32chars!").slice(0, 32);
const IV_LEN  = 16;

function encrypt(text: string): string {
  const iv  = crypto.randomBytes(IV_LEN);
  const c   = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENC_KEY), iv);
  const enc = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

function decrypt(text: string): string {
  const [ivHex, encHex] = text.split(":");
  const iv  = Buffer.from(ivHex,  "hex");
  const enc = Buffer.from(encHex, "hex");
  const d   = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENC_KEY), iv);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

function requireAdmin(role: string) {
  if (role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores" });
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

export const dvrsRouter = router({

  // ── Credencial global del tenant ────────────────────────────────────────────
  getCredential: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
    const cred = await prisma.dvrCredential.findUnique({
      where: { tenantId: ctx.session.user.tenantId },
    });
    return cred ? { username: cred.username, hasPassword: true } : null;
  }),

  saveCredential: protectedProcedure
    .input(z.object({
      username: z.string().min(1).default("admin"),
      password: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const tenantId = ctx.session.user.tenantId;
      return prisma.dvrCredential.upsert({
        where:  { tenantId },
        create: { tenantId, username: input.username, password: encrypt(input.password) },
        update: { username: input.username, password: encrypt(input.password) },
      });
    }),

  // ── CRUD DVRs ───────────────────────────────────────────────────────────────
  list: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
    return prisma.dvr.findMany({
      where:   { tenantId: ctx.session.user.tenantId },
      orderBy: [{ location: "asc" }, { name: "asc" }],
    });
  }),

  create: protectedProcedure
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
      location:  z.string().max(100).optional(),
      notes:     z.string().max(300).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const { password, ...rest } = input;
      return prisma.dvr.create({
        data: {
          tenantId: ctx.session.user.tenantId,
          ...rest,
          password: password ? encrypt(password) : undefined,
        },
      });
    }),

  update: protectedProcedure
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
      location:  z.string().max(100).optional().nullable(),
      notes:     z.string().max(300).optional().nullable(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const { id, password, ...data } = input;
      return prisma.dvr.update({
        where: { id, tenantId: ctx.session.user.tenantId } as { id: string },
        data: {
          ...data,
          ...(password !== undefined
            ? { password: password ? encrypt(password) : null }
            : {}),
        },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      return prisma.dvr.delete({
        where: { id: input.id, tenantId: ctx.session.user.tenantId } as { id: string },
      });
    }),

  // ── Dispositivos de red candidatos a DVR (para importar desde scan) ─────────
  networkCandidates: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
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

  // ── Importación masiva por CSV/JSON ─────────────────────────────────────────
  bulkImport: protectedProcedure
    .input(z.array(z.object({
      name:     z.string().min(1),
      ip:       z.string().min(1),
      port:     z.number().int().default(80),
      channels: z.number().int().default(8),
      location: z.string().optional(),
    })))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const tenantId = ctx.session.user.tenantId;
      let created = 0;
      let skipped = 0;
      for (const row of input) {
        const exists = await prisma.dvr.findFirst({ where: { tenantId, ip: row.ip } });
        if (exists) { skipped++; continue; }
        await prisma.dvr.create({ data: { tenantId, ...row } });
        created++;
      }
      return { created, skipped };
    }),

  // ── Verificar conectividad de un DVR (auto-detecta puerto) ─────────────────
  checkStatus: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
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

  // ── Verificar todos los DVRs del tenant (auto-detecta puertos) ──────────────
  checkAll: protectedProcedure.mutation(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
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

  // ── Buscar grabaciones en un DVR (Dahua HTTP API) ───────────────────────────
  // channels: array de canales (vacío = todos)
  findRecordings: protectedProcedure
    .input(z.object({
      dvrId:     z.string(),
      channels:  z.array(z.number().int().min(1)), // [] = todos
      date:      z.string(),       // "YYYY-MM-DD"
      startTime: z.string().default("00:00"), // "HH:MM"
      endTime:   z.string().default("23:59"), // "HH:MM"
    }))
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
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

      // Canales a consultar: array vacío = todos
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

  // ── Crear job de scan local ──────────────────────────────────────────────────
  createScanJob: protectedProcedure
    .input(z.object({
      dvrId:     z.string(),
      channels:  z.array(z.number().int().min(1)),
      date:      z.string(),
      startTime: z.string().default("00:00"),
      endTime:   z.string().default("23:59"),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
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

  // ── Consultar resultado de un job ────────────────────────────────────────────
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

// ─── Auto-detección de puerto ────────────────────────────────────────────────

// Puertos HTTP que usan los DVRs/NVRs Dahua e Hikvision, en orden de preferencia
const DVR_PORTS = [80, 8080, 8000, 443, 8443, 9000, 81, 82];

async function probePort(ip: string, currentPort: number): Promise<{ port: number | null }> {
  // Primero prueba el puerto actual (más rápido si ya funcionaba)
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

// ─── Helpers Dahua ───────────────────────────────────────────────────────────

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
