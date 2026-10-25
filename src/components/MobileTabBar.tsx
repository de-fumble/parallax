import { Link, useRouterState } from "@tanstack/react-router";
import { GitPullRequest, History, Loader2, Search, SquarePen, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { isRunning, useResearchRun } from "@/lib/research-run";
import { useSidebar } from "@/components/ui/sidebar";

// The phone's home bar: a floating glass capsule with the places you go most.
// Everything else (workspaces, account, the tour) lives in the drawer behind "You".
export function MobileTabBar({ onSearch }: { onSearch: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { org } = useWorkspace();
  const { user } = useAuth();
  const run = useResearchRun();
  const { setOpenMobile } = useSidebar();
  const running = isRunning(run);
  const ready = run.status === "done";

  const tap = () => {
    // A light tick on phones that support it.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(4);
  };

  const tab = (active: boolean) =>
    `press relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.4rem] text-[10px] font-medium transition-colors duration-200 ${
      active ? "bg-foreground/[0.07] text-foreground" : "text-muted-foreground"
    }`;
  const icon = (active: boolean) => `size-6 transition-transform duration-300 ${active ? "scale-105" : ""}`;

  const researchActive = pathname === "/research";
  const historyActive = pathname === "/history" || pathname.startsWith("/reports/");
  const orgActive = pathname === "/org" || pathname.startsWith("/org/") || pathname === "/organization";
  const initial = user?.email?.slice(0, 1) ?? "";

  return (
    <nav aria-label="Main" className="tabbar fixed z-40 flex md:hidden print:hidden">
      <Link to="/research" onClick={tap} className={tab(researchActive)} aria-label="New research" aria-current={researchActive ? "page" : undefined}>
        {running ? <Loader2 className={`${icon(true)} animate-spin text-accent`} /> : <SquarePen className={icon(researchActive)} strokeWidth={researchActive ? 2.25 : 1.75} />}
        <span>{running ? "Running" : "Research"}</span>
        {ready && !researchActive && <span aria-hidden className="absolute right-[26%] top-2 size-2.5 rounded-full bg-strong ring-2 ring-background" />}
      </Link>
      <Link to="/history" onClick={tap} className={tab(historyActive)} aria-label="History" aria-current={historyActive ? "page" : undefined}>
        <History className={icon(historyActive)} strokeWidth={historyActive ? 2.25 : 1.75} />
        <span>History</span>
      </Link>
      {org && (
        <Link to="/org" onClick={tap} className={tab(orgActive)} aria-label="Collaboration" aria-current={orgActive ? "page" : undefined}>
          <GitPullRequest className={icon(orgActive)} strokeWidth={orgActive ? 2.25 : 1.75} />
          <span>Team</span>
        </Link>
      )}
      <button type="button" onClick={() => { tap(); onSearch(); }} className={tab(false)} aria-label="Search reports">
        <Search className={icon(false)} strokeWidth={1.75} />
        <span>Search</span>
      </button>
      <button type="button" onClick={() => { tap(); setOpenMobile(true); }} className={tab(false)} aria-label="Workspace and account">
        {initial ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold uppercase text-primary-foreground">{initial}</span>
        ) : (
          <UserRound className={icon(false)} strokeWidth={1.75} />
        )}
        <span>You</span>
      </button>
    </nav>
  );
}
