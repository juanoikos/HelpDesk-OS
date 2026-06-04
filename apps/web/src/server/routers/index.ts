import { router } from "../trpc";
import { wizardRouter } from "./wizard";
import { settingsRouter } from "./settings";
import { ticketsRouter } from "./tickets";
import { teamsRouter } from "./teams";
import { cannedResponsesRouter } from "./cannedResponses";
import { reportsRouter } from "./reports";
import { assetsRouter } from "./assets";
import { networkDevicesRouter } from "./networkDevices";
import { dvrsRouter } from "./dvrs";

export const appRouter = router({
  wizard:          wizardRouter,
  settings:        settingsRouter,
  tickets:         ticketsRouter,
  teams:           teamsRouter,
  cannedResponses: cannedResponsesRouter,
  reports:         reportsRouter,
  assets:          assetsRouter,
  networkDevices:  networkDevicesRouter,
  dvrs:            dvrsRouter,
});

export type AppRouter = typeof appRouter;
