import { router } from "../trpc";
import { wizardRouter } from "./wizard";
import { settingsRouter } from "./settings";
import { ticketsRouter } from "./tickets";
import { teamsRouter } from "./teams";
import { cannedResponsesRouter } from "./cannedResponses";
import { reportsRouter } from "./reports";
import { assetsRouter } from "./assets";

export const appRouter = router({
  wizard:          wizardRouter,
  settings:        settingsRouter,
  tickets:         ticketsRouter,
  teams:           teamsRouter,
  cannedResponses: cannedResponsesRouter,
  reports:         reportsRouter,
  assets:          assetsRouter,
});

export type AppRouter = typeof appRouter;
