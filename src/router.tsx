import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { PageSkeleton } from "@/components/Loading";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Start loading a page as soon as its link is hovered, and cross-fade between pages.
    defaultPreload: "intent",
    defaultViewTransition: true,
    defaultPendingComponent: PageSkeleton,
    defaultPendingMs: 250,
    defaultPendingMinMs: 350,
  });

  return router;
};
