import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/routers";

// Hook de tRPC para usar en componentes React
export const trpc = createTRPCReact<AppRouter>();
