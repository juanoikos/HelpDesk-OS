-- Índice en tenantId para la tabla dvrs
-- Evita full table scan en heartbeat, event subscriber y list queries
CREATE INDEX IF NOT EXISTS "dvrs_tenantId_idx" ON "dvrs"("tenantId");
