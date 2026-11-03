import { QueryClient } from "@tanstack/react-query";
import { createRoute, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { TeamCreateUserPage } from "./pages/TeamCreateUserPage";
import { SetupAccountPage } from "./pages/SetupAccountPage";

// Keep generated routeTree.gen.ts untouched: these two routes are deliberately
// registered at runtime so the protected generated file remains user-owned.
type RuntimeRoute = {
  id: string;
  options?: { id?: string; path?: string };
  children?: RuntimeRoute[];
  addChildren(children: RuntimeRoute[]): RuntimeRoute;
};
const rootRoute = routeTree as unknown as RuntimeRoute;
const rootChildren = rootRoute.children ?? [];
const appRoute = rootChildren.find((route) => route.options?.id === "/_app");
if (!appRoute) throw new Error("The authenticated application route is unavailable.");
const appChildren = appRoute.children ?? [];
if (
  !appChildren.some(
    (route) => route.options?.id === "/team/new" || route.options?.path === "/team/new",
  )
) {
  const teamCreateRoute = createRoute({
    getParentRoute: () => appRoute as never,
    path: "/team/new",
    component: TeamCreateUserPage,
  }) as unknown as RuntimeRoute;
  appRoute.addChildren([...appChildren, teamCreateRoute]);
}
if (
  !rootChildren.some(
    (route) => route.options?.id === "/setup-account" || route.options?.path === "/setup-account",
  )
) {
  const setupAccountRoute = createRoute({
    getParentRoute: () => rootRoute as never,
    path: "/setup-account",
    component: SetupAccountPage,
  }) as unknown as RuntimeRoute;
  rootRoute.addChildren([...rootChildren, setupAccountRoute]);
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
