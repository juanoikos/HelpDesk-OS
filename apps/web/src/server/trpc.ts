import { initTRPC, TRPCError } from "@trpc/server";
import { auth } from "@/auth";
import superjson from "superjson";

// Contexto que tendrá cada request (sesión del usuario)
export const createTRPCContext = async () => {
  const session = await auth();
  return { session };
};

type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
});

// Procedimiento público (sin autenticación)
export const publicProcedure = t.procedure;

// Procedimiento protegido (requiere sesión activa)
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: { session: ctx.session },
  });
});

// Procedimiento solo para administradores — reemplaza requireAdmin() en cada router
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Solo administradores" });
  }
  return next({ ctx });
});

export const router = t.router;
export const middleware = t.middleware;
