import { router } from "../trpc";
import { wizardRouter } from "./wizard";
import { settingsRouter } from "./settings";
import { ticketsRouter } from "./tickets";

export const appRouter = router({
  wizard:   wizardRouter,
  settings: settingsRouter,
  tickets:  ticketsRouter,
});

export type AppRouter = typeof appRouter;
