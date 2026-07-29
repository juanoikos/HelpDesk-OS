/**
 * POST /api/agent/tunnel-register
 * El agente Windows llama este endpoint cuando cloudflared inicia
 * y obtiene su URL pública. Railway la guarda por tenant.
 *
 * Body: { tunnelUrl: "https://abc123.trycloudflare.com" }
 * Auth: Bearer {agentToken}
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";
import crypto from "crypto";

// Rate limiting básico en memoria — máximo 10 requests por IP por minuto
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= 10) return false;
  entry.count++;
  return true;
}

// Comparación en tiempo constante para evitar timing attacks
function safeTokenCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Misma longitud para evitar leak de información
    crypto.timingSafeEqual(Buffer.from(a), Buffer.from(a));
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(req: NextRequest) {
  // Rate limiting por IP
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!checkRateLimit(clientIp)) {
    return NextResponse.json({ error: "Demasiadas peticiones" }, { status: 429 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "").trim();

  if (!token) return NextResponse.json({ error: "Token requerido" }, { status: 401 });

  // Buscar todos los tokens activos para comparación en tiempo constante
  const allSettings = await prisma.tenantSettings.findMany({
    select: { tenantId: true, agentToken: true },
  });
  const settings = allSettings.find(s => s.agentToken && safeTokenCompare(s.agentToken, token));
  if (!settings) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  const tenantId = settings.tenantId;

  let body: { tunnelUrl?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const { tunnelUrl } = body;
  // Solo aceptar URLs de Cloudflare Tunnel — previene SSRF por tunnel malicioso.
  // Se aceptan dos formas:
  //   - *.trycloudflare.com   → quick tunnels legacy (agentes viejos sin actualizar)
  //   - *.helpdeskos.co       → tunnels autenticados por tenant (arquitectura actual)
  const TUNNEL_RE = /^https:\/\/[\w-]+\.trycloudflare\.com$/;
  const HELPDESKOS_RE = /^https:\/\/[\w-]+\.helpdeskos\.co$/;
  if (!tunnelUrl || !(TUNNEL_RE.test(tunnelUrl) || HELPDESKOS_RE.test(tunnelUrl))) {
    return NextResponse.json(
      { error: "tunnelUrl inválida — solo se aceptan dominios *.trycloudflare.com o *.helpdeskos.co" },
      { status: 400 },
    );
  }

  // AgentTunnel ya no se identifica de forma única por tenantId (ahora es
  // por locationId, porque un tenant puede tener varias sedes). Mientras no
  // exista UI para elegir sede explícita en el agente, se usa la sede
  // "default" del tenant — la misma que crea/usa ensureTunnelForTenant().
  let location = await prisma.location.findFirst({
    where: { tenantId },
    orderBy: { createdAt: "asc" },
  });
  if (!location) {
    location = await prisma.location.create({ data: { tenantId, name: "Sede Principal" } });
  }

  await prisma.agentTunnel.upsert({
    where:  { locationId: location.id },
    create: { tenantId, locationId: location.id, tunnelUrl, isActive: true },
    update: { tunnelUrl, isActive: true, lastSeen: new Date() },
  });

  console.log(`[tunnel-register] Tenant ${tenantId} → ${tunnelUrl}`);
  return NextResponse.json({ ok: true });
}

// El agente también puede marcar el tunnel como inactivo al cerrar
export async function DELETE(req: NextRequest) {
  const auth  = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Token requerido" }, { status: 401 });

  const allSettings = await prisma.tenantSettings.findMany({
    select: { tenantId: true, agentToken: true },
  });
  const settings = allSettings.find(s => s.agentToken && safeTokenCompare(s.agentToken, token));
  if (!settings) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  await prisma.agentTunnel.updateMany({
    where: { tenantId: settings.tenantId },
    data:  { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
