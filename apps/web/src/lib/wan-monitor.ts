/**
 * WAN Monitor Worker
 * Corre en background del servidor Next.js (iniciado desde instrumentation.ts).
 * Cada 10 segundos evalúa qué targets WAN están vencidos y los chequea.
 * Soporta: http, https, tcp, ping (via ICMP shell).
 */

import net from "net";
import { exec } from "child_process";
import { promisify } from "util";
import { prisma } from "@helpdesk-os/db";

const execAsync = promisify(exec);

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CheckResult {
  status:     "up" | "down" | "timeout";
  latency:    number | null;
  httpStatus: number | null;
  error:      string | null;
}

// ── Checkers ──────────────────────────────────────────────────────────────────

async function httpCheck(
  scheme: "http" | "https",
  host: string,
  port: number,
  path: string,
  timeoutMs: number,
): Promise<CheckResult> {
  const url = `${scheme}://${host}:${port}${path}`;
  const start = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      signal:   controller.signal,
      redirect: "manual",
    });
    clearTimeout(timer);

    const latency = Date.now() - start;
    const ok = response.status < 500;
    return {
      status:     ok ? "up" : "down",
      latency,
      httpStatus: response.status,
      error:      ok ? null : `HTTP ${response.status}`,
    };
  } catch (err: unknown) {
    const latency = Date.now() - start;
    const e = err as Error;
    if (e?.name === "AbortError" || e?.message?.includes("aborted")) {
      return { status: "timeout", latency: null, httpStatus: null, error: "Timeout" };
    }
    return { status: "down", latency: latency > timeoutMs ? null : latency, httpStatus: null, error: e?.message ?? "Error" };
  }
}

async function tcpCheck(host: string, port: number, timeoutMs: number): Promise<CheckResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();

    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ status: "timeout", latency: null, httpStatus: null, error: "Timeout" });
    }, timeoutMs);

    socket.connect(port, host, () => {
      clearTimeout(timer);
      const latency = Date.now() - start;
      socket.destroy();
      resolve({ status: "up", latency, httpStatus: null, error: null });
    });

    socket.on("error", (err) => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ status: "down", latency: null, httpStatus: null, error: err.message });
    });
  });
}

async function pingCheck(host: string, timeoutMs: number): Promise<CheckResult> {
  const start = Date.now();
  const isWindows = process.platform === "win32";
  const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
  const cmd = isWindows
    ? `ping -n 1 -w ${timeoutMs} ${host}`
    : `ping -c 1 -W ${timeoutSec} ${host}`;

  try {
    await execAsync(cmd, { timeout: timeoutMs + 2000 });
    const latency = Date.now() - start;
    return { status: "up", latency, httpStatus: null, error: null };
  } catch {
    return { status: "down", latency: null, httpStatus: null, error: "Sin respuesta ICMP" };
  }
}

// ── Selección de checker según tipo ───────────────────────────────────────────

export async function runCheck(
  checkType: string,
  host: string,
  port: number | null | undefined,
  httpPath: string,
  timeoutMs: number,
): Promise<CheckResult> {
  switch (checkType) {
    case "http": {
      const p = port ?? 80;
      return httpCheck("http", host, p, httpPath || "/", timeoutMs);
    }
    case "https": {
      const p = port ?? 443;
      return httpCheck("https", host, p, httpPath || "/", timeoutMs);
    }
    case "tcp": {
      const p = port ?? 80;
      return tcpCheck(host, p, timeoutMs);
    }
    case "ping":
    default:
      return pingCheck(host, timeoutMs);
  }
}

// ── Retry logic ───────────────────────────────────────────────────────────────

async function runWithRetries(
  checkType: string,
  host: string,
  port: number | null | undefined,
  httpPath: string,
  timeoutMs: number,
  retries: number,
): Promise<CheckResult> {
  let last: CheckResult = { status: "unknown" as "down", latency: null, httpStatus: null, error: "No ejecutado" };

  for (let attempt = 0; attempt <= retries; attempt++) {
    last = await runCheck(checkType, host, port, httpPath, timeoutMs);
    if (last.status === "up") return last;
    if (attempt < retries) await new Promise(r => setTimeout(r, 1000)); // 1s entre reintentos
  }

  return last;
}

// ── Guardar resultado en DB ───────────────────────────────────────────────────

export async function performAndSaveCheck(target: {
  id:        string;
  tenantId:  string;
  host:      string;
  checkType: string;
  port:      number | null;
  httpPath:  string;
  timeout:   number;
  retries:   number;
}): Promise<void> {
  const result = await runWithRetries(
    target.checkType,
    target.host,
    target.port,
    target.httpPath,
    target.timeout,
    target.retries,
  );

  const now = new Date();

  await Promise.all([
    prisma.monitorCheck.create({
      data: {
        tenantId:   target.tenantId,
        targetId:   target.id,
        status:     result.status,
        latency:    result.latency,
        httpStatus: result.httpStatus,
        error:      result.error,
        checkedAt:  now,
        checkedBy:  "server",
      },
    }),
    prisma.monitorTarget.update({
      where: { id: target.id },
      data: {
        status:      result.status,
        lastChecked: now,
        lastLatency: result.latency,
        lastError:   result.error,
      },
    }),
  ]);
}

// ── Loop principal WAN ────────────────────────────────────────────────────────

let wanWorkerRunning = false;

export function startWanMonitor(): void {
  if (wanWorkerRunning) return;
  wanWorkerRunning = true;

  console.log("[wan-monitor] Worker iniciado");

  // Limpiar checks viejos una vez al día
  setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - 30 * 86400_000);
      const { count } = await prisma.monitorCheck.deleteMany({ where: { checkedAt: { lt: cutoff } } });
      if (count > 0) console.log(`[wan-monitor] Limpiados ${count} checks antiguos`);
    } catch (err) {
      console.error("[wan-monitor] Error en limpieza:", err);
    }
  }, 86400_000);

  // Loop principal: cada 10s evalúa qué targets WAN están vencidos
  async function loop() {
    try {
      const now = Date.now();

      const targets = await prisma.monitorTarget.findMany({
        where: { networkType: "wan", enabled: true },
        select: {
          id:        true,
          tenantId:  true,
          host:      true,
          checkType: true,
          port:      true,
          httpPath:  true,
          interval:  true,
          timeout:   true,
          retries:   true,
          lastChecked: true,
        },
      });

      // Filtrar targets vencidos
      const due = targets.filter((t) => {
        if (!t.lastChecked) return true;
        return (now - t.lastChecked.getTime()) >= t.interval * 1000;
      });

      if (due.length > 0) {
        // Ejecutar en paralelo con límite de 10 concurrentes
        const CONCURRENCY = 10;
        for (let i = 0; i < due.length; i += CONCURRENCY) {
          const batch = due.slice(i, i + CONCURRENCY);
          await Promise.allSettled(batch.map((t) => performAndSaveCheck(t)));
        }
      }
    } catch (err) {
      console.error("[wan-monitor] Error en loop:", err);
    }

    setTimeout(loop, 10_000);
  }

  // Pequeño delay inicial para dejar que la app arranque completamente
  setTimeout(loop, 5_000);
}
