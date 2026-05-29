import { Resend } from "resend";

// ─── Cliente (lazy — evita error en build si la variable no está disponible) ──

function getResend() {
  return new Resend(process.env.RESEND_API_KEY ?? "re_placeholder");
}
const FROM    = () => process.env.EMAIL_FROM ?? "HelpDesk OS <onboarding@resend.dev>";
const APP_URL = () => process.env.AUTH_URL   ?? "http://localhost:3000";

// ─── Utilidades ───────────────────────────────────────────────────────────────

function isEmail(val?: string | null): val is string {
  return !!val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
}

function ticketUrl(id: string) {
  return `${APP_URL()}/tickets/${id}`;
}

function num(n: number) {
  return `#${String(n).padStart(3, "0")}`;
}

function subject(t: { number: number; requesterName?: string | null; createdBy: { name: string } }, rest: string) {
  const who = t.requesterName ?? t.createdBy.name;
  return `HelpDesk OS ${num(t.number)} (${who}) — ${rest}`;
}

// ─── Plantilla base (tabla compatible con clientes de email) ──────────────────

function baseHtml(content: string) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0f172a;min-height:100vh">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">

          <!-- Tarjeta principal -->
          <tr>
            <td style="background:#1e293b;border:1px solid #334155;border-radius:16px;overflow:hidden">

              <!-- Header -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:18px 24px;border-bottom:1px solid #334155">
                    <table cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:32px;height:32px;background:#2563eb;border-radius:8px;text-align:center;vertical-align:middle">
                          <span style="color:#fff;font-weight:700;font-size:15px;line-height:32px">H</span>
                        </td>
                        <td style="padding-left:10px;vertical-align:middle">
                          <span style="color:#94a3b8;font-size:14px;font-weight:600">HelpDesk OS</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Contenido -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding:28px 24px">
                    ${content}
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 0;text-align:center">
              <span style="color:#475569;font-size:12px">
                Este correo fue enviado automáticamente — no respondas directamente.
              </span>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function badge(text: string, color: string) {
  return `<span style="display:inline-block;background:${color}22;color:${color};border:1px solid ${color}44;border-radius:20px;padding:3px 10px;font-size:11px;font-weight:600;margin-right:6px">${text}</span>`;
}

function btn(text: string, href: string) {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:24px">
    <tr>
      <td style="background:#2563eb;border-radius:10px">
        <a href="${href}" style="display:inline-block;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 26px">${text} →</a>
      </td>
    </tr>
  </table>`;
}

// ─── Tarjeta de ticket con estado y asignado ──────────────────────────────────

function ticketCard(t: {
  number: number;
  title: string;
  type?: string;
  priority?: string;
  status?: string;
  assignedTo?: { name: string } | null;
}) {
  const priorityColor: Record<string, string> = { LOW:"#64748b", MEDIUM:"#3b82f6", HIGH:"#f97316", URGENT:"#ef4444" };
  const priorityLabel: Record<string, string> = { LOW:"Baja", MEDIUM:"Media", HIGH:"Alta", URGENT:"Urgente" };
  const typeLabel: Record<string, string> = {
    INCIDENT:"Incidencia", REQUEST:"Solicitud", ACCESS_PERMISSIONS:"Acceso y permisos",
    PURCHASE:"Compra / insumo", QUERY:"Consulta", PROBLEM:"Problema", CHANGE:"Cambio",
  };
  const statusColor: Record<string, string> = {
    NEW:"#64748b", ASSIGNED:"#3b82f6", IN_DIAGNOSIS:"#06b6d4", IN_ANALYSIS:"#6366f1",
    IN_PROGRESS:"#f59e0b", WAITING:"#8b5cf6", PENDING_USER:"#f97316",
    PENDING_PROVIDER:"#f43f5e", ESCALATED:"#ef4444", RESOLVED:"#22c55e", CLOSED:"#475569",
  };
  const statusLabel: Record<string, string> = {
    NEW:"Nuevo", ASSIGNED:"Asignado", IN_DIAGNOSIS:"En diagnóstico", IN_ANALYSIS:"En análisis",
    IN_PROGRESS:"En progreso", WAITING:"En espera", PENDING_USER:"Pend. usuario",
    PENDING_PROVIDER:"Pend. proveedor", ESCALATED:"Escalado", RESOLVED:"Resuelto", CLOSED:"Cerrado",
  };

  const rows: string[] = [];
  if (t.status) {
    const sc = statusColor[t.status] ?? "#64748b";
    rows.push(`<tr>
      <td style="color:#64748b;font-size:12px;padding:6px 0 0;width:110px;vertical-align:top">Estado</td>
      <td style="padding:6px 0 0">${badge(statusLabel[t.status] ?? t.status, sc)}</td>
    </tr>`);
  }
  if (t.assignedTo) {
    rows.push(`<tr>
      <td style="color:#64748b;font-size:12px;padding:6px 0 0;vertical-align:top">Asignado a</td>
      <td style="color:#e2e8f0;font-size:13px;padding:6px 0 0">${t.assignedTo.name}</td>
    </tr>`);
  }
  if (t.priority) {
    rows.push(`<tr>
      <td style="color:#64748b;font-size:12px;padding:6px 0 0;vertical-align:top">Prioridad</td>
      <td style="padding:6px 0 0">${badge(priorityLabel[t.priority] ?? t.priority, priorityColor[t.priority] ?? "#64748b")}</td>
    </tr>`);
  }
  if (t.type) {
    rows.push(`<tr>
      <td style="color:#64748b;font-size:12px;padding:6px 0 0;vertical-align:top">Tipo</td>
      <td style="padding:6px 0 0">${badge(typeLabel[t.type] ?? t.type, "#6366f1")}</td>
    </tr>`);
  }

  return `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
      style="background:#0f172a;border:1px solid #334155;border-radius:12px;margin:20px 0">
      <tr>
        <td style="padding:16px 20px">
          <div style="color:#64748b;font-size:11px;font-family:monospace;margin-bottom:4px">${num(t.number)}</div>
          <div style="color:#f1f5f9;font-size:16px;font-weight:700;margin-bottom:12px">${t.title}</div>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">
            ${rows.join("")}
          </table>
        </td>
      </tr>
    </table>`;
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
  assignedTo?: { id: string; name: string; email: string } | null;
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
    sends.push(getResend().emails.send({
      from: FROM(),
      to: toRequester,
      subject: subject(t, `Tu solicitud fue registrada — ${t.title}`),
      html: baseHtml(`
        <h2 style="color:#f1f5f9;font-size:20px;font-weight:700;margin:0 0 8px">¡Recibimos tu solicitud!</h2>
        <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;line-height:1.6">
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
    sends.push(getResend().emails.send({
      from: FROM(),
      to: t.assignedTo.email,
      subject: subject(t, `Ticket asignado — ${t.title}`),
      html: baseHtml(`
        <h2 style="color:#f1f5f9;font-size:20px;font-weight:700;margin:0 0 8px">Se te asignó un ticket</h2>
        <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;line-height:1.6">
          Hola <strong style="color:#e2e8f0">${t.assignedTo.name}</strong>,
          se te asignó el siguiente ticket. Revísalo y responde a la brevedad.
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

  await getResend().emails.send({
    from: FROM,
    to,
    subject: subject(t, `Estado actualizado: ${STATUS_LABEL[newStatus] ?? newStatus} — ${t.title}`),
    html: baseHtml(`
      <h2 style="color:#f1f5f9;font-size:20px;font-weight:700;margin:0 0 8px">Estado de tu ticket actualizado</h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;line-height:1.6">
        Hola <strong style="color:#e2e8f0">${recipientName(t)}</strong>, el estado de tu ticket cambió a
        <strong style="color:#e2e8f0">${STATUS_LABEL[newStatus] ?? newStatus}</strong>.
      </p>
      ${ticketCard({ ...t, status: newStatus })}
      ${btn("Ver ticket", ticketUrl(t.id))}
    `),
  }).catch(console.error);
}

// ─── 3. Respuesta pública nueva ───────────────────────────────────────────────

export async function notifyNewReply(t: TicketBasic, replyBody: string, agentName: string) {
  const to = recipientEmail(t);
  if (!to) return;

  await getResend().emails.send({
    from: FROM,
    to,
    subject: subject(t, `Nueva respuesta — ${t.title}`),
    html: baseHtml(`
      <h2 style="color:#f1f5f9;font-size:20px;font-weight:700;margin:0 0 8px">Tienes una nueva respuesta</h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;line-height:1.6">
        Hola <strong style="color:#e2e8f0">${recipientName(t)}</strong>,
        <strong style="color:#e2e8f0">${agentName}</strong> respondió tu ticket:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0">
        <tr>
          <td style="background:#0f172a;border-left:3px solid #2563eb;border-radius:0 8px 8px 0;padding:14px 18px;color:#cbd5e1;font-size:14px;line-height:1.6;white-space:pre-wrap">
            ${replyBody.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
          </td>
        </tr>
      </table>
      ${ticketCard(t)}
      ${btn("Ver conversación", ticketUrl(t.id))}
    `),
  }).catch(console.error);
}

// ─── 4. Nueva actividad → agente asignado ────────────────────────────────────

export async function notifyAgentActivity(
  t: TicketBasic,
  body: string,
  authorName: string,
  isInternal: boolean,
) {
  if (!t.assignedTo?.email) return;

  const label      = isInternal ? "Nota interna" : "Respuesta";
  const labelColor = isInternal ? "#a855f7" : "#3b82f6";
  const borderColor = isInternal ? "#a855f7" : "#2563eb";
  const bgColor     = isInternal ? "#150d24" : "#0f172a";

  await getResend().emails.send({
    from: FROM,
    to: t.assignedTo.email,
    subject: subject(t, `${label} de ${authorName} — ${t.title}`),
    html: baseHtml(`
      <h2 style="color:#f1f5f9;font-size:20px;font-weight:700;margin:0 0 8px">Nueva actividad en tu ticket</h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;line-height:1.6">
        Hola <strong style="color:#e2e8f0">${t.assignedTo.name}</strong>,
        <strong style="color:#e2e8f0">${authorName}</strong> escribió
        una <strong style="color:${labelColor}">${label.toLowerCase()}</strong>:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0">
        <tr>
          <td style="background:${bgColor};border-left:3px solid ${borderColor};border-radius:0 8px 8px 0;padding:14px 18px;color:#cbd5e1;font-size:14px;line-height:1.6;white-space:pre-wrap">
            ${body.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
          </td>
        </tr>
      </table>
      ${ticketCard(t)}
      ${btn("Ver ticket", ticketUrl(t.id))}
    `),
  }).catch(console.error);
}

// ─── 5. Ticket resuelto ───────────────────────────────────────────────────────

export async function notifyResolved(t: TicketBasic, solution: string) {
  const to = recipientEmail(t);
  if (!to) return;

  await getResend().emails.send({
    from: FROM,
    to,
    subject: subject(t, `✓ Ticket resuelto — ${t.title}`),
    html: baseHtml(`
      <h2 style="color:#4ade80;font-size:20px;font-weight:700;margin:0 0 8px">✓ Tu ticket fue resuelto</h2>
      <p style="color:#94a3b8;font-size:14px;margin:0 0 4px;line-height:1.6">
        Hola <strong style="color:#e2e8f0">${recipientName(t)}</strong>,
        tu solicitud fue atendida. Aquí está la solución aplicada:
      </p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0">
        <tr>
          <td style="background:#052e16;border:1px solid #166534;border-radius:10px;padding:14px 18px;color:#bbf7d0;font-size:14px;line-height:1.6;white-space:pre-wrap">
            ${solution.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
          </td>
        </tr>
      </table>
      ${ticketCard(t)}
      ${btn("Ver ticket", ticketUrl(t.id))}
    `),
  }).catch(console.error);
}
