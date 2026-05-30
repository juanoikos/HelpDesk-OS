-- CreateTable: ticket_attachments
CREATE TABLE IF NOT EXISTS "ticket_attachments" (
  "id"        TEXT        NOT NULL,
  "ticketId"  TEXT        NOT NULL,
  "name"      TEXT        NOT NULL,
  "key"       TEXT        NOT NULL,
  "url"       TEXT        NOT NULL,
  "size"      INTEGER     NOT NULL,
  "mimeType"  TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ticket_attachments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ticket_attachments"
  ADD CONSTRAINT "ticket_attachments_ticketId_fkey"
  FOREIGN KEY ("ticketId") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
