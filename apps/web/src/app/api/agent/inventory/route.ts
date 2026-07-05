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
    brand,
    model,
    serialNumber,
    agentVersion,
    assetType,
    hardwareData,
  } = body;

  // Upsert by tenantId + hostname
  const existing = await prisma.asset.findFirst({ where: { tenantId, hostname } });

  // No incluye "status": un admin puede haber marcado el activo como Retirado,
  // en Mantenimiento, etc. — el agente solo reporta hardware, nunca pisa ese estado.
  const data = {
    tenantId,
    name:         hostname ?? "Equipo desconocido",
    type:         (assetType === "LAPTOP" ? "LAPTOP" : "DESKTOP") as "LAPTOP" | "DESKTOP",
    hostname,
    username,
    ipAddress,
    macAddress,
    osName,
    cpu,
    ramGB:        ramGB != null ? parseInt(String(ramGB)) : null,
    diskInfo,
    motherboard,
    // Marca/Modelo/N. serie: el agente solo los completa si están vacíos —
    // si un admin ya los editó a mano, esa edición no se pisa en la próxima sync.
    brand:        existing?.brand        ?? (brand        || null),
    model:        existing?.model        ?? (model        || null),
    serialNumber: existing?.serialNumber ?? (serialNumber || null),
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
    asset = await prisma.asset.update({
      where: { id: existing.id },
      // La sync ya atendió cualquier pedido de "Actualizar ahora" pendiente.
      data:  { ...data, refreshRequestedAt: null },
    });
  } else {
    asset = await prisma.asset.create({ data: { ...data, status: "ACTIVE" } });
  }

  return NextResponse.json({ id: asset.id, name: asset.name }, { status: 200 });
}
