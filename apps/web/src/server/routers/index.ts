import { router } from "../trpc";
import { wizardRouter } from "./wizard";
import { settingsRouter } from "./settings";

export const appRouter = router({
  wizard: wizardRouter,
  settings: settingsRouter,
});

export type AppRouter = typeof appRouter;
