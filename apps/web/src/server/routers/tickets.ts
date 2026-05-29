import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";
import {
  notifyTicketCreated,
  notifyStatusChanged,
  notifyNewReply,
  notifyResolved,
  notifyAgentActivity,
} from "@/lib/email";

// ─── Selector reutilizable para emails ───────────────────────────────────────
const WITH_EMAIL = {
  createdBy:  { select: { id: true, name: true, email: true } },
  assignedTo: { select: { id: true, name: true, email: true } },  // id necesario para evitar auto-notificación
} as const;

// SLA en horas según prioridad
const SLA_HOURS: Record<string, number> = {
  URGENT: 4,
  HIGH:   8,
  MEDIUM: 24,
  LOW:    72,
};

const statusEnum   = z.enum(["NEW","ASSIGNED","IN_DIAGNOSIS","IN_ANALYSIS","IN_PROGRESS","WAITING","PENDING_USER","PENDING_PROVIDER","ESCALATED","RESOLVED","CLOSED"]);
const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
const typeEnum     = z.enum(["INCIDENT","REQUEST","ACCESS_PERMISSIONS","PURCHASE","QUERY","PROBLEM","CHANGE"]);
const impactEnum   = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const channelEnum  = z.enum(["WEB", "EMAIL", "WHATSAPP", "PHONE"]);

export const ticketsRouter = router({
  // ── Lista con filtros opcionales ──────────────────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        status:     statusEnum.optional(),
        priority:   priorityEnum.optional(),
        type:       typeEnum.optional(),
        categoryId: z.string().optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      return prisma.ticket.findMany({
        where: {
          tenantId,
          ...(input?.status     ? { status:     input.status }     : {}),
          ...(input?.priority   ? { priority:   input.priority }   : {}),
          ...(input?.type       ? { type:       input.type }       : {}),
          ...(input?.categoryId ? { categoryId: input.categoryId } : {}),
        },
        include: {
          category:   true,
          createdBy:  { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          _count:     { select: { messages: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }),

  // ── Crear ticket ──────────────────────────────────────────────────────────
  create: protectedProcedure
    .input(
      z.object({
        title:            z.string().min(5,  "Mínimo 5 caracteres"),
        body:             z.string().min(10, "Mínimo 10 caracteres"),
        type:             typeEnum.default("INCIDENT"),
        priority:         priorityEnum.default("MEDIUM"),
        impact:           impactEnum.default("LOW"),
        categoryId:       z.string().optional(),
        subcategory:      z.string().optional(),
        area:             z.string().optional(),
        location:         z.string().optional(),
        affectedSystem:   z.string().optional(),
        appVersion:       z.string().optional(),
        channel:          channelEnum.default("WEB"),
        assignedToId:     z.string().optional(),
        requesterName:    z.string().optional(),
        requesterContact: z.string().optional(),
        siteType:             z.enum(["OFFICE", "POS"]).optional(),
        equipmentName:        z.string().optional(),
        deviceType:           z.string().optional(),
        deviceDetail:         z.string().optional(),
        techCategory:         z.string().optional(),
        affectedAsset:        z.string().optional(),
        assignedGroup:        z.string().optional(),
        urgency:              z.string().optional(),
        diagnosis:            z.string().optional(),
        whatNeeded:           z.string().optional(),
        affectedService:      z.string().optional(),
        createdFromUserView:  z.boolean().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = ctx.session.user.tenantId;
      const userId   = ctx.session.user.id;

      // Número secuencial por empresa
      const last = await prisma.ticket.findFirst({
        where:   { tenantId },
        orderBy: { number: "desc" },
        select:  { number: true },
      });
      const number = (last?.number ?? 0) + 1;

      // Calcular deadline SLA
      const slaHours    = SLA_HOURS[input.priority] ?? 24;
      const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);

      const ticket = await prisma.ticket.create({
        data: {
          tenantId,
          number,
          title:          input.title,
          type:           input.type,
          priority:       input.priority,
          impact:         input.impact,
          categoryId:     input.categoryId,
          subcategory:    input.subcategory,
          area:           input.area,
          location:       input.location,
          affectedSystem: input.affectedSystem,
          appVersion:     input.appVersion,
          assignedToId:   input.assignedToId,
          createdById:    userId,
          slaDeadline,
          requesterName:    input.requesterName,
          requesterContact: input.requesterContact,
          siteType:            input.siteType,
          equipmentName:       input.equipmentName,
          deviceType:          input.deviceType,
          deviceDetail:        input.deviceDetail,
          techCategory:        input.techCategory,
          affectedAsset:       input.affectedAsset,
          assignedGroup:       input.assignedGroup,
          urgency:             input.urgency,
          diagnosis:           input.diagnosis,
          whatNeeded:          input.whatNeeded,
          affectedService:     input.affectedService,
          createdFromUserView: input.createdFromUserView ?? false,
          messages: {
            create: {
              body:    input.body,
              userId,
              channel: input.channel,
            },
          },
        },
        include: WITH_EMAIL,
      });

      // Notificación fire-and-forget (no bloquea la respuesta)
      notifyTicketCreated(ticket).catch(console.error);

      return ticket;
    }),

  // ── Detalle completo ──────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const ticket = await prisma.ticket.findFirst({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
        include: {
          category:   true,
          createdBy:  { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
          group:      { select: { id: true, name: true, color: true } },
          messages: {
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
      });
      if (!ticket)
        throw new TRPCError({ code: "NOT_FOUND", message: "Ticket no encontrado" });
      return ticket;
    }),

  // ── Cambiar estado ────────────────────────────────────────────────────────
  updateStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: statusEnum }))
    .mutation(async ({ input, ctx }) => {
      // Cerrar un ticket sin solución está prohibido (base de conocimiento)
      if (input.status === "CLOSED") {
        const existing = await prisma.ticket.findFirst({
          where:  { id: input.id, tenantId: ctx.session.user.tenantId },
          select: { solution: true },
        });
        if (!existing?.solution) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Debes registrar una solución antes de cerrar el ticket.",
          });
        }
      }

      const ticket = await prisma.ticket.update({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
        data: {
          status: input.status,
          ...(input.status === "CLOSED" ? { closedAt: new Date() } : {}),
        },
        include: WITH_EMAIL,
      });

      // Notificar cambio de estado (fire-and-forget)
      notifyStatusChanged(ticket, input.status).catch(console.error);

      return ticket;
    }),

  // ── Guardar solución ──────────────────────────────────────────────────────
  saveSolution: protectedProcedure
    .input(z.object({ id: z.string(), solution: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const ticket = await prisma.ticket.update({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
        data: { solution: input.solution, status: "RESOLVED" },
        include: WITH_EMAIL,
      });

      // Notificar resolución con solución incluida (fire-and-forget)
      notifyResolved(ticket, input.solution).catch(console.error);

      return ticket;
    }),

  // ── Asignar agente ────────────────────────────────────────────────────────
  assign: protectedProcedure
    .input(z.object({ id: z.string(), userId: z.string().nullable() }))
    .mutation(async ({ input, ctx }) => {
      return prisma.ticket.update({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
        data:  { assignedToId: input.userId },
      });
    }),

  // ── Asignar grupo ─────────────────────────────────────────────────────────
  assignGroup: protectedProcedure
    .input(z.object({ id: z.string(), groupId: z.string().nullable() }))
    .mutation(async ({ input, ctx }) => {
      return prisma.ticket.update({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
        data:  { groupId: input.groupId },
      });
    }),

  // ── Agregar mensaje ───────────────────────────────────────────────────────
  addMessage: protectedProcedure
    .input(
      z.object({
        ticketId:   z.string(),
        body:       z.string().min(1),
        isInternal: z.boolean().default(false),
        channel:    channelEnum.default("WEB"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const ticket = await prisma.ticket.findFirst({
        where:   { id: input.ticketId, tenantId: ctx.session.user.tenantId },
        include: WITH_EMAIL,
      });
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });

      const message = await prisma.ticketMessage.create({
        data: {
          ticketId:   input.ticketId,
          userId:     ctx.session.user.id,
          body:       input.body,
          isInternal: input.isInternal,
          channel:    input.channel,
        },
        include: { user: { select: { id: true, name: true } } },
      });

      const authorName = ctx.session.user.name ?? "Soporte";

      // Notificar respuesta pública al solicitante (fire-and-forget)
      if (!input.isInternal) {
        notifyNewReply(ticket, input.body, authorName).catch(console.error);
      }

      // Notificar al agente asignado cuando no es él mismo quien escribe
      if (ticket.assignedTo && ticket.assignedTo.id !== ctx.session.user.id) {
        notifyAgentActivity(ticket, input.body, authorName, input.isInternal).catch(console.error);
      }

      return message;
    }),

  // ── Perfil del usuario actual ─────────────────────────────────────────────
  me: protectedProcedure.query(({ ctx }) => ({
    id:   ctx.session.user.id,
    name: ctx.session.user.name ?? "",
    role: ctx.session.user.role,
  })),

  // ── Agentes disponibles ───────────────────────────────────────────────────
  listAgents: protectedProcedure.query(async ({ ctx }) => {
    return prisma.user.findMany({
      where:   { tenantId: ctx.session.user.tenantId, role: { in: ["ADMIN", "AGENT"] } },
      select:  { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
  }),
});
