import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { CommandMenu } from "@/components/CommandMenu";
import { OrgBranding } from "@/components/OrgBranding";
import { TourProvider } from "@/components/Tour";
import { WorkspaceSidebar } from "@/components/WorkspaceSidebar";
import { MobileTabBar } from "@/components/MobileTabBar";
import { AppSplash } from "@/components/Loading";
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

// On a phone: the workspace's initial, which opens the drawer with workspaces and account.
function MobileDrawerButton() {
  const { setOpenMobile } = useSidebar();
  const { name } = useWorkspace();
  return (
    <button
      type="button"
      onClick={() => setOpenMobile(true)}
      aria-label={`${name} — open menu`}
      className="press flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary font-mono text-sm uppercase text-primary-foreground md:hidden"
    >
      {name.slice(0, 1)}
    </button>
  );
}

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

  if (!user) return <AppSplash />;

  return (
    <TourProvider>
      <SidebarProvider>
        <OrgBranding />
        <WorkspaceSidebar onSearch={() => setSearchOpen(true)} />
        <SidebarInset className="min-w-0 pb-[var(--tabbar-h,0px)] md:pb-0">
          <header className="workspace-bar sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/70 bg-background/85 px-3 backdrop-blur-xl sm:px-4 lg:h-15 lg:px-8">
            <MobileDrawerButton />
            <SidebarTrigger className="hidden md:inline-flex text-muted-foreground transition-colors hover:text-foreground" />
            <span className="hidden h-4 w-px bg-border/60 md:block" />
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
              <span className="hidden max-w-44 truncate font-mono text-xs tracking-tight text-muted-foreground md:inline">{workspace.name}</span>
              <span className="hidden text-xs text-border/80 md:inline">/</span>
              <span className="truncate text-lg font-semibold tracking-tight md:text-sm md:font-medium text-foreground">{sectionName(pathname)}</span>
            </nav>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search reports"
              className="ml-auto hidden h-8 items-center justify-between gap-3 border border-border/80 bg-card/60 px-3 text-xs text-muted-foreground transition-all duration-200 hover:border-foreground/40 hover:bg-card hover:text-foreground hover:shadow-xs md:flex lg:w-64 xl:w-72"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Search className="size-3.5 shrink-0 opacity-70" />
                <span className="truncate">Search reports…</span>
              </div>
              <kbd className="font-mono text-[10px] rounded border border-border/60 bg-muted/60 px-1 py-0.5 text-muted-foreground">⌘K</kbd>
            </button>
          </header>
          <div key={pathname} className="page-enter">
            <Outlet />
          </div>
        </SidebarInset>
        <MobileTabBar onSearch={() => setSearchOpen(true)} />
        <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
      </SidebarProvider>
    </TourProvider>
  );
}
