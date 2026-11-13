import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { isRunning, useResearchRun } from "@/lib/research-run";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ParallaxMark } from "@/components/ParallaxMark";

// Visible on every page, so a run started on the home page is never out of sight.
function RunStatus() {
  const run = useResearchRun();
  const pill = "flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors animate-in fade-in zoom-in-95 duration-300";

  if (isRunning(run)) {
    return (
      <Link to="/research" className={`${pill} border-foreground/15 bg-foreground/[0.04] text-foreground hover:bg-foreground/[0.07]`}>
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-strong opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-strong" />
        </span>
        {run.status === "searching" ? "Gathering sources…" : "Writing report…"}
      </Link>
    );
  }
  if (run.status === "waiting" || run.status === "paused") {
    return (
      <Link to="/research" className={`${pill} border-moderate/50 bg-moderate/15 text-foreground hover:bg-moderate/25`}>
        {run.status === "waiting" ? "Waiting to retry…" : "Research paused"}
      </Link>
    );
  }
  if (run.status === "done") {
    const style = `${pill} border-strong/40 bg-strong/10 text-strong hover:bg-strong/15`;
    return run.draftId ? (
      <Link to="/org/drafts/$draftId" params={{ draftId: run.draftId }} className={style}>
        Draft ready <ArrowRight className="size-3" />
      </Link>
    ) : (
      <Link to="/reports/$id" params={{ id: run.reportId }} className={style}>
        Report ready <ArrowRight className="size-3" />
      </Link>
    );
  }
  return null;
}

export function AppHeader() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="app-header sticky top-0 z-40 border-b border-border/60 bg-background/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
        <Link to="/" className="group flex items-center gap-2.5 py-2">
          <ParallaxMark className="h-5 w-auto transition-transform duration-300 group-hover:-translate-y-0.5" />
          <span className="text-[17px] font-semibold tracking-tight">Parallax</span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <RunStatus />
          {loading ? (
            <Skeleton className="h-8 w-28" />
          ) : user ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex"
                onClick={async () => {
                  await supabase.auth.signOut();
                  navigate({ to: "/" });
                }}
              >
                Sign out
              </Button>
              <Button asChild size="sm">
                <Link to="/research">Open workspace</Link>
              </Button>
            </>
          ) : (
            <Button asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
