import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";
import crypto from "crypto";

const ENC_KEY = (process.env.AUTH_SECRET ?? "helpdesk-dvr-secret-key-32chars!").slice(0, 32);
function decrypt(text: string): string {
  const [ivHex, encHex] = text.split(":");
  const iv  = Buffer.from(ivHex, "hex");
  const enc = Buffer.from(encHex, "hex");
  const d   = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENC_KEY), iv);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// GET — el agente C# hace polling aquí para obtener trabajos pendientes
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = auth.slice(7);

  const settings = await prisma.tenantSettings.findFirst({ where: { agentToken: token } });
  if (!settings) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  const tenantId = settings.tenantId;

  // Buscar jobs pendientes con serial configurado
  const jobs = await prisma.dvrScanJob.findMany({
    where: {
      tenantId,
      status: { in: ["pending", "error"] },
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "asc" },
    take: 5,
  });

  if (jobs.length === 0) return NextResponse.json([]);

  // Enriquecer con datos del DVR y credenciales
  const result = await Promise.all(jobs.map(async (job) => {
    const dvr  = await prisma.dvr.findFirst({ where: { id: job.dvrId, tenantId } });
    if (!dvr?.serial) return null; // Solo trabajos con serial (P2P)

    // Resolver credenciales
    let username = "admin";
    let password = "";
    if (dvr.username && dvr.password) {
      username = dvr.username;
      password = decrypt(dvr.password);
    } else {
      const cred = await prisma.dvrCredential.findUnique({ where: { tenantId } });
      if (cred) { username = cred.username; password = decrypt(cred.password); }
    }

    return {
      id:        job.id,
      dvrName:   dvr.name,
      serial:    dvr.serial,
      username,
      password,
      channels:  job.channels as number[],
      date:      job.date,
      startTime: job.startTime,
      endTime:   job.endTime,
    };
  }));

  return NextResponse.json(result.filter(Boolean));
}
