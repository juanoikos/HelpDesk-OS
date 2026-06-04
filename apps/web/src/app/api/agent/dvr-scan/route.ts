import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";

export async function POST(req: NextRequest) {
  // Auth con agent token del tenant
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = auth.slice(7);

  const settings = await prisma.tenantSettings.findFirst({ where: { agentToken: token } });
  if (!settings) return NextResponse.json({ error: "Token inválido" }, { status: 401 });

  let body: { jobId: string; recordings?: unknown[]; error?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }

  const job = await prisma.dvrScanJob.findFirst({
    where: { id: body.jobId, tenantId: settings.tenantId },
  });
  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
  if (job.status !== "pending") return NextResponse.json({ error: "Job ya procesado" }, { status: 409 });

  if (body.error) {
    await prisma.dvrScanJob.update({
      where: { id: job.id },
      data:  { status: "error", error: body.error },
    });
    return NextResponse.json({ ok: true });
  }

  await prisma.dvrScanJob.update({
    where: { id: job.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data:  { status: "done", results: (body.recordings ?? []) as any },
  });

  return NextResponse.json({ ok: true, count: (body.recordings ?? []).length });
}
