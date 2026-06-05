/**
 * DVR Event Subscriber
 * Se conecta a cada DVR via long-polling HTTP (eventManager.cgi?action=attach)
 * y parsea el stream multipart de eventos en tiempo real.
 *
 * Gestiona reconexiones automáticas con backoff exponencial.
 */

import { prisma } from "@helpdesk-os/db";
import { processAlarm, type DahuaEvent } from "./alarm-handler";

const RECONNECT_BASE_MS = 10_000;
const RECONNECT_MAX_MS  = 120_000;
const CONNECTION_TTL_MS = 5 * 60 * 1000; // 5 min, luego reconectar

// ─── Parser de línea de evento Dahua ─────────────────────────────────────────
// Formato: Code=VideoMotion;action=Start;index=0;data={...}

function parseEventLine(line: string): DahuaEvent | null {
  if (!line.startsWith("Code=")) return null;
  const parts: Record<string, string> = {};
  let dataStr = "";
  let inData  = false;

  for (const part of line.split(";")) {
    if (inData) { dataStr += ";" + part; continue; }
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const val = part.slice(eq + 1).trim();
    if (key === "data") { inData = true; dataStr = val; }
    else parts[key] = val;
  }

  const code  = parts["Code"];
  const action = parts["action"] ?? "Start";
  const index  = parseInt(parts["index"] ?? "0");
  if (!code) return null;

  let data: Record<string, unknown> = {};
  try { data = JSON.parse(dataStr); } catch { /* ignorar JSON inválido */ }

  return { code, action, index, data, rawLine: line };
}

// ─── Suscripción a un DVR ────────────────────────────────────────────────────

async function subscribeOnce(
  dvr: { id: string; name: string; tenantId: string; ip: string; port: number; localIp: string | null },
  creds: { username: string; password: string },
  signal: AbortSignal,
): Promise<void> {
  const ip   = dvr.localIp ?? dvr.ip;
  const auth = Buffer.from(`${creds.username}:${creds.password}`).toString("base64");
  const url  = `http://${ip}:${dvr.port}/cgi-bin/eventManager.cgi?action=attach&codes[0]=All&heartbeat=5`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Connection:    "keep-alive",
    },
    signal,
  });

  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} de ${dvr.name}`);
  }

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = "";

  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith("--") || line.startsWith("Content-")) continue;
        const event = parseEventLine(line);
        if (event) {
          // Fire-and-forget (no await, para no bloquear el stream)
          processAlarm(dvr, creds, event).catch(err =>
            console.error(`[dvr-events] Error procesando alarma ${dvr.name}:`, err)
          );
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ─── Loop de reconexión por DVR ───────────────────────────────────────────────

async function subscribeWithReconnect(
  dvrId:     string,
  globalAbort: AbortSignal,
): Promise<void> {
  let backoff = RECONNECT_BASE_MS;

  while (!globalAbort.aborted) {
    try {
      // Obtener DVR y credenciales frescas desde DB
      const [dvr, tenantCred] = await Promise.all([
        prisma.dvr.findUnique({
          where:  { id: dvrId },
          select: { id: true, name: true, tenantId: true, ip: true, port: true, localIp: true,
                    status: true, username: true, password: true },
        }),
        prisma.dvrCredential.findFirst({
          where:  { tenantId: (await prisma.dvr.findUnique({ where: { id: dvrId }, select: { tenantId: true } }))?.tenantId ?? "" },
        }),
      ]);

      if (!dvr || dvr.status === "OFFLINE") {
        await delay(RECONNECT_MAX_MS, globalAbort);
        continue;
      }

      const ENC_KEY = (process.env.AUTH_SECRET ?? "helpdesk-dvr-secret-key-32chars!").slice(0, 32);
      const decrypt = (text: string) => {
        const crypto = require("crypto") as typeof import("crypto");
        const [ivHex, encHex] = text.split(":");
        const iv  = Buffer.from(ivHex, "hex");
        const enc = Buffer.from(encHex, "hex");
        const d   = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENC_KEY), iv);
        return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
      };

      let username: string, password: string;
      if (dvr.username && dvr.password) { username = dvr.username; password = decrypt(dvr.password); }
      else if (tenantCred)              { username = tenantCred.username; password = decrypt(tenantCred.password); }
      else { await delay(RECONNECT_MAX_MS, globalAbort); continue; }

      console.log(`[dvr-events] Conectando a ${dvr.name} (${dvr.ip})...`);

      // Timeout de 5 minutos por conexión (luego reconectar)
      const sessionAbort = AbortSignal.any([
        globalAbort,
        AbortSignal.timeout(CONNECTION_TTL_MS),
      ]);

      await subscribeOnce(
        { id: dvr.id, name: dvr.name, tenantId: dvr.tenantId, ip: dvr.ip, port: dvr.port, localIp: dvr.localIp },
        { username, password },
        sessionAbort,
      );

      console.log(`[dvr-events] Desconectado de ${dvr.name} — reconectando...`);
      backoff = RECONNECT_BASE_MS; // reset backoff en desconexión limpia

    } catch (err: unknown) {
      if (globalAbort.aborted) break;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("aborted")) {
        console.warn(`[dvr-events] Error en ${dvrId}: ${msg} — reintentando en ${backoff / 1000}s`);
      }
      backoff = Math.min(backoff * 2, RECONNECT_MAX_MS);
    }

    await delay(backoff, globalAbort);
  }
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });
}

// ─── Arranque del servicio ────────────────────────────────────────────────────

let globalAbortController: AbortController | null = null;
let started = false;

export async function startDvrEventSubscriber(): Promise<void> {
  if (started) return;
  started = true;

  globalAbortController = new AbortController();
  const signal = globalAbortController.signal;

  console.log("[dvr-events] Iniciando suscriptor de eventos...");

  // Esperar 15s para que el server arranque
  await delay(15_000, signal);
  if (signal.aborted) return;

  // Obtener todos los DVRs al inicio y cada 5 minutos
  async function refreshAndSubscribe() {
    if (signal.aborted) return;
    const dvrs = await prisma.dvr.findMany({
      where:  { status: { not: "OFFLINE" } },
      select: { id: true },
    });
    for (const dvr of dvrs) {
      // Lanzar una tarea por DVR (no await — corren en paralelo)
      subscribeWithReconnect(dvr.id, signal).catch(() => {});
    }
    console.log(`[dvr-events] Suscrito a ${dvrs.length} DVRs`);
  }

  await refreshAndSubscribe();

  // Refrescar lista de DVRs cada 5 minutos (por si se agregan nuevos)
  const refreshInterval = setInterval(refreshAndSubscribe, 5 * 60 * 1000);
  signal.addEventListener("abort", () => clearInterval(refreshInterval));
}

export function stopDvrEventSubscriber(): void {
  globalAbortController?.abort();
  globalAbortController = null;
  started = false;
}
