import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";
import { randomUUID } from "crypto";

interface DeviceInput {
  ip: string;
  mac?: string;
  vendor?: string;
  hostname?: string;
  deviceType?: string;
  openPorts?: number[];
  httpTitle?: string;
  onvif?: boolean;
}

interface ScanBody {
  scannedFrom: string;
  subnet?: string;
  scanDuration?: number;
  devices: DeviceInput[];
}

// El agente PS1 serializa un array de un solo puerto como número suelto (no [n]),
// así que openPorts puede llegar como number[], un number, null o undefined.
function normalizePorts(openPorts: unknown): number[] {
  if (Array.isArray(openPorts)) return openPorts.filter((p): p is number => typeof p === "number");
  if (typeof openPorts === "number") return [openPorts];
  return [];
}

export async function POST(req: NextRequest) {
  // ── Autenticación ───────────────────────────────────────────────────────────────
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

  // ── Parsear body ────────────────────────────────────────────────────────────────────
  let body: ScanBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { scannedFrom, subnet, devices } = body;

  if (!scannedFrom || !Array.isArray(devices)) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  // ── Generar scanId ───────────────────────────────────────────────────────────
  const scanId = randomUUID();
  const now = new Date();

  // ── Upsert cada dispositivo ─────────────────────────────────────────────────────
  let upsertCount = 0;
  for (const device of devices) {
    if (!device.ip) continue;

    try {
      await prisma.networkDevice.upsert({
        where: {
          tenantId_ip: { tenantId, ip: device.ip },
        },
        create: {
          tenantId,
          scanId,
          scannedFrom,
          subnet:     subnet ?? null,
          ip:         device.ip,
          mac:        device.mac ?? null,
          vendor:     device.vendor ?? null,
          hostname:   device.hostname ?? null,
          deviceType: device.deviceType ?? "unknown",
          openPorts:  normalizePorts(device.openPorts),
          httpTitle:  device.httpTitle ?? null,
          onvif:      device.onvif ?? false,
          lastSeenAt: now,
          createdAt:  now,
        },
        update: {
          scanId,
          scannedFrom,
          subnet:     subnet ?? null,
          mac:        device.mac ?? null,
          vendor:     device.vendor ?? null,
          hostname:   device.hostname ?? null,
          deviceType: device.deviceType ?? "unknown",
          openPorts:  normalizePorts(device.openPorts),
          httpTitle:  device.httpTitle ?? null,
          onvif:      device.onvif ?? false,
          lastSeenAt: now,
        },
      });
      upsertCount++;
    } catch (err) {
      // Continuar con el siguiente dispositivo si uno falla
      console.error(`Error upserting device ${device.ip}:`, err);
    }
  }

  // ── Auto-registrar DVRs/NVRs detectados ─────────────────────────────────────
  const dvrDevices = devices.filter(d => d.ip && d.deviceType === "dvr_nvr");
  let dvrCount = 0;
  for (const d of dvrDevices) {
    try {
      const existing = await prisma.dvr.findFirst({ where: { tenantId, ip: d.ip } });
      if (!existing) {
        await prisma.dvr.create({
          data: {
            tenantId,
            ip:       d.ip,
            port:     80,
            channels: 8,
            name:     d.hostname ?? d.vendor ?? `DVR ${d.ip}`,
            address:  subnet ?? null,
            status:   "ONLINE",
            lastChecked: now,
          },
        });
        dvrCount++;
      } else {
        // Actualizar status a ONLINE si ya existía
        await prisma.dvr.update({
          where: { id: existing.id },
          data:  { status: "ONLINE", lastChecked: now },
        });
      }
    } catch (err) {
      console.error(`Error auto-registrando DVR ${d.ip}:`, err);
    }
  }

  return NextResponse.json(
    { scanId, deviceCount: upsertCount, dvrsRegistered: dvrCount },
    { status: 200 }
  );
}
