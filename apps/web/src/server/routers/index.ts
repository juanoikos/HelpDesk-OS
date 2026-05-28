import { router } from "../trpc";
import { wizardRouter } from "./wizard";

export const appRouter = router({
  wizard: wizardRouter,
});

// Tipo del router — lo importan los clientes para tener autocompletado
export type AppRouter = typeof appRouter;
