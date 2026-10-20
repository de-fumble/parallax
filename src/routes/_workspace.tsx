import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { CommandMenu } from "@/components/CommandMenu";
import { OrgBranding } from "@/components/OrgBranding";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

// The signed-in workspace: a sidebar, a top bar, and the page beside them.
// A layout route — it adds no URL segment, so /research stays /research.
export const Route = createFileRoute("/_workspace")({
  component: Workspace,
});

function sectionName(pathname: string) {
  if (pathname.startsWith("/reports/")) return "Report";
  if (pathname === "/history") return "History";
  if (pathname === "/organization") return "Organization";
  if (pathname === "/org" || pathname.startsWith("/org/")) return "Collaboration";
  return "New research";
}

function Workspace() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [searchOpen, setSearchOpen] = useState(false);
  const workspace = useWorkspace();

  // The workspace is for signed-in users; everyone else is sent to sign in.
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth", search: { redirect: pathname }, replace: true });
  }, [loading, user, navigate, pathname]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center" aria-label="Loading workspace">
        <div className="w-full max-w-md space-y-3 px-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <OrgBranding />
      <WorkspaceSidebar onSearch={() => setSearchOpen(true)} />
      <SidebarInset className="min-w-0">
        <header className="workspace-bar sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-2 backdrop-blur-md sm:gap-3 sm:px-4">
          <SidebarTrigger />
          <span className="h-4 w-px bg-border" />
          <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
            <span className="hidden max-w-40 truncate text-muted-foreground sm:inline">{workspace.name}</span>
            <span className="hidden text-muted-foreground sm:inline">/</span>
            <span className="font-medium">{sectionName(pathname)}</span>
          </nav>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Search reports"
            className="ml-auto flex size-10 items-center justify-center gap-2 border border-border bg-card text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground sm:h-8 sm:w-auto sm:px-3"
          >
            <Search className="size-4 sm:size-3.5" />
            <span className="hidden sm:inline">Search reports</span>
            {/* A keyboard shortcut means nothing on a phone. */}
            <kbd className="hidden font-mono text-[10px] sm:inline">⌘K</kbd>
          </button>
        </header>
        <Outlet />
      </SidebarInset>
      <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
    </SidebarProvider>
  );
}
