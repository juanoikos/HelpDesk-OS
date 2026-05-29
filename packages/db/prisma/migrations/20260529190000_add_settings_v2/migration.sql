-- Add parentId to categories for subcategories support
ALTER TABLE "categories" ADD COLUMN IF NOT EXISTS "parentId" TEXT;

ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "categories"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Create tenant_settings table
CREATE TABLE IF NOT EXISTS "tenant_settings" (
  "id"              TEXT    NOT NULL,
  "tenantId"        TEXT    NOT NULL,
  "userViewConfig"  JSONB   NOT NULL DEFAULT '{}',
  "agentViewConfig" JSONB   NOT NULL DEFAULT '{}',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_settings_tenantId_key" ON "tenant_settings"("tenantId");

ALTER TABLE "tenant_settings"
  ADD CONSTRAINT "tenant_settings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
