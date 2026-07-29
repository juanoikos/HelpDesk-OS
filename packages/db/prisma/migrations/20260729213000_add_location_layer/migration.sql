-- ============================================================================
-- Migración: capa de Location (Sede) entre Tenant y Dvr/AgentTunnel
-- IMPORTANTE: a diferencia del SQL que genera Prisma automáticamente, este
-- archivo fue editado a mano para NO perder datos existentes:
--   - "dvrs.location" se RENOMBRA a "dvrs.address" (no se hace DROP+ADD)
--   - se hace backfill de una Location "Sede Principal" por cada tenant que
--     ya tenga un Dvr o un AgentTunnel, y se re-apunta esos registros a ella
-- ============================================================================

-- 1) Crear tabla locations
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT,
    "hasVpn" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "locations_tenantId_idx" ON "locations"("tenantId");

ALTER TABLE "locations" ADD CONSTRAINT "locations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2) Renombrar dvrs.location -> dvrs.address (preserva los datos, no es drop+add)
ALTER TABLE "dvrs" RENAME COLUMN "location" TO "address";

-- 3) Agregar columnas locationId (nullable por ahora, se llenan en el backfill)
ALTER TABLE "dvrs" ADD COLUMN "locationId" TEXT;
ALTER TABLE "agent_tunnels" ADD COLUMN "locationId" TEXT;

-- 4) Backfill: una Location "Sede Principal" por cada tenant que ya tenga
--    al menos un Dvr o un AgentTunnel (los tenants sin ninguno de los dos
--    no reciben Location — se crean cuando el usuario registre su primera sede)
INSERT INTO "locations" ("id", "tenantId", "name", "updatedAt")
SELECT
  'loc_backfill_' || t."id",
  t."id",
  'Sede Principal',
  CURRENT_TIMESTAMP
FROM "tenants" t
WHERE EXISTS (SELECT 1 FROM "dvrs" d WHERE d."tenantId" = t."id")
   OR EXISTS (SELECT 1 FROM "agent_tunnels" a WHERE a."tenantId" = t."id");

-- 5) Re-apuntar dvrs y agent_tunnels existentes a la Location recién creada de su tenant
UPDATE "dvrs" d
SET "locationId" = l."id"
FROM "locations" l
WHERE l."tenantId" = d."tenantId";

UPDATE "agent_tunnels" a
SET "locationId" = l."id"
FROM "locations" l
WHERE l."tenantId" = a."tenantId";

-- 6) Foreign keys de las columnas nuevas
ALTER TABLE "dvrs" ADD CONSTRAINT "dvrs_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "agent_tunnels" ADD CONSTRAINT "agent_tunnels_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 7) Índices nuevos
CREATE INDEX "dvrs_locationId_idx" ON "dvrs"("locationId");
CREATE INDEX "agent_tunnels_tenantId_idx" ON "agent_tunnels"("tenantId");

-- 8) Mover el unique constraint de AgentTunnel: de tenantId a locationId
--    (ahora un tenant puede tener varios AgentTunnel, uno por sede;
--     pero cada sede sigue teniendo como máximo un túnel activo)
DROP INDEX "agent_tunnels_tenantId_key";
CREATE UNIQUE INDEX "agent_tunnels_locationId_key" ON "agent_tunnels"("locationId");
