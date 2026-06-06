/**
 * dvr-crypto.ts — Cifrado/descifrado de contraseñas de DVR + validación SSRF
 *
 * Usa DVR_ENCRYPTION_KEY (variable independiente).
 * Migración segura: al descifrar, intenta primero con DVR_ENCRYPTION_KEY
 * y si falla, intenta con AUTH_SECRET para no romper datos existentes.
 *
 * ⚠️  IMPORTANTE: configura DVR_ENCRYPTION_KEY en Railway como una cadena
 * aleatoria de exactamente 32 caracteres, completamente distinta de AUTH_SECRET.
 * Ejemplo: openssl rand -hex 16
 */

import crypto from "crypto";

function getKey(envVar: string): Buffer {
  const val = process.env[envVar];
  if (!val) throw new Error(`Variable de entorno ${envVar} no configurada`);
  return Buffer.from(val.slice(0, 32).padEnd(32, "0"));
}

export function encrypt(text: string): string {
  // Siempre cifra con DVR_ENCRYPTION_KEY; si no está, cae a AUTH_SECRET
  const keyEnv = process.env.DVR_ENCRYPTION_KEY ? "DVR_ENCRYPTION_KEY" : "AUTH_SECRET";
  const key    = getKey(keyEnv);
  const iv     = crypto.randomBytes(16);
  const c      = crypto.createCipheriv("aes-256-cbc", key, iv);
  const enc    = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return iv.toString("hex") + ":" + enc.toString("hex");
}

export function decrypt(text: string): string {
  const [ivHex, encHex] = text.split(":");
  if (!ivHex || !encHex) throw new Error("Formato de contraseña cifrada inválido");

  const iv  = Buffer.from(ivHex,  "hex");
  const enc = Buffer.from(encHex, "hex");

  // Intenta primero con DVR_ENCRYPTION_KEY, luego AUTH_SECRET como fallback
  const keysToTry = [
    process.env.DVR_ENCRYPTION_KEY ? "DVR_ENCRYPTION_KEY" : null,
    "AUTH_SECRET",
  ].filter(Boolean) as string[];

  for (const keyEnv of keysToTry) {
    try {
      const key = getKey(keyEnv);
      const d   = crypto.createDecipheriv("aes-256-cbc", key, iv);
      return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
    } catch {
      // clave incorrecta — probar la siguiente
    }
  }
  throw new Error("No se pudo descifrar la contraseña DVR — verifica DVR_ENCRYPTION_KEY");
}

/**
 * Obtiene las credenciales del DVR descifrando la contraseña.
 * Usa la credencial propia del DVR si la tiene, si no la global del tenant.
 */
export async function getDvrCreds(
  dvrId:    string,
  tenantId: string,
  prisma:   { dvr: { findFirst: Function }, dvrCredential: { findUnique: Function } },
): Promise<{ dvr: object; username: string; password: string; ip: string; httpPort: number }> {
  const { TRPCError } = await import("@trpc/server");

  const [dvr, cred] = await Promise.all([
    prisma.dvr.findFirst({ where: { id: dvrId, tenantId } }),
    prisma.dvrCredential.findUnique({ where: { tenantId } }),
  ]) as [Record<string, unknown> | null, Record<string, unknown> | null];

  if (!dvr) throw new TRPCError({ code: "NOT_FOUND", message: "DVR no encontrado" });

  let username: string;
  let password: string;

  if (dvr.username && dvr.password) {
    username = dvr.username as string;
    password = decrypt(dvr.password as string);
  } else if (cred) {
    username = cred.username as string;
    password = decrypt(cred.password as string);
  } else {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Configura las credenciales del DVR primero" });
  }

  const ip       = (dvr.localIp as string | null) ?? (dvr.ip as string);
  const httpPort = (dvr.port as number | null) ?? 80;

  return { dvr, username, password, ip, httpPort };
}

// ─── Validación SSRF ─────────────────────────────────────────────────────────
// Rechaza IPs que podrían apuntar a servicios internos de la infraestructura.
// Los DVRs en red local (192.168.x.x) son accesibles desde el agente Windows,
// no desde Railway, así que este check aplica solo a peticiones del servidor.

const BLOCKED_RANGES = [
  /^127\./,                    // loopback
  /^0\./,                      // red 0
  /^169\.254\./,               // link-local (metadata AWS/GCP/Railway)
  /^::1$/,                     // IPv6 loopback
  /^fc00:/i,                   // IPv6 unique local
  /^fe80:/i,                   // IPv6 link-local
];

export function isSsrfBlockedIp(ip: string): boolean {
  return BLOCKED_RANGES.some(r => r.test(ip));
}

/**
 * Lanza un error si la IP está bloqueada por SSRF.
 * Usar antes de cualquier fetch() a una IP de DVR en el servidor.
 */
export function assertNotSsrf(ip: string): void {
  if (isSsrfBlockedIp(ip)) {
    throw new Error(`IP bloqueada por seguridad: ${ip}`);
  }
}
