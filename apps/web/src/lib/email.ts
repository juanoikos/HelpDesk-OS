import { Resend } from "resend";

// ─── Cliente ──────────────────────────────────────────────────────────────────

const resend  = new Resend(process.env.RESEND_API_KEY);
const FROM    = process.env.EMAIL_FROM ?? "HelpDesk OS <onboarding@resend.dev>";
const APP_URL = process.env.AUTH_URL   ?? "http://localhost:3000";

// ─── Utilidades ───────────────────────────────────────────────────────────────

function isEmail(val?: string | null): val is string {
  return !!val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

function ticketUrl(id: string) {
  return `${APP_URL}/tickets/${id}`;
}

function num(n: number) {
  return `#${String(n).padStart(3, "0")}`;
}

// ─── Plantilla base ───────────────────────────────────────────────────────────

function baseHtml(content: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif">
  <div style="max-width:560px;margin:40px auto;padding:0 16px">

    <!-- Header -->
    <div style="background:#1e293b;border:1px solid #334155;border-radius:16px 16px 0 0;padding:20px 28px;display:flex;align-items:center;gap:12px">
      <div style="width:32px;height:32px;background:#2563eb;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:14px">H</div>
      <span style="color:#94a3b8;font-size:14px;font-weight:600">HelpDesk OS</span>
    </div>

    <!-- Body -->
    <div style="background:#1e293b;border:1px solid #334155;border-top:0;border-radius:0 0 16px 16px;padding:28px">
      ${content}
    </div>

    <!-- Footer -->
    <p style="text-align:center;color:#475569;font-size:12px;margin-top:20px">
      Este correo fue enviado automáticamente — no respondas directamente a este mensaje.
    </p>
  </div>
</body>
</html>`;
}

function badge(text: string, color: string) {
  return `<span style="background:${color}22;color:${color};border:1px solid ${color}44;border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600">${text}</span>`;
}

function btn(text: string, href: string) {
  return `<a href="${href}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 24px;border-radius:10px;margin-top:20px">${text} →</a>`;
}

function ticketCard(t: { number: number; title: string; type?: string; priority?: string }) {
  const priorityColor: Record<string, string> = { LOW:"#64748b", MEDIUM:"#3b82f6", HIGH:"#f97316", URGENT:"#ef4444" };
  const priorityLabel: Record<string, string> = { LOW:"Baja", MEDIUM:"Media", HIGH:"Alta", URGENT:"Urgente" };
  const typeLabel: Record<string, string> = {
    INCIDENT:"Incidencia", REQUEST:"Solicitud", ACCESS_PERMISSIONS:"Acceso y permisos",
    PURCHASE:"Compra / insumo", QUERY:"Consulta", PROBLEM:"Problema", CHANGE:"Cambio",
  };
  return `
    <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:16px 20px;margin:16px 0">
      <div style="color:#94a3b8;font-size:12px;font-family:monospace;margin-bottom:6px">${num(t.number)}</div>
      <div style="color:#f1f5f9;font-size:16px;font-weight:700;margin-bottom:10px">${t.title}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${t.type     ? badge(typeLabel[t.type]     ?? t.type,     "#6366f1") : ""}
        ${t.priority ? badge(priorityLabel[t.priority] ?? t.priority, priorityColor[t.priority] ?? "#64748b") : ""}
      </div>
    </div>`;
}

// ─── Tipos compartidos ────────────────────────────────────────────────────────

type TicketBasic = {
  id: string;
  number: number;
  title: string;
  type: string;
  priority: string;
  status?: string;
  solution?: string | null;
  createdBy: { name: string; email: string };
  assignedTo?: { name: string; email: string } | null;
  requesterContact?: string | null;
  requesterName?: string | null;
};

function recipientEmail(t: TicketBasic): string | null {
  if (isEmail(t.requesterContact)) return t.requesterContact;
  return t.createdBy.email || null;
}

function recipientName(t: TicketBasic): string {
  return t.requesterName ?? t.createdBy.name;
}

// ─── 1. Ticket creado ─────────────────────────────────────────────────────────

export async function notifyTicketCreated(t: TicketBasic) {
  const sends: Promise<unknown>[] = [];
  const url = ticketUrl(t.id);

  // → Solicitante
  const toRequester = recipientEmail(t);
  if (toRequester) {
    sends.push(resend.emails.send({
      from: FROM,
      to: toRequester,
      subject: `${num(t.number)} Tu solicitud fue registrada — ${t.title}`,
      html: baseHtml(`
        <h2 style="color:#f1f5f9;font-size:20px;margin:0 0 8px">¡Recibimos tu solicitud!</h2>
        <p style="color:#94a3b8;font-size:14px;margin:0 0 4px">
          Hola <strong style="color:#e2e8f0">${recipientName(t)}</strong>, tu ticket fue registrado correctamente.
          Te avisaremos cuando haya novedades.
        </p>
        ${ticketCard(t)}
        ${btn("Ver ticket", url)}
      `),
    }).catch(console.error));
  }

  // → Agente asignado
  if (t.assignedTo?.email && t.assignedTo.email !== toRequester) {
    sends.push(resend.emails.send({
      from: FROM,
      to: t.assignedTo.email,
      subject: `${num(t.number)} Ticket asignado — ${t.title}`,
      html: baseHtml(`
        <h2 style="color:#f1f5f9;font-size:20px;margin:0 0 8px">Se te asignó un ticket</h2>
        <p style="color:#94a3b8;font-size:14px;margin:0 0 4px">
          Hola <strong style="color:#e2e8f0">${t.assignedTo.name}</strong>,
          se te asignó el siguiente ticket.
        </p>
        ${ticketCard(t)}
        ${btn("Abrir ticket", url)}
      `),
    }).catch(console.error));
  }

  await Promise.allSettled(sends);
}

// ─── 2. Estado cambiado ───────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  NEW:"Nuevo", ASSIGNED:"Asignado", IN_DIAGNOSIS:"En diagnóstico",
  IN_ANALYSIS:"En análisis", IN_PROGRESS:"En progreso", WAITING:"En espera",
  PENDING_USER:"Pendiente de usuario", PENDING_PROVIDER:"Pendiente de proveedor",
  ESCALATED:"Escalado", RESOLVED:"Resuelto", CLOSED:"Cerrado",
};

export async function notifyStatusChanged(t: TicketBasic, newStatus: string) {
  const to = recipientEmail(t);
  if (!to) return;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `${num(t.number)} Estado actualizado: ${STATUS_LABEL[newStatus] ?? newStatus} — ${t.title}`,
    html: baseHtml(`
      <h2 style="color:#f1f5f9;font-size:20px;margin:0 0 8px">Estado de tu ticket actualizado</h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 4px">
        Hola <strong style="color:#e2e8f0">${recipientName(t)}</strong>, el estado de tu ticket cambió a
        <strong style="color:#e2e8f0">${STATUS_LABEL[newStatus] ?? newStatus}</strong>.
      </p>
      ${ticketCard(t)}
      ${btn("Ver ticket", ticketUrl(t.id))}
    `),
  }).catch(console.error);
}

// ─── 3. Respuesta pública nueva ───────────────────────────────────────────────

export async function notifyNewReply(t: TicketBasic, replyBody: string, agentName: string) {
  const to = recipientEmail(t);
  if (!to) return;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `${num(t.number)} Nueva respuesta — ${t.title}`,
    html: baseHtml(`
      <h2 style="color:#f1f5f9;font-size:20px;margin:0 0 8px">Tienes una nueva respuesta</h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 4px">
        Hola <strong style="color:#e2e8f0">${recipientName(t)}</strong>,
        <strong style="color:#e2e8f0">${agentName}</strong> respondió tu ticket:
      </p>
      <div style="background:#0f172a;border-left:3px solid #2563eb;border-radius:0 8px 8px 0;padding:14px 18px;margin:16px 0;color:#cbd5e1;font-size:14px;white-space:pre-wrap">
        ${replyBody.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
      </div>
      ${ticketCard(t)}
      ${btn("Ver conversación", ticketUrl(t.id))}
    `),
  }).catch(console.error);
}

// ─── 4. Ticket resuelto ───────────────────────────────────────────────────────

export async function notifyResolved(t: TicketBasic, solution: string) {
  const to = recipientEmail(t);
  if (!to) return;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `${num(t.number)} ✓ Tu ticket fue resuelto — ${t.title}`,
    html: baseHtml(`
      <h2 style="color:#4ade80;font-size:20px;margin:0 0 8px">✓ Tu ticket fue resuelto</h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 4px">
        Hola <strong style="color:#e2e8f0">${recipientName(t)}</strong>,
        tu solicitud fue atendida. Aquí está la solución aplicada:
      </p>
      <div style="background:#052e16;border:1px solid #166534;border-radius:10px;padding:14px 18px;margin:16px 0;color:#bbf7d0;font-size:14px;white-space:pre-wrap">
        ${solution.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
      </div>
      ${ticketCard(t)}
      ${btn("Ver ticket", ticketUrl(t.id))}
    `),
  }).catch(console.error);
}
