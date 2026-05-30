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
SQL

echo "▶ Iniciando HelpDesk OS..."
HOSTNAME=0.0.0.0 node apps/web/.next/standalone/apps/web/server.js
