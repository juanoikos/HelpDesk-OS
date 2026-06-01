import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = auth.slice(7);

  const settings = await prisma.tenantSettings.findFirst({
    where: { agentToken: token },
  });
  if (!settings) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  const tenantId = settings.tenantId;
  const body = await req.json();
  const {
    hostname,
    username,
    ipAddress,
    macAddress,
    osName,
    cpu,
    ramGB,
    diskInfo,
    motherboard,
    agentVersion,
    assetType,
    hardwareData,
  } = body;

  // Upsert by tenantId + hostname
  const existing = await prisma.asset.findFirst({ where: { tenantId, hostname } });

  const data = {
    tenantId,
    name:         hostname ?? "Equipo desconocido",
    type:         (assetType === "LAPTOP" ? "LAPTOP" : "DESKTOP") as "LAPTOP" | "DESKTOP",
    status:       "ACTIVE" as const,
    hostname,
    username,
    ipAddress,
    macAddress,
    osName,
    cpu,
    ramGB:        ramGB != null ? parseInt(String(ramGB)) : null,
    diskInfo,
    motherboard,
    agentVersion,
    lastSeenAt:   new Date(),
    hardwareData: hardwareData
      ? typeof hardwareData === "string"
        ? JSON.parse(hardwareData)
        : hardwareData
      : undefined,
  };

  let asset;
  if (existing) {
    asset = await prisma.asset.update({ where: { id: existing.id }, data });
  } else {
    asset = await prisma.asset.create({ data });
  }

  return NextResponse.json({ id: asset.id, name: asset.name }, { status: 200 });
}
