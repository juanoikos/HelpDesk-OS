import type { UserRole } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      role: UserRole;
      tenantId: string;
      tenantSlug: string;
      tenantName: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: UserRole;
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: UserRole;
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
  }
}
