CREATE TABLE "dvr_alarms" (
    "id"           TEXT NOT NULL,
    "tenantId"     TEXT NOT NULL,
    "dvrId"        TEXT NOT NULL,
    "dvrName"      TEXT NOT NULL,
    "channel"      INTEGER NOT NULL,
    "code"         TEXT NOT NULL,
    "action"       TEXT NOT NULL DEFAULT 'Start',
    "eventData"    JSONB,
    "snapshotUrl"  TEXT,
    "ticketId"     TEXT,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dvr_alarms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dvr_alarms_tenantId_createdAt_idx" ON "dvr_alarms"("tenantId", "createdAt" DESC);
CREATE INDEX "dvr_alarms_dvrId_createdAt_idx"    ON "dvr_alarms"("dvrId",    "createdAt" DESC);

ALTER TABLE "dvr_alarms" ADD CONSTRAINT "dvr_alarms_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "dvr_alarms" ADD CONSTRAINT "dvr_alarms_dvrId_fkey"
  FOREIGN KEY ("dvrId") REFERENCES "dvrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
