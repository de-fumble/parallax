import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Clock, Compass, FileText, GitPullRequest, History, Home, Loader2, LogOut, Pause, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { reportListQuery } from "@/lib/reports.queries";
import { isRunning, useResearchRun } from "@/lib/research-run";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { useTour } from "@/components/Tour";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const RECENT_LIMIT = 8;

export function WorkspaceSidebar() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const run = useResearchRun();
  const { org, orgId } = useWorkspace();
  const reports = useQuery({ ...reportListQuery(user?.id ?? "", orgId), enabled: !!user });
  const { setOpenMobile } = useSidebar();
  const tour = useTour();
  // On a phone the sidebar is a drawer; close it once a destination is picked.
  const close = () => setOpenMobile(false);

  const recent = reports.data?.slice(0, RECENT_LIMIT) ?? [];
  const email = user?.email ?? "";

  return (
    <Sidebar collapsible="icon" className="app-sidebar">
      <SidebarHeader data-tour="workspace">
        <WorkspaceSwitcher onNavigate={close} />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="New research"
                  className="mb-2 h-9 justify-center bg-primary font-medium text-primary-foreground shadow-[var(--shadow-soft)] hover:bg-primary/85 hover:text-primary-foreground active:bg-primary/85 active:text-primary-foreground group-data-[collapsible=icon]:justify-start"
                >
                  <Link to="/research" onClick={close}>
                    <Plus />
                    <span>New research</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem data-tour="history">
                <SidebarMenuButton asChild tooltip="History" isActive={pathname === "/history"}>
                  <Link to="/history" onClick={close}>
                    <History />
                    <span>History</span>
                    {reports.data && reports.data.length > 0 && (
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{reports.data.length}</span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {org && (
                <SidebarMenuItem data-tour="collab">
                  <SidebarMenuButton asChild tooltip="Team" isActive={pathname === "/org" || pathname.startsWith("/org/") || pathname === "/organization"}>
                    <Link to="/org" onClick={close}>
                      <GitPullRequest />
                      <span>Team</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {run.status !== "idle" && run.status !== "error" && (
          <SidebarGroup>
            <SidebarGroupLabel>In progress</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  {isRunning(run) ? (
                    <SidebarMenuButton asChild tooltip="Research in progress" isActive={pathname === "/research"}>
                      <Link to="/research" onClick={close}>
                        <Loader2 className="animate-spin" />
                        <span>{run.status === "searching" ? "Gathering sources…" : "Writing report…"}</span>
                      </Link>
                    </SidebarMenuButton>
                  ) : run.status === "waiting" || run.status === "paused" ? (
                    <SidebarMenuButton asChild tooltip={run.status === "waiting" ? "Waiting to retry" : "Research paused"} isActive={pathname === "/research"}>
                      <Link to="/research" onClick={close}>
                        {run.status === "waiting" ? <Clock /> : <Pause />}
                        <span>{run.status === "waiting" ? "Waiting to retry…" : "Research paused"}</span>
                      </Link>
                    </SidebarMenuButton>
                  ) : run.status === "done" ? (
                    <SidebarMenuButton asChild tooltip={run.draftId ? "Draft ready" : "Report ready"} className="text-strong hover:text-strong">
                      {run.draftId ? (
                        <Link to="/org/drafts/$draftId" params={{ draftId: run.draftId }} onClick={close}>
                          <Check />
                          <span>Draft ready</span>
                        </Link>
                      ) : (
                        <Link to="/reports/$id" params={{ id: run.reportId }} onClick={close}>
                          <Check />
                          <span>Report ready</span>
                        </Link>
                      )}
                    </SidebarMenuButton>
                  ) : null}
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Recent</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {reports.isPending && [0, 1, 2].map((i) => <SidebarMenuSkeleton key={i} />)}
              {reports.data?.length === 0 && (
                <li className="px-2 py-1.5 text-xs text-muted-foreground">Your reports will appear here.</li>
              )}
              {recent.map((r) => (
                <SidebarMenuItem key={r.id}>
                  <SidebarMenuButton asChild isActive={pathname === `/reports/${r.id}`}>
                    <Link to="/reports/$id" params={{ id: r.id }} onClick={close}>
                      <FileText />
                      <span>{r.title || r.topic}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {reports.data && reports.data.length > RECENT_LIMIT && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild className="text-muted-foreground">
                    <Link to="/history" onClick={close}>
                      <span>View all {reports.data.length}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={email || "Account"}>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold uppercase text-foreground">
                    {email.slice(0, 1) || "·"}
                  </span>
                  <span className="truncate text-[13px] text-muted-foreground">{email}</span>
                  <ChevronsUpDown className="ml-auto text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-52">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => { close(); tour.start(); }}>
                  <Compass /> Take the tour
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { close(); navigate({ to: "/" }); }}>
                  <Home /> Home page
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={async () => {
                    await supabase.auth.signOut();
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
