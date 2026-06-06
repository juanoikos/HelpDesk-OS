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

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace("Bearer ", "").trim();

  if (!token) return NextResponse.json({ error: "Token requerido" }, { status: 401 });

  const settings = await prisma.tenantSettings.findFirst({
    where: { agentToken: token },
    select: { tenantId: true },
  });
  if (!settings) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  const tenantId = settings.tenantId;

  let body: { tunnelUrl?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const { tunnelUrl } = body;
  // Solo aceptar URLs de Cloudflare Tunnel — previene SSRF por tunnel malicioso
  const TUNNEL_RE = /^https:\/\/[\w-]+\.trycloudflare\.com$/;
  if (!tunnelUrl || !TUNNEL_RE.test(tunnelUrl)) {
    return NextResponse.json({ error: "tunnelUrl inválida — solo se aceptan dominios *.trycloudflare.com" }, { status: 400 });
  }

  await prisma.agentTunnel.upsert({
    where:  { tenantId },
    create: { tenantId, tunnelUrl, isActive: true },
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

  const settings = await prisma.tenantSettings.findFirst({
    where: { agentToken: token },
    select: { tenantId: true },
  });
  if (!settings) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  await prisma.agentTunnel.updateMany({
    where: { tenantId: settings.tenantId },
    data:  { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
