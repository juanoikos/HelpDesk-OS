import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { uploadToR2 } from "@/lib/r2";
import { randomUUID } from "crypto";

const MAX_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED  = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const tenantId = session.user.tenantId;
  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return NextResponse.json({ error: "Formato inválido" }, { status: 400 }); }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No se recibió archivo" }, { status: 400 });
  if (file.size > MAX_SIZE) return NextResponse.json({ error: "Máximo 20 MB" }, { status: 400 });

  const mime = file.type || "image/png";
  if (!ALLOWED.includes(mime)) return NextResponse.json({ error: `Tipo no permitido: ${mime}` }, { status: 400 });

  const ext    = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const key    = `${tenantId}/emaps/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const url    = await uploadToR2(key, buffer, mime);

  return NextResponse.json({ url }, { status: 201 });
}
