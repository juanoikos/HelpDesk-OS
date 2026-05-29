import { router } from "../trpc";
import { wizardRouter } from "./wizard";
import { settingsRouter } from "./settings";
import { ticketsRouter } from "./tickets";
import { teamsRouter } from "./teams";

export const appRouter = router({
  wizard:   wizardRouter,
  settings: settingsRouter,
  tickets:  ticketsRouter,
  teams:    teamsRouter,
});

export type AppRouter = typeof appRouter;
