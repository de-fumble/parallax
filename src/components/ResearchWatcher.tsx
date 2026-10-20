import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useResearchActions, useResearchRun, type ResearchRun } from "@/lib/research-run";

// Reacts to a research run finishing, whichever page the user is on by then.
export function ResearchWatcher() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const run = useResearchRun();
  const { resume } = useResearchActions();
  const previous = useRef<ResearchRun["status"]>("idle");

  // A waiting run retries by itself when its time comes. The timer lives here,
  // at the root, so it fires on whichever page is open. If the due time has
  // already passed (the tab was closed meanwhile), it fires straight away.
  const retryAt = run.status === "waiting" ? run.retryAt : undefined;
  useEffect(() => {
    if (retryAt === undefined) return;
    // A little scatter, so several open tabs don't all ask in the same instant.
    const timer = setTimeout(() => void resume(false), Math.max(0, retryAt - Date.now()) + Math.random() * 1500);
    return () => clearTimeout(timer);
  }, [retryAt, resume]);

  useEffect(() => {
    const before = previous.current;
    previous.current = run.status;
    // Only announce a run this tab watched finish; one that was already over on
    // load is shown by the header and home page instead.
    if (before !== "searching" && before !== "writing") return;
    const elsewhere = router.state.location.pathname !== "/research";

    if (run.status === "waiting" && run.attempt === 1 && elsewhere) {
      toast("The AI provider isn't responding", {
        description: "Your progress is saved. Parallax will keep retrying by itself.",
        duration: 10000,
        action: { label: "View", onClick: () => router.navigate({ to: "/research" }) },
      });
    }

    if (run.status === "paused" && elsewhere) {
      toast.warning("Research paused", {
        description: "The AI provider still isn't responding. Your progress is saved for when you want to retry.",
        duration: 20000,
        action: { label: "View", onClick: () => router.navigate({ to: "/research" }) },
      });
    }

    if (run.status === "done") {
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      queryClient.invalidateQueries({ queryKey: ["collab"] });
      // Research started for a project lands as a draft there; otherwise, as a report.
      const draftId = run.draftId;
      const open = () =>
        draftId ? router.navigate({ to: "/org/drafts/$draftId", params: { draftId } }) : router.navigate({ to: "/reports/$id", params: { id: run.reportId } });
      if (router.state.location.pathname === "/research") {
        open();
      } else {
        toast.success(draftId ? "Your draft is ready" : "Your report is ready", {
          description: run.input.topic,
          duration: 15000,
          action: { label: draftId ? "Open draft" : "View report", onClick: open },
        });
      }
    }

    if (run.status === "error" && elsewhere) {
      toast.error("Research failed", {
        description: run.error,
        duration: 15000,
        action: { label: "Try again", onClick: () => router.navigate({ to: "/research" }) },
      });
    }
  }, [run, router, queryClient]);

  return null;
}
