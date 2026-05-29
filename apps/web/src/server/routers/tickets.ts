import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";

export const ticketsRouter = router({
  // ── Lista de tickets con filtros opcionales ───────────────────────────────
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]).optional(),
        priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
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
        title:      z.string().min(5,  "Mínimo 5 caracteres"),
        body:       z.string().min(10, "Mínimo 10 caracteres"),
        priority:   z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
        categoryId: z.string().optional(),
        channel:    z.enum(["WEB", "EMAIL", "WHATSAPP", "PHONE"]).default("WEB"),
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

      return prisma.ticket.create({
        data: {
          tenantId,
          number,
          title:      input.title,
          priority:   input.priority,
          categoryId: input.categoryId,
          createdById: userId,
          messages: {
            create: {
              body:    input.body,
              userId,
              channel: input.channel,
            },
          },
        },
      });
    }),

  // ── Detalle completo de un ticket ─────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const ticket = await prisma.ticket.findFirst({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
        include: {
          category:   true,
          createdBy:  { select: { id: true, name: true, email: true } },
          assignedTo: { select: { id: true, name: true, email: true } },
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
    .input(
      z.object({
        id:     z.string(),
        status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return prisma.ticket.update({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
        data: {
          status: input.status,
          ...(input.status === "CLOSED" ? { closedAt: new Date() } : {}),
        },
      });
    }),

  // ── Asignar agente ────────────────────────────────────────────────────────
  assign: protectedProcedure
    .input(
      z.object({
        id:     z.string(),
        userId: z.string().nullable(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      return prisma.ticket.update({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
        data:  { assignedToId: input.userId },
      });
    }),

  // ── Agregar mensaje al hilo ───────────────────────────────────────────────
  addMessage: protectedProcedure
    .input(
      z.object({
        ticketId:   z.string(),
        body:       z.string().min(1, "El mensaje no puede estar vacío"),
        isInternal: z.boolean().default(false),
        channel:    z.enum(["WEB", "EMAIL", "WHATSAPP", "PHONE"]).default("WEB"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const ticket = await prisma.ticket.findFirst({
        where: { id: input.ticketId, tenantId: ctx.session.user.tenantId },
      });
      if (!ticket) throw new TRPCError({ code: "NOT_FOUND" });

      return prisma.ticketMessage.create({
        data: {
          ticketId:   input.ticketId,
          userId:     ctx.session.user.id,
          body:       input.body,
          isInternal: input.isInternal,
          channel:    input.channel,
        },
        include: { user: { select: { id: true, name: true } } },
      });
    }),

  // ── Agentes disponibles para asignar ─────────────────────────────────────
  listAgents: protectedProcedure.query(async ({ ctx }) => {
    return prisma.user.findMany({
      where: {
        tenantId: ctx.session.user.tenantId,
        role: { in: ["ADMIN", "AGENT"] },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    });
  }),
});
