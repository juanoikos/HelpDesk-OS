/**
 * Channel Heartbeat Service
 *
 * Complementa el estado en tiempo real que actualiza alarm-handler.ts a partir
 * de eventos VideoLoss (dvr-events.ts). Ese mecanismo es push-based (no agrega
 * carga extra a la DVR y no escala con el número de canales) pero depende de
 * que el firmware reporte VideoLoss de forma confiable, y no dice nada de
 * canales que nunca emitieron un evento (arranque en frío de un DVR nuevo).
 *
 * Este servicio es el RESPALDO, no la fuente principal. Dos optimizaciones
 * clave para que no crezca linealmente con la cantidad de DVRs/canales:
 *
 * 1. Intervalo configurable por tenant (TenantSettings.channelCheckIntervalMin,
 *    default 5 min) — el tick del scheduler corre cada minuto, pero cada DVR
 *    solo se re-verifica cuando ya pasó su propio intervalo configurado
 *    (Dvr.lastChannelCheckAt).
 * 2. Si una cámara ya tiene un evento reciente (VideoLoss Start/Stop dentro de
 *    RECENT_EVENT_THRESHOLD_MS), se salta su snapshot activo en este ciclo —
 *    ya sabemos que está viva por el canal de eventos, no hace falta gastar
 *    ancho de banda confirmándolo otra vez.
 *
 * ⚠️ Nota de escala: aun con estas dos optimizaciones, el snapshot activo
 * sigue descargando una imagen completa por canal que sí necesita chequeo.
 * Si el volumen crece mucho más de lo previsto, la siguiente palanca es subir
 * el intervalo default o cambiar a una verificación más liviana (un método
 * RPC2 de estado de canal si el firmware lo soporta, en vez del snapshot).
 */

import { prisma } from "@helpdesk-os/db";
import { DahuaRPC2Client } from "@helpdesk-os/dahua-sdk";
import { decrypt } from "./dvr-crypto";

const TICK_MS                    = 60_000;       // el scheduler revisa "¿a quién le toca?" cada minuto
const DEFAULT_INTERVAL_MIN        = 5;            // fallback si el tenant no tiene configurado el suyo
const RECENT_EVENT_THRESHOLD_MS   = 60 * 60_000;  // 1 hora — si hay evento más reciente que esto, no repetir snapshot
const SNAPSHOT_TIMEOUT_MS         = 5_000;
const START_DELAY_MS              = 30_000;       // después de dvr-heartbeat (10s) y dvr-events (15s)

async function checkChannel(
  dvr:   { ip: string; localIp: string | null; port: number },
  channel: number,
  creds: { username: string; password: string },
): Promise<boolean> {
  try {
    const client = new DahuaRPC2Client({
      ip:        dvr.localIp ?? dvr.ip,
      port:      dvr.port,
      username:  creds.username,
      password:  creds.password,
      timeoutMs: SNAPSHOT_TIMEOUT_MS,
    });
    const buf = await client.getSnapshot(channel);
    return buf.length > 0;
  } catch {
    return false;
  }
}

async function runChannelHeartbeat() {
  try {
    const now = Date.now();

    // Solo DVRs que el heartbeat principal ya marcó ONLINE
    const dvrs = await prisma.dvr.findMany({
      where:  { status: "ONLINE" },
      select: {
        id: true, tenantId: true, ip: true, localIp: true, port: true,
        channels: true, username: true, password: true, lastChannelCheckAt: true,
      },
    });
    if (dvrs.length === 0) return;

    const tenantIds = [...new Set(dvrs.map(d => d.tenantId))];

    // Intervalo configurado por tenant + credenciales globales, en dos queries (no N)
    const [tenantSettings, tenantCreds] = await Promise.all([
      prisma.tenantSettings.findMany({
        where:  { tenantId: { in: tenantIds } },
        select: { tenantId: true, channelCheckIntervalMin: true },
      }),
      prisma.dvrCredential.findMany({ where: { tenantId: { in: tenantIds } } }),
    ]);
    const intervalByTenant = new Map(tenantSettings.map(s => [s.tenantId, s.channelCheckIntervalMin]));
    const credByTenant     = new Map(tenantCreds.map(c => [c.tenantId, c]));

    // Filtrar: solo las DVRs a las que ya les toca según su intervalo configurado
    const dueDvrs = dvrs.filter(dvr => {
      const intervalMin = intervalByTenant.get(dvr.tenantId) ?? DEFAULT_INTERVAL_MIN;
      if (!dvr.lastChannelCheckAt) return true; // nunca se ha chequeado
      return now - dvr.lastChannelCheckAt.getTime() >= intervalMin * 60_000;
    });
    if (dueDvrs.length === 0) return;

    // Cámaras con evento reciente (para saltarlas) — una sola query para todas las DVRs due
    const recentCameras = await prisma.camera.findMany({
      where: {
        dvrId:       { in: dueDvrs.map(d => d.id) },
        lastEventAt: { gte: new Date(now - RECENT_EVENT_THRESHOLD_MS) },
      },
      select: { dvrId: true, channelNumber: true },
    });
    const recentSet = new Set(recentCameras.map(c => `${c.dvrId}_${c.channelNumber}`));

    let checkedDvrs = 0;

    for (const dvr of dueDvrs) {
      let username: string, password: string;
      if (dvr.username && dvr.password) {
        username = dvr.username;
        password = decrypt(dvr.password);
      } else {
        const tc = credByTenant.get(dvr.tenantId);
        if (!tc) continue; // sin credenciales configuradas — no se puede verificar
        username = tc.username;
        password = decrypt(tc.password);
      }

      const channelsToCheck = Array.from({ length: dvr.channels }, (_, i) => i + 1)
        .filter(ch => !recentSet.has(`${dvr.id}_${ch}`));

      await Promise.all(channelsToCheck.map(async (ch) => {
        const ok = await checkChannel(dvr, ch, { username, password });
        await prisma.camera.upsert({
          where:  { dvrId_channelNumber: { dvrId: dvr.id, channelNumber: ch } },
          create: { dvrId: dvr.id, channelNumber: ch, isConnected: ok, lastCheckedAt: new Date() },
          update: { isConnected: ok, lastCheckedAt: new Date() },
        });
      }));

      await prisma.dvr.update({
        where: { id: dvr.id },
        data:  { lastChannelCheckAt: new Date() },
      });
      checkedDvrs++;
    }

    if (checkedDvrs > 0) {
      console.log(`[channel-heartbeat] ${checkedDvrs} DVRs verificados por canal`);
    }
  } catch (err) {
    console.error("[channel-heartbeat] Error:", err);
  }
}

let started = false;

export function startChannelHeartbeat() {
  if (started) return;
  started = true;

  setTimeout(() => {
    runChannelHeartbeat();
    setInterval(runChannelHeartbeat, TICK_MS);
  }, START_DELAY_MS);

  console.log("[channel-heartbeat] Iniciado — tick cada minuto, intervalo configurable por tenant (default 5 min)");
}
