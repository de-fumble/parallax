import { useEffect, useState } from "react";
import { Check, Clock, Loader2 } from "lucide-react";
import { MAX_AUTO_RETRIES, useResearchActions, type ResearchRun } from "@/lib/research-run";
import { Button } from "@/components/ui/button";

type ActiveRun = Extract<ResearchRun, { status: "searching" | "writing" | "waiting" }>;

function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function clock(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

type StepState = "done" | "active" | "waiting" | "held";

function Step({ state, title, detail }: { state: StepState; title: string; detail?: string | undefined }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${
          state === "done"
            ? "border-strong bg-strong text-background"
            : state === "active"
              ? "border-accent text-accent"
              : state === "held"
                ? "border-moderate bg-moderate/25 text-foreground"
                : "border-border text-transparent"
        }`}
      >
        {state === "done" && <Check className="size-3 animate-in zoom-in-50 duration-300" />}
        {state === "active" && <Loader2 className="size-3 animate-spin" />}
        {state === "held" && <Clock className="size-3" />}
      </span>
      <div className={`transition-opacity duration-300 ${state === "waiting" ? "opacity-45" : ""}`}>
        <div className="text-sm font-medium">{title}</div>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </div>
    </li>
  );
}

export function ResearchProgress({ run }: { run: ActiveRun }) {
  const now = useNow();
  const { resume, dismiss } = useResearchActions();
  const [busy, setBusy] = useState(false);
  const sources = run.sources;
  const searching = run.status === "searching";
  const held = run.status === "waiting";

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-8 overflow-hidden border border-border bg-card animate-in fade-in slide-in-from-bottom-2 duration-500"
    >
      <div className={`h-0.5 overflow-hidden ${held ? "bg-moderate/40" : "bg-accent/15"}`}>
        {!held && <div className="indeterminate-bar h-full w-1/3 bg-accent" />}
      </div>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {held ? "Research on hold" : "Research in progress"}
            </p>
            <p className="mt-2 font-serif text-xl leading-snug [overflow-wrap:anywhere] sm:text-2xl">{run.input.topic}</p>
          </div>
          <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">{clock(now - run.startedAt)}</span>
        </div>

        <ol className="space-y-4">
          <Step
            state={searching ? "active" : "done"}
            title="Gathering sources"
            detail={
              searching
                ? run.input.useWeb
                  ? "Searching the web…"
                  : "Preparing your sources…"
                : `${sources.length} ${sources.length === 1 ? "source" : "sources"} collected${run.attempt > 0 ? " and saved" : ""}`
            }
          />
          <Step
            state={searching ? "waiting" : held ? "held" : "active"}
            title="Reading the evidence and writing the report"
            detail={
              searching
                ? undefined
                : held
                  ? "On hold until the AI provider responds."
                  : run.attempt > 0
                    ? `Trying again — retry ${run.attempt} of ${MAX_AUTO_RETRIES}.`
                    : "Checking claims against sources. This is the long step — often a minute or two."
            }
          />
          <Step state="waiting" title="Report ready" />
        </ol>

        {held && (
          <div className="border border-moderate/50 bg-moderate/10 p-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
            <p className="text-sm font-medium">The AI provider isn't responding right now.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Nothing is lost: your {sources.length} {sources.length === 1 ? "source is" : "sources are"} saved, so the search won't be
              repeated. Parallax will try again by itself, waiting a little longer each time.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Retry {run.attempt} of {MAX_AUTO_RETRIES} in
                </div>
                <div className="font-mono text-2xl tabular-nums">{clock(run.retryAt - now)}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); await resume(true); setBusy(false); }}>
                  Try now
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => void dismiss()}>
                  Cancel research
                </Button>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Last response: {run.reason}</p>
          </div>
        )}

        {sources.length > 0 && (
          <ul className="grid gap-x-6 gap-y-1.5 border-t border-border pt-5 text-xs sm:grid-cols-2">
            {sources.map((s, i) => (
              <li
                key={s.id}
                className="flex min-w-0 items-baseline gap-2 animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-300"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <span className="font-mono text-muted-foreground">{s.id}</span>
                <span className="truncate">{s.title}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">{s.domain}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="border-t border-border pt-4 text-xs text-muted-foreground">
          {held
            ? "You can leave this page or close the tab. Your progress is saved and the retries carry on in the background."
            : "You can keep browsing, or even reload — this keeps running, and you'll be told the moment it's ready."}
        </p>
      </div>
    </div>
  );
}
