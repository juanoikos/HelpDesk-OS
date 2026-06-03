import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";
import { notifyInvitation } from "@/lib/email";

const APP_URL = () => process.env.AUTH_URL ?? "http://localhost:3000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAdmin(role: string) {
  if (role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo los administradores pueden realizar esta acción" });
  }
}

const colorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido")
  .optional();

// ─── Sub-router: grupos ───────────────────────────────────────────────────────

const groupsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    return prisma.group.findMany({
      where:   { tenantId },
      include: { _count: { select: { members: true, tickets: true } } },
      orderBy: { createdAt: "asc" },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        name:        z.string().min(2, "Mínimo 2 caracteres").max(60),
        description: z.string().max(200).optional(),
        color:       colorSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const tenantId = ctx.session.user.tenantId;
      return prisma.group.create({
        data: { tenantId, ...input },
      });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id:          z.string(),
        name:        z.string().min(2).max(60).optional(),
        description: z.string().max(200).optional(),
        color:       colorSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const { id, ...data } = input;
      return prisma.group.update({
        where: { id, tenantId: ctx.session.user.tenantId },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const count = await prisma.ticket.count({
        where: { groupId: input.id, tenantId: ctx.session.user.tenantId },
      });
      if (count > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `No puedes eliminar este grupo — tiene ${count} ticket(s) asignado(s)`,
        });
      }
      return prisma.group.delete({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
      });
    }),

  addMember: protectedProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const tenantId = ctx.session.user.tenantId;

      const group = await prisma.group.findFirst({ where: { id: input.groupId, tenantId } });
      if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Grupo no encontrado" });

      const user = await prisma.user.findFirst({ where: { id: input.userId, tenantId } });
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado" });

      return prisma.groupMember.upsert({
        where:  { groupId_userId: { groupId: input.groupId, userId: input.userId } },
        create: { groupId: input.groupId, userId: input.userId },
        update: {},
      });
    }),

  removeMember: protectedProcedure
    .input(z.object({ groupId: z.string(), userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      return prisma.groupMember.delete({
        where: { groupId_userId: { groupId: input.groupId, userId: input.userId } },
      });
    }),
});

// ─── Sub-router: invitaciones ─────────────────────────────────────────────────

const inviteRouter = router({
  send: protectedProcedure
    .input(
      z.object({
        email:   z.string().email("Correo inválido"),
        name:    z.string().min(2, "Mínimo 2 caracteres"),
        role:    z.enum(["AGENT", "ADMIN"]).default("AGENT"),
        groupId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const tenantId = ctx.session.user.tenantId;

      const existing = await prisma.user.findUnique({
        where: { tenantId_email: { tenantId, email: input.email } },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ya existe un usuario con ese correo en este tenant",
        });
      }

      if (input.groupId) {
        const group = await prisma.group.findFirst({ where: { id: input.groupId, tenantId } });
        if (!group) throw new TRPCError({ code: "NOT_FOUND", message: "Grupo no encontrado" });
      }

      // Remove any existing pending invitation for same email+tenant
      await prisma.userInvitation.deleteMany({
        where: { tenantId, email: input.email, usedAt: null },
      });

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invitation = await prisma.userInvitation.create({
        data: {
          tenantId,
          email:     input.email,
          name:      input.name,
          role:      input.role,
          groupId:   input.groupId ?? null,
          expiresAt,
        },
        include: { tenant: { select: { name: true } } },
      });

      const activationUrl = `${APP_URL()}/invite/${invitation.token}`;

      notifyInvitation(
        { name: input.name, email: input.email },
        ctx.session.user.name ?? "El equipo",
        invitation.tenant.name,
        activationUrl,
      ).catch(console.error);

      return invitation;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
    return prisma.userInvitation.findMany({
      where:   { tenantId: ctx.session.user.tenantId, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
  }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      return prisma.userInvitation.delete({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
      });
    }),
});

// ─── Sub-router: miembros ─────────────────────────────────────────────────────

const membersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.session.user.tenantId;
    return prisma.user.findMany({
      where:   { tenantId, role: { in: ["ADMIN", "AGENT"] } },
      select: {
        id:        true,
        name:      true,
        email:     true,
        role:      true,
        createdAt: true,
        groups: {
          select: {
            group: { select: { id: true, name: true, color: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });
  }),

  // Todos los usuarios de la empresa (para la pestaña Usuarios en config)
  listAll: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx.session.user.role);
    const tenantId = ctx.session.user.tenantId;
    return prisma.user.findMany({
      where:   { tenantId },
      select: {
        id:             true,
        name:           true,
        email:          true,
        role:           true,
        emailSignature: true,
        createdAt:      true,
        groups: {
          select: { group: { select: { id: true, name: true, color: true } } },
        },
        _count: {
          select: {
            ticketsCreated:  true,
            ticketsAssigned: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
  }),

  updateRole: protectedProcedure
    .input(z.object({
      userId: z.string(),
      role:   z.enum(["AGENT", "ADMIN"]),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes cambiar tu propio rol" });
      }
      return prisma.user.update({
        where: { id: input.userId, tenantId: ctx.session.user.tenantId },
        data:  { role: input.role },
      });
    }),

  deleteUser: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const tenantId = ctx.session.user.tenantId;

      if (input.userId === ctx.session.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No puedes eliminarte a ti mismo" });
      }

      const user = await prisma.user.findFirst({
        where:  { id: input.userId, tenantId },
        select: { id: true, name: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Usuario no encontrado" });
      }

      // Desasignar tickets que tenga asignados (no los eliminamos, solo los dejamos sin agente)
      await prisma.ticket.updateMany({
        where: { tenantId, assignedToId: input.userId },
        data:  { assignedToId: null },
      });

      // Eliminar membresías de grupo
      await prisma.groupMember.deleteMany({ where: { userId: input.userId } });

      // Eliminar el usuario
      await prisma.user.delete({ where: { id: input.userId } });

      return { ok: true };
    }),
});

// ─── Main teams router ────────────────────────────────────────────────────────

export const teamsRouter = router({
  groups:  groupsRouter,
  invite:  inviteRouter,
  members: membersRouter,
});
