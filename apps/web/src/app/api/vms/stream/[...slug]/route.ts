/**
 * HLS Stream Proxy — /api/vms/stream/{dvrId}/{channel}/{file}
 *
 * El browser NUNCA habla directo con go2rtc.
 * Este endpoint autentica la sesión, obtiene credenciales del DVR,
 * registra el stream en go2rtc y hace proxy del HLS.
 *
 * Rutas:
 *   GET /api/vms/stream/{dvrId}/{channel}/index.m3u8   — playlist HLS
 *   GET /api/vms/stream/{dvrId}/{channel}/{file}.ts    — segmentos
 *   GET /api/vms/stream/{dvrId}/{channel}/{file}.m4s   — segmentos fMP4
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";
import {
  isGo2rtcConfigured,
  streamName,
  registerStream,
  streamExists,
  buildDahuaRtspUrl,
  getGo2rtcHlsUrl,
} from "@/lib/go2rtc";

const DECRYPT_KEY = (process.env.AUTH_SECRET ?? "helpdesk-dvr-secret-key-32chars!").slice(0, 32);
import crypto from "crypto";

function decrypt(text: string): string {
  const [ivHex, encHex] = text.split(":");
  const iv  = Buffer.from(ivHex,  "hex");
  const enc = Buffer.from(encHex, "hex");
  const d   = crypto.createDecipheriv("aes-256-cbc", Buffer.from(DECRYPT_KEY), iv);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  // ── Autenticación ──────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { slug } = await params;
  if (!slug || slug.length < 3) {
    return NextResponse.json({ error: "Ruta inválida: /{dvrId}/{channel}/{file}" }, { status: 400 });
  }

  const [dvrId, channelStr, ...fileParts] = slug;
  const channel = parseInt(channelStr ?? "1") || 1;
  const file    = fileParts.join("/");
  const tenantId = session.user.tenantId;

  // ── Verificar go2rtc configurado ───────────────────────────────────────────
  if (!isGo2rtcConfigured()) {
    return NextResponse.json(
      { error: "Live View no configurado — define GO2RTC_URL en Railway" },
      { status: 503 },
    );
  }

  // ── Obtener DVR y credenciales ─────────────────────────────────────────────
  const [dvr, cred, tunnel] = await Promise.all([
    prisma.dvr.findFirst({ where: { id: dvrId, tenantId } }),
    prisma.dvrCredential.findUnique({ where: { tenantId } }),
    prisma.agentTunnel.findUnique({ where: { tenantId } }),
  ]);

  if (!dvr) return NextResponse.json({ error: "DVR no encontrado" }, { status: 404 });

  let username: string;
  let password: string;
  if (dvr.username && dvr.password) {
    username = dvr.username;
    password = decrypt(dvr.password);
  } else if (cred) {
    username = cred.username;
    password = decrypt(cred.password);
  } else {
    return NextResponse.json({ error: "Configura las credenciales del DVR" }, { status: 400 });
  }

  // ── Determinar si usar tunnel de agente o go2rtc en Railway ───────────────
  // Si el DVR tiene IP local y hay tunnel activo → usar tunnel
  const useTunnel = !!(dvr.localIp && tunnel?.isActive && tunnel.tunnelUrl);
  const go2rtcBase = useTunnel ? tunnel!.tunnelUrl : undefined;

  const ip      = dvr.localIp ?? dvr.ip;
  const rtspPort = 554; // Dahua standard

  // ── Registrar stream en go2rtc (solo en index.m3u8, primera petición) ─────
  if (file === "index.m3u8") {
    const name    = streamName(dvrId!, channel);
    const already = await streamExists(name, go2rtcBase);

    if (!already) {
      const rtspUrl = buildDahuaRtspUrl({ ip, rtspPort, username, password, channel, subtype: 1 });
      try {
        await registerStream(name, rtspUrl, go2rtcBase);
      } catch (err) {
        return NextResponse.json(
          { error: `No se pudo iniciar el stream: ${String(err)}` },
          { status: 502 },
        );
      }
      // Pequeña espera para que go2rtc conecte al DVR
      await new Promise(r => setTimeout(r, 800));
    }
  }

  // ── Proxy de la petición HLS a go2rtc ─────────────────────────────────────
  const name      = streamName(dvrId!, channel);
  const go2rtcUrl = file === "index.m3u8"
    ? getGo2rtcHlsUrl(name, go2rtcBase)
    : `${(go2rtcBase ?? process.env.GO2RTC_URL)?.replace(/\/$/, "")}/${name}/hls/live/${file}`;

  try {
    const ctrl   = new AbortController();
    const timer  = setTimeout(() => ctrl.abort(), 15_000);
    const upstream = await fetch(go2rtcUrl, { signal: ctrl.signal });
    clearTimeout(timer);

    if (!upstream.ok) {
      return NextResponse.json(
        { error: `go2rtc respondió ${upstream.status}` },
        { status: upstream.status },
      );
    }

    const body        = await upstream.arrayBuffer();
    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":  contentType,
        "Cache-Control": "no-cache, no-store",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Error de proxy: ${String(err)}` },
      { status: 502 },
    );
  }
}
