CREATE TABLE "emaps" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "imageUrl"  TEXT NOT NULL,
    "order"     INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "emaps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emap_devices" (
    "id"      TEXT NOT NULL,
    "emapId"  TEXT NOT NULL,
    "dvrId"   TEXT NOT NULL,
    "channel" INTEGER NOT NULL,
    "x"       DOUBLE PRECISION NOT NULL,
    "y"       DOUBLE PRECISION NOT NULL,
    "label"   TEXT,
    CONSTRAINT "emap_devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "emap_devices_emapId_dvrId_channel_key" ON "emap_devices"("emapId", "dvrId", "channel");

ALTER TABLE "emaps"       ADD CONSTRAINT "emaps_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "emap_devices" ADD CONSTRAINT "emap_devices_emapId_fkey"
  FOREIGN KEY ("emapId") REFERENCES "emaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "emap_devices" ADD CONSTRAINT "emap_devices_dvrId_fkey"
  FOREIGN KEY ("dvrId") REFERENCES "dvrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
