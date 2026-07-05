import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";

const BASELINE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 días

// GET /api/agent/inventory-check?hostname=<COMPUTERNAME>
// Chequeo liviano que la tarea programada llama cada 15 min: decide si vale la
// pena correr el escaneo completo de hardware (barato — un solo findFirst).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = auth.slice(7);

  const settings = await prisma.tenantSettings.findFirst({ where: { agentToken: token } });
  if (!settings) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  const hostname = req.nextUrl.searchParams.get("hostname") ?? "";
  const tenantId = settings.tenantId;

  const asset = await prisma.asset.findFirst({
    where:  { tenantId, hostname },
    select: { refreshRequestedAt: true, lastSeenAt: true },
  });

  const stale = !asset?.lastSeenAt || Date.now() - asset.lastSeenAt.getTime() > BASELINE_MAX_AGE_MS;
  const shouldRun = !asset || !!asset.refreshRequestedAt || stale;

  return NextResponse.json({ shouldRun }, { status: 200 });
}
