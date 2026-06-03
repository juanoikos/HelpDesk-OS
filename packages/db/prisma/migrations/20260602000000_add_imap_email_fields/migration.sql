-- HelpDesk OS — Migración: IMAP email entrante
-- Agrega campos de email a tickets y tabla de emails procesados

-- Campos de email en tickets (para tickets creados desde correo)
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "emailFrom"      TEXT;
ALTER TABLE "tickets" ADD COLUMN IF NOT EXISTS "emailMessageId" TEXT;

-- Tabla para deduplicación de emails ya procesados
CREATE TABLE IF NOT EXISTS "processed_emails" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "ticketId"  TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_emails_pkey" PRIMARY KEY ("id")
);

-- Índice único para evitar procesar el mismo email dos veces
CREATE UNIQUE INDEX IF NOT EXISTS "processed_emails_tenantId_messageId_key"
    ON "processed_emails"("tenantId", "messageId");
