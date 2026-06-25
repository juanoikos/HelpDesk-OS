import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
  if (!rateLimit(ip, "reset-password", 5, 15 * 60 * 1000)) {
    return NextResponse.json(
      { error: "Demasiados intentos. Espera 15 minutos." },
      { status: 429 }
    );
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { token, password } = parsed.data;

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
  });

  if (!resetToken) {
    return NextResponse.json(
      { error: "El enlace es inválido o ya fue usado." },
      { status: 400 }
    );
  }

  if (resetToken.usedAt) {
    return NextResponse.json(
      { error: "Este enlace ya fue utilizado. Solicita uno nuevo." },
      { status: 400 }
    );
  }

  if (resetToken.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "El enlace expiró. Solicita uno nuevo." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findFirst({
    where: { email: resetToken.email },
  });

  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { token },
      data: { usedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
