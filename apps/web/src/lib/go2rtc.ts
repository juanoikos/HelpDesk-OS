/**
 * go2rtc API Client
 * go2rtc convierte RTSP → HLS/WebRTC en tiempo real.
 * Docs: https://github.com/AlexxIT/go2rtc
 *
 * Variables de entorno en Railway:
 *   GO2RTC_URL — URL interna del servicio go2rtc (ej: http://go2rtc.railway.internal:1984)
 *               Si no está definida, el Live View no está disponible.
 */

const GO2RTC_URL = process.env.GO2RTC_URL?.replace(/\/$/, "") ?? "";

export function isGo2rtcConfigured(): boolean {
  return GO2RTC_URL.length > 0;
}

// ─── Construcción de RTSP URL para Dahua ─────────────────────────────────────

export function buildDahuaRtspUrl(opts: {
  ip:       string;
  rtspPort: number;   // 554 por defecto
  username: string;
  password: string;
  channel:  number;   // 1-based
  subtype?: 0 | 1;   // 0=main stream (HD), 1=sub stream (SD, menos ancho de banda)
}): string {
  const sub = opts.subtype ?? 1; // sub stream por defecto para live view
  const enc = encodeURIComponent;
  return `rtsp://${enc(opts.username)}:${enc(opts.password)}@${opts.ip}:${opts.rtspPort}/cam/realmonitor?channel=${opts.channel}&subtype=${sub}`;
}

// ─── Nombre del stream en go2rtc ─────────────────────────────────────────────

export function streamName(dvrId: string, channel: number): string {
  // Usa 16 chars para evitar colisiones entre DVRs con UUIDs similares
  return `dvr_${dvrId.replace(/-/g, "").slice(-16)}_ch${channel}`;
}

// ─── Registrar stream en go2rtc ───────────────────────────────────────────────

export async function registerStream(
  name:    string,
  rtspUrl: string,
  baseUrl?: string,          // override para tunnels de agente local
): Promise<void> {
  const base = (baseUrl ?? GO2RTC_URL).replace(/\/$/, "");
  if (!base) throw new Error("GO2RTC_URL no configurado");

  const url = `${base}/api/streams?name=${encodeURIComponent(name)}&src=${encodeURIComponent(rtspUrl)}`;
  const res = await fetch(url, { method: "PUT", signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`go2rtc register error ${res.status}: ${txt}`);
  }
}

// ─── Verificar si un stream ya está activo ───────────────────────────────────

export async function streamExists(name: string, baseUrl?: string): Promise<boolean> {
  const base = (baseUrl ?? GO2RTC_URL).replace(/\/$/, "");
  if (!base) return false;
  try {
    const res  = await fetch(`${base}/api/streams`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return false;
    const data = await res.json() as Record<string, unknown>;
    return name in data;
  } catch {
    return false;
  }
}

// ─── Eliminar stream de go2rtc ───────────────────────────────────────────────

export async function unregisterStream(name: string, baseUrl?: string): Promise<void> {
  const base = (baseUrl ?? GO2RTC_URL).replace(/\/$/, "");
  if (!base) return;
  await fetch(`${base}/api/streams?name=${encodeURIComponent(name)}`, { method: "DELETE" });
}

// ─── URL HLS que el proxy sirve al browser ───────────────────────────────────
// El browser NUNCA habla directamente con go2rtc — siempre a través de /api/vms/stream

export function getProxyHlsUrl(dvrId: string, channel: number): string {
  return `/api/vms/stream/${dvrId}/${channel}/index.m3u8`;
}

// ─── URL HLS interna (go2rtc → Next.js proxy) ───────────────────────────────

export function getGo2rtcHlsUrl(name: string, baseUrl?: string): string {
  const base = (baseUrl ?? GO2RTC_URL).replace(/\/$/, "");
  return `${base}/${name}/hls/live/index.m3u8`;
}
