import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";

// GET /api/agent/monitor-fetch?agentHost=<hostname>
// El agente LAN llama esto para obtener sus targets asignados.
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

  const agentHost = req.nextUrl.searchParams.get("agentHost") ?? "";

  // Devuelve targets LAN asignados a este agente (o todos los LAN si no hay asignación específica)
  const targets = await prisma.monitorTarget.findMany({
    where: {
      tenantId:    settings.tenantId,
      enabled:     true,
      networkType: "lan",
      OR: [
        { agentHost: agentHost },
        { agentHost: null },
        { agentHost: "" },
      ],
    },
    select: {
      id:        true,
      name:      true,
      host:      true,
      checkType: true,
      port:      true,
      httpPath:  true,
      interval:  true,
      timeout:   true,
      retries:   true,
    },
  });

  return NextResponse.json({ targets, agentHost }, { status: 200 });
}
