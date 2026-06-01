-- CreateTable: canned_responses
CREATE TABLE IF NOT EXISTS "canned_responses" (
  "id"        TEXT          NOT NULL,
  "tenantId"  TEXT          NOT NULL,
  "title"     TEXT          NOT NULL,
  "body"      TEXT          NOT NULL,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "canned_responses_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "canned_responses"
  ADD CONSTRAINT "canned_responses_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
