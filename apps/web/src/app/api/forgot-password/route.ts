import { NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";
import { z } from "zod";
import crypto from "crypto";
import { sendPasswordReset } from "@/lib/email";

const schema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Correo inválido" }, { status: 400 });
  }

  const { email } = parsed.data;

  // Siempre respondemos OK para no revelar si el email existe
  const user = await prisma.user.findFirst({ where: { email } });
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await prisma.passwordResetToken.create({
      data: { token, email, expiresAt },
    });

    await sendPasswordReset({ email, name: user.name, token });
  }

  return NextResponse.json({ ok: true });
}
