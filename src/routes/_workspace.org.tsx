import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { isManager, orgMembersQuery } from "@/lib/organizations";
import { notificationsQuery, projectsQuery, reviewsQuery } from "@/lib/collab/db";
import { CollabProvider } from "@/components/collab/kit";
import { BarChart3, Bell, ChevronDown, LayoutGrid, ScrollText, Settings, Users } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

// An organization's collaboration space: research handled the way GitHub
// handles code. Projects hold versioned documents; people work in drafts and
// ask for review; approved work is filed into the library.
export const Route = createFileRoute("/_workspace/org")({
  head: () => ({ meta: [{ title: "Collaboration — Parallax" }] }),
  component: CollabLayout,
});

function CollabLayout() {
  const { user } = useAuth();
  const { org, loading } = useWorkspace();
  const members = useQuery({ ...orgMembersQuery(org?.id ?? ""), enabled: !!org });

  if (loading) {
    return <div className="mx-auto max-w-6xl space-y-3 px-4 py-10 sm:px-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-80" /></div>;
  }
  if (!org) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col items-center px-4 py-24 text-center sm:px-6">
        <span className="flex size-11 items-center justify-center rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
          <Users className="size-5 text-muted-foreground" />
        </span>
        <h1 className="mt-5 text-xl">Work on research as a team</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Create an organization, or join one with an invite, from the workspace menu at the top of the sidebar.
        </p>
      </div>
    );
  }
  if (!members.data || !user) {
    return <div className="mx-auto max-w-6xl space-y-3 px-4 py-10 sm:px-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-80" /></div>;
  }

  return (
    <CollabProvider value={{ org, orgId: org.id, role: org.role, me: user.id, members: members.data }}>
      <Shell />
    </CollabProvider>
  );
}

function Shell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useAuth();
  const { org } = useWorkspace();
  const orgId = org!.id;
  const reviews = useQuery(reviewsQuery(orgId));
  const notifications = useQuery({ ...notificationsQuery(orgId, user!.id) });
  // The first query to fail on a database without the collaboration tables says so.
  const projects = useQuery(projectsQuery(orgId));

  const open = reviews.data?.filter((r) => r.status === "in_review" || r.status === "changes_requested").length;
  const unread = notifications.data?.filter((n) => !n.read_at).length;

  // The places people go every day are tabs; the rest sit one click away.
  const tabs: { to: string; label: string; count?: number | undefined; exact?: boolean }[] = [
    { to: "/org", label: "Overview", exact: true },
    { to: "/org/projects", label: "Projects" },
    { to: "/org/drafts", label: "Drafts" },
    { to: "/org/reviews", label: "Reviews", count: open },
    { to: "/org/library", label: "Library" },
  ];
  const more: { to: string; label: string; icon: typeof LayoutGrid; hidden?: boolean }[] = [
    { to: "/org/board", label: "Board", icon: LayoutGrid },
    { to: "/org/insights", label: "Insights", icon: BarChart3 },
    { to: "/org/audit", label: "Audit log", icon: ScrollText, hidden: !isManager(org!.role) },
  ];
  const isActive = (to: string, exact?: boolean) => (exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`));
  const moreActive = more.find((m) => isActive(m.to));
  const tab = (active: boolean) =>
    `flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium transition-colors ${
      active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
    }`;
  const iconLink = (active: boolean) =>
    `relative flex size-8 items-center justify-center rounded-lg transition-colors ${
      active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
    }`;

  return (
    <div className="min-w-0">
      <div className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5 sm:px-6">
          <nav data-tour="org-tabs" aria-label="Team sections" className="-mx-1 flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto px-1">
            {tabs.map((t) => (
              <Link key={t.to} to={t.to} className={tab(isActive(t.to, t.exact))} aria-current={isActive(t.to, t.exact) ? "page" : undefined}>
                {t.label}
                {!!t.count && <span className="rounded-full bg-foreground px-1.5 text-[10px] font-semibold leading-4 text-background">{t.count}</span>}
              </Link>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger className={tab(!!moreActive)}>
                {moreActive ? moreActive.label : "More"} <ChevronDown className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-44">
                {more.filter((m) => !m.hidden).map((m) => (
                  <DropdownMenuItem key={m.to} asChild>
                    <Link to={m.to}><m.icon /> {m.label}</Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
          <div className="flex shrink-0 items-center gap-0.5">
            <Link to="/org/inbox" className={iconLink(isActive("/org/inbox"))} aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"} title="Inbox">
              <Bell className="size-4" />
              {!!unread && <span aria-hidden className="absolute right-1.5 top-1.5 size-2 rounded-full bg-weak ring-2 ring-background" />}
            </Link>
            <Link to="/organization" className={iconLink(false)} aria-label="Members" title="Members">
              <Users className="size-4" />
            </Link>
            <Link to="/org/settings" className={iconLink(isActive("/org/settings"))} aria-label="Settings" title="Settings">
              <Settings className="size-4" />
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
        {projects.isError ? <LoadErrorText message={projects.error.message} /> : <Outlet />}
      </div>
    </div>
  );
}

function LoadErrorText({ message }: { message: string }) {
  return <p className="rounded-xl border border-weak/30 bg-weak/5 p-4 text-sm">{message}</p>;
}
