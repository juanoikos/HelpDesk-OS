import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadToR2 } from "@/lib/r2";
import { prisma } from "@helpdesk-os/db";
import { randomUUID } from "crypto";

const MAX_SIZE   = 10 * 1024 * 1024; // 10 MB
const ALLOWED_TYPES = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "application/zip",
];

export async function POST(req: NextRequest) {
  // Autenticación
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const tenantId = session.user.tenantId;
  if (!tenantId) {
    return NextResponse.json({ error: "Tenant no encontrado" }, { status: 401 });
  }

  // Leer FormData
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Formato de request inválido" }, { status: 400 });
  }

  const file     = formData.get("file") as File | null;
  const ticketId = formData.get("ticketId") as string | null;

  if (!file)     return NextResponse.json({ error: "No se recibió archivo" },     { status: 400 });
  if (!ticketId) return NextResponse.json({ error: "ticketId es requerido" },     { status: 400 });

  // Validar tamaño
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "El archivo supera el límite de 10 MB" }, { status: 400 });
  }

  // Validar tipo MIME
  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return NextResponse.json(
      { error: `Tipo de archivo no permitido: ${mimeType}` },
      { status: 400 },
    );
  }

  // Verificar que el ticket pertenece al tenant del usuario
  const ticket = await prisma.ticket.findFirst({
    where:  { id: ticketId, tenantId },
    select: { id: true },
  });
  if (!ticket) {
    return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
  }

  // Construir clave única en R2: tenant/ticketId/uuid.ext
  const ext = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase().slice(0, 10)
    : "bin";
  const key = `${tenantId}/${ticketId}/${randomUUID()}.${ext}`;

  // Subir a R2
  const buffer = Buffer.from(await file.arrayBuffer());
  let url: string;
  try {
    url = await uploadToR2(key, buffer, mimeType);
  } catch (err) {
    console.error("[upload] R2 error:", err);
    return NextResponse.json(
      { error: "Error al subir el archivo — revisa la configuración de R2" },
      { status: 500 },
    );
  }

  // Guardar registro en BD
  const attachment = await prisma.ticketAttachment.create({
    data: { ticketId, name: file.name, key, url, size: file.size, mimeType },
  });

  return NextResponse.json(attachment, { status: 201 });
}
