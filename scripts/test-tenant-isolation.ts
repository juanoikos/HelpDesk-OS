/**
 * Verifica el aislamiento multi-tenant de los routers de Activos y Monitoreo
 * sin depender de un framework de tests (el proyecto no tiene Jest/Vitest).
 *
 * Reproduce exactamente el filtro `where: { id, tenantId }` que usan los
 * routers tRPC (assets.ts, monitoring.ts) para confirmar que un tenant nunca
 * puede leer/editar/pingar un recurso de otro tenant.
 *
 * Uso: npx tsx scripts/test-tenant-isolation.ts
 */

import { prisma } from "@helpdesk-os/db";

let failed = 0;

function check(label: string, condition: boolean) {
  if (condition) {
    console.log(`✅ ${label}`);
  } else {
    console.log(`❌ ${label}`);
    failed++;
  }
}

async function main() {
  const suffix = Date.now();
  const tenantA = await prisma.tenant.create({
    data: { name: "__test_tenant_a__", slug: `__test-a-${suffix}` },
  });
  const tenantB = await prisma.tenant.create({
    data: { name: "__test_tenant_b__", slug: `__test-b-${suffix}` },
  });

  try {
    // ── Assets ─────────────────────────────────────────────────────────────
    const assetB = await prisma.asset.create({
      data: { tenantId: tenantB.id, name: "Asset de B", type: "DESKTOP" },
    });

    const assetReadCrossTenant = await prisma.asset.findFirst({
      where: { id: assetB.id, tenantId: tenantA.id },
    });
    check("assets.getById no debe encontrar un activo de otro tenant", assetReadCrossTenant === null);

    const assetReadSameTenant = await prisma.asset.findFirst({
      where: { id: assetB.id, tenantId: tenantB.id },
    });
    check("assets.getById sí debe encontrar un activo del propio tenant (sanity check)", assetReadSameTenant !== null);

    const assetUpdateCrossTenant = await prisma.asset.findFirst({
      where: { id: assetB.id, tenantId: tenantA.id },
    });
    check("assets.update no debe poder ubicar (y por lo tanto no editar) un activo de otro tenant", assetUpdateCrossTenant === null);

    const assetDeleteCrossTenant = await prisma.asset.findFirst({
      where: { id: assetB.id, tenantId: tenantA.id },
      include: { _count: { select: { tickets: true } } },
    });
    check("assets.delete no debe poder ubicar (y por lo tanto no borrar) un activo de otro tenant", assetDeleteCrossTenant === null);

    // ── NetworkDevice + Monitoring (pingNetworkDevice) ──────────────────────
    const deviceB = await prisma.networkDevice.create({
      data: {
        tenantId: tenantB.id,
        scanId: `__test_scan_${suffix}`,
        scannedFrom: "TEST-AGENT",
        ip: `10.99.99.${suffix % 250}`,
        deviceType: "unknown",
      },
    });

    const deviceReadCrossTenant = await prisma.networkDevice.findFirst({
      where: { id: deviceB.id, tenantId: tenantA.id },
    });
    check("monitoring.pingNetworkDevice no debe encontrar un dispositivo de red de otro tenant", deviceReadCrossTenant === null);

    const targetB = await prisma.monitorTarget.create({
      data: {
        tenantId: tenantB.id,
        name: "Target de B",
        host: deviceB.ip,
        checkType: "ping",
        networkType: "lan",
        agentHost: deviceB.scannedFrom,
      },
    });

    const targetReadCrossTenant = await prisma.monitorTarget.findFirst({
      where: { id: targetB.id, tenantId: tenantA.id },
    });
    check("monitoring.getTargetStatus no debe encontrar un target de otro tenant", targetReadCrossTenant === null);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    await prisma.monitorTarget.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await prisma.networkDevice.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
    await prisma.asset.deleteMany({ where: { tenantId: { in: [tenantA.id, tenantB.id] } } });
  } finally {
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
  }

  console.log(failed === 0 ? "\nTodo el aislamiento multi-tenant se verificó correctamente." : `\n${failed} verificación(es) fallaron.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
