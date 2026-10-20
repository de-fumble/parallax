import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useMatches,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { Analytics } from "@vercel/analytics/react";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import { WorkspaceProvider } from "@/hooks/use-workspace";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppHeader } from "@/components/AppHeader";
import { ResearchWatcher } from "@/components/ResearchWatcher";
import { RouteProgress } from "@/components/RouteProgress";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

// A page's code failed to download: the server was restarted or redeployed
// while this tab was open, so the files it expects are gone.
const STALE_CODE = /dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;
const RELOADED_KEY = "parallax:reloaded-for-stale-code";

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  // Stale code is fixed by loading the page afresh, so do that once
  // automatically instead of leaving the user on an error screen.
  const message = error instanceof Error ? error.message : String(error);
  const stale = STALE_CODE.test(message);
  useEffect(() => {
    if (!stale) return;
    const last = Number(sessionStorage.getItem(RELOADED_KEY) ?? 0);
    if (Date.now() - last < 30_000) return; // already tried; don't loop
    sessionStorage.setItem(RELOADED_KEY, String(Date.now()));
    window.location.reload();
  }, [stale]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        {import.meta.env.DEV && (
          <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap border border-border bg-muted p-3 text-left font-mono text-xs text-muted-foreground">
            {message}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      // viewport-fit=cover lets the page use the whole screen on notched phones;
      // bars at the edges then pad themselves with the safe-area insets.
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#fcfcfc" },
      { title: "Parallax" },
      { name: "description", content: "Evidence-linked research reports." },
      { property: "og:title", content: "Parallax" },
      { property: "og:description", content: "Evidence-linked research reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&family=Work+Sans:wght@400;500;600&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
        <Analytics />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const isMobile = useIsMobile();
  const inWorkspace = useMatches({ select: (matches) => matches.some((m) => m.routeId === "/_workspace") });

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WorkspaceProvider>
        <RouteProgress />
        <ResearchWatcher />
        <div className="min-h-screen">
          {/* The workspace brings its own sidebar and top bar. */}
          {!inWorkspace && <AppHeader />}
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </div>
        {/* On a phone the bottom edge holds the main action, so notices come in at the top. */}
        <Toaster position={isMobile ? "top-center" : "bottom-right"} />
        </WorkspaceProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
