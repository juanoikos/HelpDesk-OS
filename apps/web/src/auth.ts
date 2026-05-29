import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@helpdesk-os/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
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

        const user = await prisma.user.findFirst({
          where: { email },
          include: { tenant: true },
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
      session.user.id        = token.sub as string; // token.sub = user.id del authorize()
      session.user.role      = token.role;
      session.user.tenantId  = token.tenantId;
      session.user.tenantSlug  = token.tenantSlug;
      session.user.tenantName  = token.tenantName;
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
