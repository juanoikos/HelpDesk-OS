CREATE TABLE "agent_tunnels" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "tunnelUrl" TEXT NOT NULL,
    "lastSeen"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_tunnels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_tunnels_tenantId_key" ON "agent_tunnels"("tenantId");

ALTER TABLE "agent_tunnels" ADD CONSTRAINT "agent_tunnels_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
