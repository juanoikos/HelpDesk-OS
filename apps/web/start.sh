#!/bin/sh
set -e

echo "▶ Aplicando migraciones de base de datos..."
npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

echo "▶ Sincronizando enums y columnas..."
npx prisma db execute --schema=packages/db/prisma/schema.prisma --stdin <<'SQL'
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'NEW';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'ASSIGNED';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'IN_DIAGNOSIS';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'IN_ANALYSIS';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'PENDING_USER';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'PENDING_PROVIDER';
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'ESCALATED';

ALTER TYPE "ChannelType" ADD VALUE IF NOT EXISTS 'TEAMS';

DO $$ BEGIN CREATE TYPE "TicketType" AS ENUM ('INCIDENT','REQUEST','ACCESS_PERMISSIONS','PURCHASE','QUERY','PROBLEM','CHANGE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ImpactLevel" AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "type" "TicketType" NOT NULL DEFAULT 'INCIDENT';
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "impact" "ImpactLevel" NOT NULL DEFAULT 'LOW';
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "subcategory" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "area" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "affectedSystem" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "appVersion" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "siteType" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "requesterName" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "requesterContact" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "equipmentName" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "deviceType" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "deviceDetail" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "solution" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "slaDeadline" TIMESTAMP(3);
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "slaBreached" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "techCategory" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "affectedAsset" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "assignedGroup" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "urgency" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "diagnosis" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "whatNeeded" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "affectedService" TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "createdFromUserView" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tickets" ALTER COLUMN "status" SET DEFAULT 'NEW';

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailSignature" TEXT;

ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "assetNumber" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "location" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "hostname" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "macAddress" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "osName" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "cpu" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "ramGB" INTEGER;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "diskInfo" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "motherboard" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "agentVersion" TEXT;
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "assets" ADD COLUMN IF NOT EXISTS "hardwareData" JSONB;
ALTER TABLE "tenant_settings" ADD COLUMN IF NOT EXISTS "agentToken" TEXT;

CREATE TABLE IF NOT EXISTS "dvr_credentials" (
  "id"        TEXT         NOT NULL,
  "tenantId"  TEXT         NOT NULL,
  "username"  TEXT         NOT NULL DEFAULT 'admin',
  "password"  TEXT         NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dvr_credentials_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dvr_credentials_tenantId_key" UNIQUE ("tenantId"),
  CONSTRAINT "dvr_credentials_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

DO $$ BEGIN CREATE TYPE "DvrStatus" AS ENUM ('ONLINE','OFFLINE','UNKNOWN'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "dvrs" (
  "id"          TEXT         NOT NULL,
  "tenantId"    TEXT         NOT NULL,
  "name"        TEXT         NOT NULL,
  "ip"          TEXT         NOT NULL,
  "port"        INTEGER      NOT NULL DEFAULT 80,
  "channels"    INTEGER      NOT NULL DEFAULT 8,
  "location"    TEXT,
  "notes"       TEXT,
  "status"      "DvrStatus"  NOT NULL DEFAULT 'UNKNOWN',
  "lastChecked" TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dvrs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "dvrs_tenantId_ip_key" UNIQUE ("tenantId", "ip"),
  CONSTRAINT "dvrs_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "dvrs" ADD COLUMN IF NOT EXISTS "localIp"   TEXT;
ALTER TABLE "dvrs" ADD COLUMN IF NOT EXISTS "username"  TEXT;
ALTER TABLE "dvrs" ADD COLUMN IF NOT EXISTS "password"  TEXT;

CREATE TABLE IF NOT EXISTS "ticket_attachments" (
  "id"        TEXT         NOT NULL,
  "ticketId"  TEXT         NOT NULL,
  "name"      TEXT         NOT NULL,
  "key"       TEXT         NOT NULL,
  "url"        TEXT         NOT NULL,
  "size"       INTEGER      NOT NULL,
  "mimeType"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ticket_attachments_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "canned_responses" (
  "id"        TEXT         NOT NULL,
  "tenantId"  TEXT         NOT NULL,
  "title"     TEXT         NOT NULL,
  "body"      TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "canned_responses_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "network_devices" (
  "id"          TEXT         NOT NULL,
  "tenantId"    TEXT         NOT NULL,
  "scanId"      TEXT         NOT NULL,
  "scannedFrom" TEXT         NOT NULL,
  "subnet"      TEXT,
  "ip"          TEXT         NOT NULL,
  "mac"         TEXT,
  "vendor"      TEXT,
  "hostname"    TEXT,
  "deviceType"  TEXT         NOT NULL DEFAULT 'unknown',
  "openPorts"   JSONB,
  "httpTitle"   TEXT,
  "onvif"       BOOLEAN      NOT NULL DEFAULT false,
  "lastSeenAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "network_devices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "network_devices_tenantId_ip_key" UNIQUE ("tenantId", "ip"),
  CONSTRAINT "network_devices_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
SQL

echo "▶ Iniciando HelpDesk OS..."
HOSTNAME=0.0.0.0 node apps/web/.next/standalone/apps/web/server.js
