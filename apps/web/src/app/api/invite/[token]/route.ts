import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

// ─── GET /api/invite/[token] ─ validate token ─────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const invitation = await prisma.userInvitation.findUnique({
    where:   { token },
    include: {
      tenant: { select: { name: true } },
    },
  });

  if (!invitation) {
    return NextResponse.json({ error: "Enlace de invitación inválido." }, { status: 404 });
  }

  if (invitation.usedAt) {
    return NextResponse.json({ error: "Esta invitación ya fue utilizada." }, { status: 410 });
  }

  if (invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "La invitación ha expirado." }, { status: 410 });
  }

  let groupName: string | null = null;
  if (invitation.groupId) {
    const group = await prisma.group.findUnique({
      where:  { id: invitation.groupId },
      select: { name: true },
    });
    groupName = group?.name ?? null;
  }

  return NextResponse.json({
    name:       invitation.name,
    email:      invitation.email,
    tenantName: invitation.tenant.name,
    groupName,
  });
}

// ─── POST /api/invite/[token] ─ accept invitation ────────────────────────────

const acceptSchema = z.object({
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  name:     z.string().min(2).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const body = await req.json().catch(() => null);
  const parsed = acceptSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const invitation = await prisma.userInvitation.findUnique({
    where:   { token },
    include: { tenant: { select: { id: true, name: true } } },
  });

  if (!invitation) {
    return NextResponse.json({ error: "Enlace de invitación inválido." }, { status: 404 });
  }

  if (invitation.usedAt) {
    return NextResponse.json({ error: "Esta invitación ya fue utilizada." }, { status: 410 });
  }

  if (invitation.expiresAt < new Date()) {
    return NextResponse.json({ error: "La invitación ha expirado." }, { status: 410 });
  }

  // Check that no user with that email already exists in the tenant
  const existing = await prisma.user.findUnique({
    where: { tenantId_email: { tenantId: invitation.tenantId, email: invitation.email } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Ya existe una cuenta con ese correo en este tenant." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const finalName    = parsed.data.name?.trim() || invitation.name;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        tenantId:     invitation.tenantId,
        email:        invitation.email,
        name:         finalName,
        role:         invitation.role,
        passwordHash,
      },
    });

    if (invitation.groupId) {
      await tx.groupMember.create({
        data: { groupId: invitation.groupId, userId: user.id },
      });
    }

    await tx.userInvitation.update({
      where: { id: invitation.id },
      data:  { usedAt: new Date() },
    });
  });

  return NextResponse.json({ ok: true });
}
