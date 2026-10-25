import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { isManager, orgMembersQuery } from "@/lib/organizations";
import { notificationsQuery, projectsQuery, reviewsQuery } from "@/lib/collab/db";
import { CollabProvider } from "@/components/collab/kit";
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
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl sm:text-4xl">Collaboration</h1>
        <div className="mt-8 border border-dashed border-border p-8 text-center">
          <p className="font-serif text-2xl">Collaboration happens inside an organization</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Switch to an organization from the workspace menu at the top of the sidebar, or create one there, to work on research together.
          </p>
        </div>
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

  const tabs: { to: string; label: string; count?: number | undefined; exact?: boolean; hidden?: boolean }[] = [
    { to: "/org", label: "Overview", exact: true },
    { to: "/org/projects", label: "Projects" },
    { to: "/org/drafts", label: "Drafts" },
    { to: "/org/reviews", label: "Reviews", count: open },
    { to: "/org/board", label: "Board" },
    { to: "/org/library", label: "Library" },
    { to: "/org/insights", label: "Insights" },
    { to: "/org/inbox", label: "Inbox", count: unread },
    { to: "/org/audit", label: "Audit log", hidden: !isManager(org!.role) },
    { to: "/org/settings", label: "Settings" },
  ];

  return (
    <div className="min-w-0">
      <div className="border-b border-border">
        <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
          <div className="flex items-baseline gap-2 text-sm text-muted-foreground">
            <span className="truncate">{org!.name}</span>
            <span>/</span>
            <span className="text-foreground">Collaboration</span>
          </div>
          <nav data-tour="org-tabs" aria-label="Collaboration sections" className="-mb-px mt-3 flex gap-1 overflow-x-auto">
            {tabs.filter((t) => !t.hidden).map((t) => {
              const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(`${t.to}/`);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                    active ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                  {!!t.count && <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] text-foreground">{t.count}</span>}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {projects.isError ? <p className="border border-weak/40 bg-weak/5 p-4 text-sm">{projects.error.message}</p> : <Outlet />}
      </div>
    </div>
  );
}
