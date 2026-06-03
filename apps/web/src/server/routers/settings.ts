import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@helpdesk-os/db";
import { TRPCError } from "@trpc/server";
import bcrypt from "bcryptjs";

function requireAdmin(role: string) {
  if (role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo los administradores pueden realizar esta acción" });
  }
}

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido");

// ─── Defaults de configuración de vistas ──────────────────────────────────────

const DEFAULT_USER_VIEW: Record<string, "hidden" | "optional" | "required"> = {
  area:             "optional",
  location:         "hidden",
  requesterContact: "optional",
  equipmentName:    "optional",
  subcategory:      "hidden",
};

const DEFAULT_AGENT_VIEW: Record<string, "hidden" | "optional" | "required"> = {
  type:             "optional",
  priority:         "optional",
  impact:           "optional",
  area:             "optional",
  location:         "optional",
  affectedSystem:   "optional",
  appVersion:       "hidden",
  siteType:         "hidden",
  deviceType:       "optional",
  deviceDetail:     "optional",
  requesterName:    "optional",
  requesterContact: "optional",
  equipmentName:    "optional",
  techCategory:     "hidden",
  urgency:          "optional",
  diagnosis:        "hidden",
};

export const settingsRouter = router({

  // ── Perfil ─────────────────────────────────────────────────────────────────
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return prisma.user.findUnique({
      where:  { id: ctx.session.user.id },
      select: {
        id:             true,
        name:           true,
        email:          true,
        role:           true,
        emailSignature: true,
        createdAt:      true,
        tenant:         { select: { id: true, name: true, slug: true } },
      },
    });
  }),

  updateProfile: protectedProcedure
    .input(z.object({
      name:  z.string().min(2, "Mínimo 2 caracteres").max(80).optional(),
      email: z.string().email("Correo inválido").optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userId   = ctx.session.user.id;
      const tenantId = ctx.session.user.tenantId;
      if (input.email) {
        const dup = await prisma.user.findFirst({
          where: { tenantId, email: input.email, id: { not: userId } },
        });
        if (dup) throw new TRPCError({ code: "CONFLICT", message: "Ya existe una cuenta con ese correo en este tenant" });
      }
      return prisma.user.update({ where: { id: userId }, data: input });
    }),

  updateSignature: protectedProcedure
    .input(z.object({ signature: z.string().max(500) }))
    .mutation(async ({ input, ctx }) => {
      return prisma.user.update({
        where: { id: ctx.session.user.id },
        data:  { emailSignature: input.signature || null },
      });
    }),

  changePassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string(),
      newPassword:     z.string().min(8, "Mínimo 8 caracteres"),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await prisma.user.findUnique({
        where:  { id: ctx.session.user.id },
        select: { passwordHash: true },
      });
      if (!user?.passwordHash) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Esta cuenta no tiene contraseña configurada" });
      }
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) throw new TRPCError({ code: "UNAUTHORIZED", message: "Contraseña actual incorrecta" });
      const newHash = await bcrypt.hash(input.newPassword, 12);
      await prisma.user.update({ where: { id: ctx.session.user.id }, data: { passwordHash: newHash } });
      return { ok: true };
    }),

  // ── Categorías ─────────────────────────────────────────────────────────────
  listCategories: protectedProcedure.query(async ({ ctx }) => {
    return prisma.category.findMany({
      where:   { tenantId: ctx.session.user.tenantId, parentId: null },
      include: {
        children: { orderBy: { createdAt: "asc" } },
        _count:   { select: { tickets: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }),

  createCategory: protectedProcedure
    .input(z.object({
      name:     z.string().min(2, "Mínimo 2 caracteres").max(50),
      color:    colorSchema,
      parentId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      return prisma.category.create({
        data: { tenantId: ctx.session.user.tenantId, ...input },
      });
    }),

  updateCategory: protectedProcedure
    .input(z.object({
      id:    z.string(),
      name:  z.string().min(2).max(50).optional(),
      color: colorSchema.optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const { id, ...data } = input;
      return prisma.category.update({
        where: { id, tenantId: ctx.session.user.tenantId },
        data,
      });
    }),

  deleteCategory: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const tickets = await prisma.ticket.count({
        where: { categoryId: input.id, tenantId: ctx.session.user.tenantId },
      });
      if (tickets > 0) {
        throw new TRPCError({
          code:    "BAD_REQUEST",
          message: `No puedes eliminar esta categoría — tiene ${tickets} ticket(s) asignado(s)`,
        });
      }
      // Delete subcategories first
      await prisma.category.deleteMany({
        where: { parentId: input.id, tenantId: ctx.session.user.tenantId },
      });
      return prisma.category.delete({
        where: { id: input.id, tenantId: ctx.session.user.tenantId },
      });
    }),

  // ── Canales ────────────────────────────────────────────────────────────────
  listChannels: protectedProcedure.query(async ({ ctx }) => {
    return prisma.channel.findMany({
      where: { tenantId: ctx.session.user.tenantId },
    });
  }),

  toggleChannel: protectedProcedure
    .input(z.object({
      type:   z.enum(["EMAIL", "WHATSAPP_BAILEYS", "WHATSAPP_META", "PHONE", "TEAMS"]),
      active: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const tenantId = ctx.session.user.tenantId;
      return prisma.channel.upsert({
        where:  { tenantId_type: { tenantId, type: input.type } },
        update: { isActive: input.active },
        create: { tenantId, type: input.type, config: {}, isActive: input.active },
      });
    }),

  // ── Configuración IMAP de canal Email ─────────────────────────────────────
  getChannelConfig: protectedProcedure
    .input(z.object({ type: z.literal("EMAIL") }))
    .query(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const ch = await prisma.channel.findUnique({
        where: { tenantId_type: { tenantId: ctx.session.user.tenantId, type: input.type } },
      });
      return (ch?.config ?? {}) as {
        imapHost?:     string;
        imapPort?:     number;
        imapUser?:     string;
        imapPassword?: string;
        imapTls?:      boolean;
      };
    }),

  updateChannelConfig: protectedProcedure
    .input(z.object({
      type: z.literal("EMAIL"),
      config: z.object({
        imapHost:     z.string().optional(),
        imapPort:     z.number().int().min(1).max(65535).optional(),
        imapUser:     z.string().optional(),
        imapPassword: z.string().optional(),
        imapTls:      z.boolean().optional(),
      }),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const tenantId = ctx.session.user.tenantId;
      const existing = await prisma.channel.findUnique({
        where: { tenantId_type: { tenantId, type: input.type } },
      });
      const merged = { ...(existing?.config as Record<string, unknown> ?? {}), ...input.config };
      return prisma.channel.upsert({
        where:  { tenantId_type: { tenantId, type: input.type } },
        create: { tenantId, type: input.type, config: merged, isActive: false },
        update: { config: merged },
      });
    }),

  // ── Configuración de vistas de ticket ──────────────────────────────────────
  getFormConfig: protectedProcedure.query(async ({ ctx }) => {
    const s = await prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.session.user.tenantId },
    });
    const userView  = (s?.userViewConfig  && typeof s.userViewConfig  === "object" && !Array.isArray(s.userViewConfig))
      ? { ...DEFAULT_USER_VIEW,  ...(s.userViewConfig  as Record<string, "hidden" | "optional" | "required">) }
      : DEFAULT_USER_VIEW;
    const agentView = (s?.agentViewConfig && typeof s.agentViewConfig === "object" && !Array.isArray(s.agentViewConfig))
      ? { ...DEFAULT_AGENT_VIEW, ...(s.agentViewConfig as Record<string, "hidden" | "optional" | "required">) }
      : DEFAULT_AGENT_VIEW;
    return { userView, agentView };
  }),

  updateFormConfig: protectedProcedure
    .input(z.object({
      view:   z.enum(["user", "agent"]),
      config: z.record(z.enum(["hidden", "optional", "required"])),
    }))
    .mutation(async ({ input, ctx }) => {
      requireAdmin(ctx.session.user.role);
      const tenantId = ctx.session.user.tenantId;
      const data = input.view === "user"
        ? { userViewConfig: input.config }
        : { agentViewConfig: input.config };
      return prisma.tenantSettings.upsert({
        where:  { tenantId },
        create: { tenantId, ...data },
        update: data,
      });
    }),
});
