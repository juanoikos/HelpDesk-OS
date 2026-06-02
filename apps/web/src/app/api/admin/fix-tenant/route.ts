// ENDPOINT TEMPORAL — eliminar después de ejecutar
import { NextResponse } from "next/server";
import { prisma } from "@helpdesk-os/db";

export async function GET() {
  const CORRECT_TENANT = "cmpqym8gm0002oz1b9u3ewgh8"; // D&C Computer SAS
  const CAMILO_EMAIL   = "camilo.morales@dyccomputersas.com";

  // Encontrar TODOS los usuarios con ese email
  const users = await prisma.user.findMany({
    where:   { email: CAMILO_EMAIL },
    include: { tenant: true },
    orderBy: { createdAt: "asc" },
  });

  if (users.length === 0) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  // Encontrar la cuenta en DYC (la que usa actualmente) y copiar su passwordHash a D&C
  const dycAccount = users.find(u => u.tenantId !== CORRECT_TENANT);
  const dncAccount = users.find(u => u.tenantId === CORRECT_TENANT);

  if (!dycAccount) {
    return NextResponse.json({ message: "Camilo ya está solo en D&C Computer SAS", users: users.map(u => ({ id: u.id, tenant: u.tenant.name })) });
  }

  if (!dncAccount) {
    // Camilo no tiene cuenta en D&C — mover la de DYC
    await prisma.user.update({
      where: { id: dycAccount.id },
      data:  { tenantId: CORRECT_TENANT },
    });
    return NextResponse.json({ action: "moved_to_dnc", userId: dycAccount.id });
  }

  // Tiene ambas cuentas: copiar el passwordHash de DYC al D&C y actualizar assets
  if (dycAccount.passwordHash) {
    await prisma.user.update({
      where: { id: dncAccount.id },
      data:  { passwordHash: dycAccount.passwordHash },
    });
  }

  // Mover activos del tenant DYC al D&C (si los hay)
  const dycTenantId = dycAccount.tenantId;
  const movedAssets = await prisma.asset.updateMany({
    where: { tenantId: dycTenantId, hostname: { not: null } },
    data:  { tenantId: CORRECT_TENANT },
  });

  // Cambiar el tenantId del DYC account a D&C para que sea la misma cuenta
  await prisma.user.update({
    where: { id: dycAccount.id },
    data:  { tenantId: CORRECT_TENANT, email: dycAccount.email + ".OLD" },
  });

  return NextResponse.json({
    action:      "merged",
    dncAccount:  dncAccount.id,
    dycAccount:  dycAccount.id,
    movedAssets: movedAssets.count,
    message:     "Camilo ahora entra a D&C Computer SAS. Elimina este endpoint.",
  });
}
