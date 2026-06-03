/**
 * HelpDesk OS — IMAP Email Poller
 * Revisa buzones IMAP configurados cada 2 minutos.
 * Crea tickets nuevos o añade mensajes a tickets existentes.
 */

import { prisma } from "@helpdesk-os/db";

const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
let started = false;

// ─── Punto de entrada ─────────────────────────────────────────────────────────

export function startImapPolling() {
  if (started) return;
  started = true;
  console.log("[IMAP] Poller iniciado — intervalo: 2 min");

  // Primera ejecución después de 30 segundos (dar tiempo al server a arrancar)
  setTimeout(() => {
    pollAll().catch((e) => console.error("[IMAP] Error en primera ejecución:", e));
    setInterval(() => pollAll().catch((e) => console.error("[IMAP] Error en poll:", e)), POLL_INTERVAL_MS);
  }, 30_000);
}

// ─── Ciclo principal ──────────────────────────────────────────────────────────

async function pollAll() {
  const channels = await prisma.channel.findMany({
    where: { type: "EMAIL", isActive: true },
  });

  for (const ch of channels) {
    const cfg = ch.config as Record<string, unknown>;
    if (!cfg.imapHost || !cfg.imapUser || !cfg.imapPassword) continue;

    await pollTenant(ch.tenantId, cfg).catch((e) =>
      console.error(`[IMAP] Error tenant ${ch.tenantId}:`, e)
    );
  }
}

// ─── Polling por tenant ───────────────────────────────────────────────────────

async function pollTenant(tenantId: string, cfg: Record<string, unknown>) {
  // Importación dinámica para evitar cargar imapflow en el cliente
  const { ImapFlow } = await import("imapflow");

  const client = new ImapFlow({
    host:   String(cfg.imapHost),
    port:   Number(cfg.imapPort ?? 993),
    secure: cfg.imapTls !== false,
    auth: {
      user: String(cfg.imapUser),
      pass: String(cfg.imapPassword),
    },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Buscar mensajes no leídos
      const uids = await client.search({ seen: false });
      if (!uids || uids.length === 0) return;

      for await (const msg of client.fetch(
        { uid: uids as unknown as string },
        { envelope: true, source: true, flags: true },
        { uid: true }
      )) {
        const messageId = msg.envelope?.messageId;
        if (!messageId) continue;

        // ¿Ya procesado?
        const seen = await prisma.processedEmail.findUnique({
          where: { tenantId_messageId: { tenantId, messageId } },
        });
        if (seen) continue;

        // Parsear con mailparser
        if (!msg.source) continue;
        const { simpleParser } = await import("mailparser");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = await (simpleParser(msg.source) as Promise<any>);

        const subject    = parsed.subject ?? "(sin asunto)";
        const textBody   = parsed.text ?? parsed.html ?? "(sin contenido)";
        const fromAddr   = (parsed.from?.value?.[0]?.address ?? "").toLowerCase();
        const fromName   = parsed.from?.value?.[0]?.name ?? fromAddr;

        // ¿Es respuesta a un ticket existente? Buscar [#NNN] en el asunto
        const ticketNumMatch = subject.match(/\[?#(\d+)\]?/);

        if (ticketNumMatch) {
          // Añadir como mensaje al ticket
          const num    = parseInt(ticketNumMatch[1]);
          const ticket = await prisma.ticket.findFirst({
            where: { tenantId, number: num },
            select: { id: true },
          });

          if (ticket) {
            await prisma.ticketMessage.create({
              data: {
                ticketId: ticket.id,
                body:     `**De:** ${fromName} <${fromAddr}>\n\n${textBody}`,
                channel:  "EMAIL",
              },
            });
            await prisma.processedEmail.create({
              data: { tenantId, messageId, ticketId: ticket.id },
            });
            console.log(`[IMAP] Respuesta añadida al ticket #${num} (${tenantId})`);
          }
        } else {
          // Crear ticket nuevo
          const admin = await prisma.user.findFirst({
            where:   { tenantId, role: "ADMIN" },
            select:  { id: true },
          });
          if (!admin) continue;

          const last = await prisma.ticket.findFirst({
            where:   { tenantId },
            orderBy: { number: "desc" },
            select:  { number: true },
          });
          const number      = (last?.number ?? 0) + 1;
          const slaDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

          const ticket = await prisma.ticket.create({
            data: {
              tenantId,
              number,
              title:            subject.slice(0, 200),
              status:           "NEW",
              priority:         "MEDIUM",
              type:             "REQUEST",
              impact:           "LOW",
              createdById:      admin.id,
              slaDeadline,
              emailFrom:        fromAddr,
              emailMessageId:   messageId,
              requesterName:    fromName,
              requesterContact: fromAddr,
              messages: {
                create: {
                  body:    `**De:** ${fromName} <${fromAddr}>\n\n${textBody}`,
                  userId:  admin.id,
                  channel: "EMAIL",
                },
              },
            },
            select: { id: true, number: true },
          });

          await prisma.processedEmail.create({
            data: { tenantId, messageId, ticketId: ticket.id },
          });

          console.log(`[IMAP] Ticket #${ticket.number} creado desde email (${tenantId})`);
        }

        // Marcar como leído en el buzón
        await client.messageFlagsAdd({ uid: msg.uid }, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (err) {
    console.error(`[IMAP] Fallo en tenant ${tenantId}:`, err);
    try { await client.logout(); } catch { /* ignore */ }
  }
}
