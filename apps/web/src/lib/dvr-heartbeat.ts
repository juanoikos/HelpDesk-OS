/**
 * DVR Heartbeat Service
 * Cada 60 segundos prueba conectividad HTTP de todos los DVRs.
 * Actualiza status (ONLINE/OFFLINE) y lastChecked en la DB.
 */

import { prisma } from "@helpdesk-os/db";

const INTERVAL_MS  = 60_000; // 60 segundos
const PROBE_PORTS  = [80, 8080, 8000, 443, 8443, 9000];
const TIMEOUT_MS   = 4_000;

async function probeHttp(ip: string, port: number): Promise<boolean> {
  const portsToTry = [port, ...PROBE_PORTS.filter(p => p !== port)];
  for (const p of portsToTry) {
    try {
      const ctrl = new AbortController();
      const t    = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const res  = await fetch(`http://${ip}:${p}/`, { method: "HEAD", signal: ctrl.signal });
      clearTimeout(t);
      if (res.status < 600) return true;
    } catch { /* siguiente */ }
  }
  return false;
}

async function runHeartbeat() {
  try {
    const dvrs = await prisma.dvr.findMany({
      select: { id: true, ip: true, localIp: true, port: true },
    });

    await Promise.all(
      dvrs.map(async (dvr) => {
        const ip     = dvr.localIp ?? dvr.ip;
        const online = await probeHttp(ip, dvr.port ?? 80);
        await prisma.dvr.update({
          where: { id: dvr.id },
          data:  {
            status:      online ? "ONLINE" : "OFFLINE",
            lastChecked: new Date(),
          },
        });
      }),
    );

    if (dvrs.length > 0) {
      console.log(`[dvr-heartbeat] ${dvrs.length} DVRs verificados`);
    }
  } catch (err) {
    console.error("[dvr-heartbeat] Error:", err);
  }
}

let started = false;

export function startDvrHeartbeat() {
  if (started) return;
  started = true;

  // Primera ejecución después de 10 segundos (dejar que el server arranque)
  setTimeout(() => {
    runHeartbeat();
    setInterval(runHeartbeat, INTERVAL_MS);
  }, 10_000);

  console.log("[dvr-heartbeat] Iniciado — verificando cada 60 segundos");
}
