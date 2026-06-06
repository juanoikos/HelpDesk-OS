/**
 * Alarm Handler
 * Procesa eventos recibidos de DVRs Dahua:
 * 1. Guarda la alarma en la DB
 * 2. Para eventos críticos → crea ticket automáticamente con snapshot
 * 3. Notifica a browsers conectados via SSE
 */

import { prisma } from "@helpdesk-os/db";
import { uploadToR2 } from "./r2";
import { assertNotSsrf } from "./dvr-crypto";
import { randomUUID } from "crypto";

// ─── Clasificación de eventos ─────────────────────────────────────────────────

export const EVENT_SEVERITY: Record<string, "critical" | "high" | "medium" | "low"> = {
  VideoLoss:              "critical",  // ← crea ticket
  VideoBlind:             "high",      // ← crea ticket
  AlarmLocal:             "high",      // ← crea ticket
  VideoMotion:            "medium",    // solo guarda
  CrossLineDetection:     "medium",    // solo guarda
  CrossRegionDetection:   "medium",    // solo guarda
  SmartMotionHuman:       "low",       // solo guarda
  SmartMotionVehicle:     "low",       // solo guarda
  FaceDetection:          "low",       // solo guarda
  Keepalive:              "low",       // ignorar
};

const AUTO_TICKET_CODES = new Set(["VideoLoss", "VideoBlind", "AlarmLocal"]);

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DahuaEvent {
  code:    string;
  action:  string;
  index:   number;  // canal 0-based
  data:    Record<string, unknown>;
  rawLine: string;
}

// ─── Deduplicación en memoria (evita spam de alarmas iguales) ────────────────

const recentAlarms = new Map<string, number>();
const DEDUP_MS = 30_000; // 30 segundos

function isDuplicate(key: string): boolean {
  const last = recentAlarms.get(key);
  if (last && Date.now() - last < DEDUP_MS) return true;
  recentAlarms.set(key, Date.now());
  // limpiar entradas viejas
  if (recentAlarms.size > 1000) {
    for (const [k, t] of recentAlarms.entries()) {
      if (Date.now() - t > DEDUP_MS * 2) recentAlarms.delete(k);
    }
  }
  return false;
}

// ─── SSE clients (notificación en tiempo real) ────────────────────────────────

type SseController = ReadableStreamDefaultController<string>;
const sseClients = new Map<string, Set<SseController>>();

export function registerSseClient(tenantId: string, ctrl: SseController) {
  if (!sseClients.has(tenantId)) sseClients.set(tenantId, new Set());
  sseClients.get(tenantId)!.add(ctrl);
}

export function unregisterSseClient(tenantId: string, ctrl: SseController) {
  sseClients.get(tenantId)?.delete(ctrl);
}

function notifySseClients(tenantId: string, alarm: object) {
  const clients = sseClients.get(tenantId);
  if (!clients?.size) return;
  const msg = `data: ${JSON.stringify(alarm)}\n\n`;
  for (const ctrl of clients) {
    try { ctrl.enqueue(msg); }
    catch { clients.delete(ctrl); }
  }
}

// ─── Procesamiento principal de alarma ───────────────────────────────────────

export async function processAlarm(
  dvr: { id: string; name: string; tenantId: string; ip: string; port: number; localIp: string | null },
  creds: { username: string; password: string },
  event: DahuaEvent,
): Promise<void> {
  // Ignorar heartbeats y Stop events
  if (event.code === "Keepalive" || event.action === "Stop") return;

  const channel = event.index + 1; // convertir a 1-based
  const dedupKey = `${dvr.id}_${channel}_${event.code}`;
  if (isDuplicate(dedupKey)) return;

  console.log(`[alarm] ${dvr.name} CH${channel} — ${event.code}`);

  // ── Snapshot del canal afectado ──────────────────────────────────────────
  let snapshotUrl: string | undefined;
  try {
    const ip   = dvr.localIp ?? dvr.ip;
    assertNotSsrf(ip); // bloquear metadata endpoints (169.254.x.x, 127.x.x.x)
    const auth = Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
    const ctrl          = new AbortController();
    const snapshotTimer = setTimeout(() => ctrl.abort(), 5000); // fix: siempre limpiar el timer
    try {
      const res = await fetch(
        `http://${ip}:${dvr.port}/cgi-bin/snapshot.cgi?channel=${channel}`,
        { headers: { Authorization: `Basic ${auth}` }, signal: ctrl.signal },
      );
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const key = `${dvr.tenantId}/dvr-alarms/${dvr.id}/${randomUUID()}.jpg`;
        snapshotUrl = await uploadToR2(key, buf, "image/jpeg");
      }
    } finally {
      clearTimeout(snapshotTimer);
    }
  } catch { /* snapshot falla → continuar sin foto */ }

  // ── Guardar alarma en DB ──────────────────────────────────────────────────
  const alarm = await prisma.dvrAlarm.create({
    data: {
      tenantId:   dvr.tenantId,
      dvrId:      dvr.id,
      dvrName:    dvr.name,
      channel,
      code:       event.code,
      action:     event.action,
      eventData:  event.data as object,
      snapshotUrl: snapshotUrl ?? null,
    },
  });

  // ── Crear ticket automático para eventos críticos ─────────────────────────
  let ticketId: string | undefined;
  if (AUTO_TICKET_CODES.has(event.code)) {
    ticketId = await createAlarmTicket(dvr, alarm.id, channel, event.code, snapshotUrl);
    if (ticketId) {
      await prisma.dvrAlarm.update({
        where: { id: alarm.id },
        data:  { ticketId },
      });
    }
  }

  // ── Notificar browsers via SSE ────────────────────────────────────────────
  notifySseClients(dvr.tenantId, {
    id:          alarm.id,
    dvrId:       dvr.id,
    dvrName:     dvr.name,
    channel,
    code:        event.code,
    action:      event.action,
    snapshotUrl: snapshotUrl ?? null,
    ticketId:    ticketId ?? null,
    createdAt:   alarm.createdAt.toISOString(),
  });
}

// ─── Crear ticket automático ──────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  VideoLoss:  "Pérdida de señal",
  VideoBlind: "Cámara obstruida/tapada",
  AlarmLocal: "Alarma local activada",
};

async function createAlarmTicket(
  dvr: { id: string; name: string; tenantId: string; location?: string | null },
  alarmId: string,
  channel: number,
  code: string,
  snapshotUrl?: string,
): Promise<string | undefined> {
  try {
    // Usar el primer admin del tenant como creador
    const admin = await prisma.user.findFirst({
      where:  { tenantId: dvr.tenantId, role: "ADMIN" },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!admin) return undefined;

    const eventLabel = EVENT_LABELS[code] ?? code;
    const location   = (dvr as { location?: string | null }).location ?? dvr.name;

    // Número de ticket secuencial
    const last = await prisma.ticket.findFirst({
      where:   { tenantId: dvr.tenantId },
      orderBy: { number: "desc" },
      select:  { number: true },
    });
    const number = (last?.number ?? 0) + 1;

    const body = `**Alarma automática detectada**\n\n- **Evento:** ${eventLabel}\n- **DVR:** ${dvr.name}\n- **Canal:** ${channel}\n- **Sede:** ${location}\n- **Alarm ID:** ${alarmId}\n\n${snapshotUrl ? `Snapshot: ${snapshotUrl}` : "Sin snapshot disponible."}`;

    const ticket = await prisma.ticket.create({
      data: {
        tenantId:    dvr.tenantId,
        number,
        title:       `🚨 ${eventLabel} — ${dvr.name} — Canal ${channel}`,
        type:        "INCIDENT",
        priority:    code === "VideoLoss" ? "URGENT" : "HIGH",
        impact:      "HIGH",
        status:      "NEW",
        createdById: admin.id,
        slaDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000),
      },
    });

    // Crear el primer mensaje del ticket con los detalles de la alarma
    try {
      const msgModel = (prisma as unknown as Record<string, { create: (args: unknown) => Promise<unknown> }>).ticketMessage;
      if (msgModel) {
        await msgModel.create({
          data: { ticketId: ticket.id, body, createdById: admin.id },
        });
      }
    } catch { /* campo o modelo con nombre diferente — no crítico */ }

    console.log(`[alarm] Ticket #${number} creado automáticamente para alarma ${code}`);
    return ticket.id;
  } catch (err) {
    console.error("[alarm] Error creando ticket:", err);
    return undefined;
  }
}
