import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@helpdesk-os/db";
import crypto from "crypto";

const ENC_KEY = (process.env.AUTH_SECRET ?? "helpdesk-dvr-secret-key-32chars!").slice(0, 32);

function decrypt(text: string): string {
  const [ivHex, encHex] = text.split(":");
  const iv  = Buffer.from(ivHex,  "hex");
  const enc = Buffer.from(encHex, "hex");
  const d   = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENC_KEY), iv);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const dvrId    = searchParams.get("dvrId");
  const filePath = searchParams.get("filePath");

  if (!dvrId || !filePath) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const tenantId = session.user.tenantId;
  const [dvr, cred] = await Promise.all([
    prisma.dvr.findFirst({ where: { id: dvrId, tenantId } }),
    prisma.dvrCredential.findUnique({ where: { tenantId } }),
  ]);

  if (!dvr || !cred) {
    return NextResponse.json({ error: "DVR no encontrado o sin credenciales" }, { status: 404 });
  }

  const password = decrypt(cred.password);
  const b64      = Buffer.from(`${cred.username}:${password}`).toString("base64");

  // Construir URL de descarga Dahua
  const downloadUrl = `http://${dvr.ip}:${dvr.port}/RPC_Loadfile${filePath}`;

  try {
    const ctrl = new AbortController();
    const t    = setTimeout(() => ctrl.abort(), 30000);

    const upstream = await fetch(downloadUrl, {
      signal:  ctrl.signal,
      headers: { Authorization: `Basic ${b64}` },
    });
    clearTimeout(t);

    if (!upstream.ok) {
      return NextResponse.json({ error: `DVR respondió ${upstream.status}` }, { status: 502 });
    }

    // Nombre del archivo desde filePath
    const fileName = filePath.split("/").pop() ?? "grabacion.mp4";

    // Hacer streaming del archivo al cliente
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type":        upstream.headers.get("Content-Type") ?? "video/mp4",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length":      upstream.headers.get("Content-Length") ?? "",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: `Error al descargar: ${String(e)}` }, { status: 500 });
  }
}
