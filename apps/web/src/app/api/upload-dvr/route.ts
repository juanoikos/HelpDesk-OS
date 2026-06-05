import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadToR2 } from "@/lib/r2";
import { prisma } from "@helpdesk-os/db";
import { randomUUID } from "crypto";

const MAX_SIZE      = 10 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = session.user.tenantId;
  if (!tenantId) return NextResponse.json({ error: "Tenant no encontrado" }, { status: 401 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Formato inválido" }, { status: 400 }); }

  const file  = formData.get("file")  as File   | null;
  const dvrId = formData.get("dvrId") as string | null;

  if (!file)  return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  if (!dvrId) return NextResponse.json({ error: "dvrId es requerido" },    { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "El archivo supera 10 MB" }, { status: 400 });

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.includes(mimeType))
    return NextResponse.json({ error: `Tipo no permitido: ${mimeType}` }, { status: 400 });

  const dvr = await prisma.dvr.findFirst({ where: { id: dvrId, tenantId }, select: { id: true } });
  if (!dvr) return NextResponse.json({ error: "DVR no encontrado" }, { status: 404 });

  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase().slice(0, 10) : "jpg";
  const key = `${tenantId}/dvrs/${dvrId}/${randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  let url: string;
  try { url = await uploadToR2(key, buffer, mimeType); }
  catch (err) {
    console.error("[upload-dvr] R2 error:", err);
    return NextResponse.json({ error: "Error al subir la foto — revisa la configuración de R2" }, { status: 500 });
  }

  await prisma.dvr.update({ where: { id: dvrId }, data: { photoUrl: url } });

  return NextResponse.json({ url }, { status: 201 });
}
