import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@helpdesk-os/db";
import bcrypt from "bcryptjs";
import { z } from "zod";
import type { UserRole } from "@prisma/client";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Separar en dos pasos evita el error de TypeScript con isolatedModules:
// "The inferred type of 'auth' cannot be named without a reference to next-auth/lib"
const _nextAuth = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Correo", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Si el mismo email existe en varios tenants (ej: invitado + creó empresa propia),
        // se usa la cuenta más antigua (la del tenant al que fue invitado correctamente)
        const user = await prisma.user.findFirst({
          where:   { email },
          include: { tenant: true },
          orderBy: { createdAt: "asc" },
        });

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenantId,
          tenantSlug: user.tenant.slug,
          tenantName: user.tenant.name,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.tenantSlug = user.tenantSlug;
        token.tenantName = user.tenantName;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id         = token.sub as string;
      session.user.role       = token.role as UserRole;
      session.user.tenantId   = token.tenantId as string;
      session.user.tenantSlug = token.tenantSlug as string;
      session.user.tenantName = token.tenantName as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
  },
});

export const { handlers, auth, signIn, signOut } = _nextAuth;
