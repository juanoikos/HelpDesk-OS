-- Migration: add_teams
-- Safe to run via `prisma db execute` (uses IF NOT EXISTS / IF NOT EXISTS checks)

-- ─── Create groups table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "groups" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "color"       TEXT DEFAULT '#3b82f6',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- ─── Create group_members table ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "group_members" (
    "groupId"   TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("groupId", "userId")
);

-- ─── Create user_invitations table ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "user_invitations" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "email"     TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "role"      TEXT NOT NULL DEFAULT 'AGENT',
    "groupId"   TEXT,
    "token"     TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt"    TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- ─── Unique constraints ───────────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'groups_tenantId_name_key'
    ) THEN
        ALTER TABLE "groups" ADD CONSTRAINT "groups_tenantId_name_key" UNIQUE ("tenantId", "name");
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_invitations_token_key'
    ) THEN
        ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_token_key" UNIQUE ("token");
    END IF;
END $$;

-- ─── Foreign keys for groups ─────────────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'groups_tenantId_fkey'
    ) THEN
        ALTER TABLE "groups" ADD CONSTRAINT "groups_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── Foreign keys for group_members ─────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'group_members_groupId_fkey'
    ) THEN
        ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_fkey"
            FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'group_members_userId_fkey'
    ) THEN
        ALTER TABLE "group_members" ADD CONSTRAINT "group_members_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── Foreign keys for user_invitations ───────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'user_invitations_tenantId_fkey'
    ) THEN
        ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- ─── Add groupId column to tickets ───────────────────────────────────────────
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tickets' AND column_name = 'groupId'
    ) THEN
        ALTER TABLE "tickets" ADD COLUMN "groupId" TEXT;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tickets_groupId_fkey'
    ) THEN
        ALTER TABLE "tickets" ADD CONSTRAINT "tickets_groupId_fkey"
            FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
