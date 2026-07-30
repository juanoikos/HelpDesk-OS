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
import { locationsRouter } from "./locations";
import { monitoringRouter } from "./monitoring";
import { vmsRouter } from "./vms";

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
  locations:       locationsRouter,
  monitoring:      monitoringRouter,
  vms:             vmsRouter,
});

export type AppRouter = typeof appRouter;
