import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";

const PERIOD_DAYS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };

export const reportsRouter = router({
  getSummary: protectedProcedure
    .input(z.object({
      period: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
    }))
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      const days     = PERIOD_DAYS[input.period];
      const from     = days ? new Date(Date.now() - days * 86400000) : undefined;
      const where    = { tenantId, ...(from ? { createdAt: { gte: from } } : {}) };

      // ── Traer todos los tickets del período ──────────────────────────────────
      const tickets = await prisma.ticket.findMany({
        where,
        select: {
          id:          true,
          status:      true,
          priority:    true,
          type:        true,
          slaBreached: true,
          slaDeadline: true,
          createdAt:   true,
          closedAt:    true,
          assignedTo:  { select: { id: true, name: true } },
          group:       { select: { id: true, name: true } },
          category:    { select: { id: true, name: true } },
        },
      });

      const total    = tickets.length;
      const resolved = tickets.filter((t) => t.status === "RESOLVED" || t.status === "CLOSED").length;
      const closed   = tickets.filter((t) => t.status === "CLOSED").length;
      const open     = tickets.filter((t) => !["RESOLVED","CLOSED"].includes(t.status)).length;

      // ── Tiempo promedio de resolución (en horas) ─────────────────────────────
      const closedWithTime = tickets.filter((t) => t.closedAt);
      const avgResolutionHours = closedWithTime.length
        ? Math.round(
            closedWithTime.reduce((sum, t) => {
              const ms = new Date(t.closedAt!).getTime() - new Date(t.createdAt).getTime();
              return sum + ms / 3600000;
            }, 0) / closedWithTime.length
          )
        : 0;

      // ── Cumplimiento de SLA ───────────────────────────────────────────────────
      const withDeadline   = tickets.filter((t) => t.slaDeadline);
      const slaOk          = withDeadline.filter((t) => !t.slaBreached).length;
      const slaCompliance  = withDeadline.length
        ? Math.round((slaOk / withDeadline.length) * 100)
        : 100;

      // ── Por estado ────────────────────────────────────────────────────────────
      const statusMap: Record<string, number> = {};
      for (const t of tickets) statusMap[t.status] = (statusMap[t.status] ?? 0) + 1;
      const byStatus = Object.entries(statusMap)
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count);

      // ── Por prioridad ─────────────────────────────────────────────────────────
      const priorityMap: Record<string, number> = {};
      for (const t of tickets) priorityMap[t.priority] = (priorityMap[t.priority] ?? 0) + 1;
      const byPriority = Object.entries(priorityMap)
        .map(([priority, count]) => ({ priority, count }))
        .sort((a, b) => b.count - a.count);

      // ── Por tipo ──────────────────────────────────────────────────────────────
      const typeMap: Record<string, number> = {};
      for (const t of tickets) typeMap[t.type] = (typeMap[t.type] ?? 0) + 1;
      const byType = Object.entries(typeMap)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

      // ── Por categoría ─────────────────────────────────────────────────────────
      const catMap: Record<string, number> = {};
      for (const t of tickets) {
        const name = t.category?.name ?? "Sin categoría";
        catMap[name] = (catMap[name] ?? 0) + 1;
      }
      const byCategory = Object.entries(catMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      // ── Por agente ────────────────────────────────────────────────────────────
      const agentMap: Record<string, { name: string; total: number; resolved: number; hours: number; hCount: number }> = {};
      for (const t of tickets) {
        if (!t.assignedTo) continue;
        const { id, name } = t.assignedTo;
        if (!agentMap[id]) agentMap[id] = { name, total: 0, resolved: 0, hours: 0, hCount: 0 };
        agentMap[id].total++;
        if (t.status === "CLOSED" || t.status === "RESOLVED") {
          agentMap[id].resolved++;
          if (t.closedAt) {
            agentMap[id].hours  += (new Date(t.closedAt).getTime() - new Date(t.createdAt).getTime()) / 3600000;
            agentMap[id].hCount++;
          }
        }
      }
      const byAgent = Object.values(agentMap)
        .map((a) => ({
          name:     a.name,
          total:    a.total,
          resolved: a.resolved,
          avgHours: a.hCount ? Math.round(a.hours / a.hCount) : 0,
        }))
        .sort((a, b) => b.resolved - a.resolved);

      // ── Por grupo ─────────────────────────────────────────────────────────────
      const groupMap: Record<string, number> = {};
      for (const t of tickets) {
        const name = t.group?.name ?? "Sin grupo";
        groupMap[name] = (groupMap[name] ?? 0) + 1;
      }
      const byGroup = Object.entries(groupMap)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      // ── Timeline (tickets por día) ────────────────────────────────────────────
      const dayMap: Record<string, number> = {};
      for (const t of tickets) {
        const day = new Date(t.createdAt).toISOString().slice(0, 10);
        dayMap[day] = (dayMap[day] ?? 0) + 1;
      }
      // Rellenar días sin tickets con 0
      const periodDays = days ?? 30;
      const timeline: { date: string; count: number }[] = [];
      for (let i = Math.min(periodDays, 30) - 1; i >= 0; i--) {
        const d   = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        timeline.push({ date: d, count: dayMap[d] ?? 0 });
      }

      return {
        period: { from: from?.toISOString() ?? null, days },
        total, resolved, closed, open,
        avgResolutionHours,
        slaCompliance,
        byStatus,
        byPriority,
        byType,
        byCategory,
        byAgent,
        byGroup,
        timeline,
      };
    }),
});
