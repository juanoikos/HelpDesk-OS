import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";

interface CheckResult {
  targetId:   string;
  status:     "up" | "down" | "timeout";
  latency:    number | null;
  httpStatus: number | null;
  error:      string | null;
  checkedAt:  string;
  checkedBy:  string;
}

interface PushBody {
  results: CheckResult[];
}

// POST /api/agent/monitor-push
// El agente LAN envía los resultados de sus checks.
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = auth.slice(7);

  const settings = await prisma.tenantSettings.findFirst({ where: { agentToken: token } });
  if (!settings) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 });
  }

  const tenantId = settings.tenantId;

  let body: PushBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!Array.isArray(body.results)) {
    return NextResponse.json({ error: "Formato inválido" }, { status: 400 });
  }

  let saved = 0;
  const now = new Date();

  for (const r of body.results) {
    if (!r.targetId || !r.status) continue;

    // Validar que el target pertenece al tenant
    const target = await prisma.monitorTarget.findFirst({
      where: { id: r.targetId, tenantId },
    });
    if (!target) continue;

    try {
      // Guardar el check en el historial
      await prisma.monitorCheck.create({
        data: {
          tenantId,
          targetId:   r.targetId,
          status:     r.status,
          latency:    r.latency ?? null,
          httpStatus: r.httpStatus ?? null,
          error:      r.error ?? null,
          checkedAt:  r.checkedAt ? new Date(r.checkedAt) : now,
          checkedBy:  r.checkedBy ?? "agent",
        },
      });

      // Actualizar estado actual en el target
      await prisma.monitorTarget.update({
        where: { id: r.targetId },
        data: {
          status:      r.status,
          lastChecked: r.checkedAt ? new Date(r.checkedAt) : now,
          lastLatency: r.latency ?? null,
          lastError:   r.error ?? null,
        },
      });

      saved++;
    } catch (err) {
      console.error(`[monitor-push] Error saving check for ${r.targetId}:`, err);
    }
  }

  // Limpiar checks antiguos (>30 días) del tenant para no acumular indefinidamente
  await prisma.monitorCheck.deleteMany({
    where: {
      tenantId,
      checkedAt: { lt: new Date(Date.now() - 30 * 86400_000) },
    },
  }).catch(() => {});

  return NextResponse.json({ saved }, { status: 200 });
}
