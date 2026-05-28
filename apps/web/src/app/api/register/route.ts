import { NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const schema = z.object({
  companyName: z.string().min(2, "Mínimo 2 caracteres"),
  name: z.string().min(2, "Mínimo 2 caracteres"),
  email: z.string().email("Correo inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = schema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    );
  }

  const { companyName, name, email, password } = parsed.data;

  const existingUser = await prisma.user.findFirst({ where: { email } });
  if (existingUser) {
    return NextResponse.json(
      { error: "Este correo ya está registrado" },
      { status: 400 }
    );
  }

  const slug = companyName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  const existingTenant = await prisma.tenant.findUnique({ where: { slug } });
  if (existingTenant) {
    return NextResponse.json(
      { error: "Ya existe una empresa con ese nombre" },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.tenant.create({
    data: {
      name: companyName,
      slug,
      users: {
        create: {
          email,
          name,
          role: "ADMIN",
          passwordHash,
        },
      },
    },
  });

  return NextResponse.json({ ok: true });
}
