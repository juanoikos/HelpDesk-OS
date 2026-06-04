import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = session.user.tenantId;
  const settings = await prisma.tenantSettings.findUnique({ where: { tenantId } });

  const agentToken = settings?.agentToken ?? "SIN_TOKEN_GENERA_UNO_EN_ACTIVOS";
  const serverUrl  = process.env.AUTH_URL ?? "https://helpdesk-os-production.up.railway.app";

  const config = {
    ServerUrl:           serverUrl,
    AgentToken:          agentToken,
    PollIntervalSeconds: 10,
  };

  const json = JSON.stringify(config, null, 2);

  return new NextResponse(json, {
    headers: {
      "Content-Type":        "application/json",
      "Content-Disposition": 'attachment; filename="config.json"',
    },
  });
}
