import { useCallback, useSyncExternalStore } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { reportQuery, type ReportDetail } from "./reports.queries";
import { resumeResearch, runResearch } from "./research.functions";
import { MAX_AUTO_RETRIES, RUN_STALE_AFTER_MS, type ManualSource, type Mode, type ResearchTemplate, type RunResult } from "./research.types";

// The state of a research run lives in the research_runs table, written by the
// server as the job advances. This module reads it back, so the same progress
// shows on any page, in any tab, and after a reload.

export type ResearchInput = {
  /** The organization the research is for; absent or null for the personal workspace. */
  orgId?: string | null | undefined;
  /** A project in that organization to turn the finished report into a draft in. */
  draftProjectId?: string | null | undefined;
  draftKind?: "Report" | "Literature review" | "Procedure" | "Data note" | "Proposal" | undefined;
  topic: string;
  context: string;
  mode: Mode;
  useWeb: boolean;
  /** The professional research structure; absent or disabled means the normal report. */
  template?: ResearchTemplate | null | undefined;
  manual: ManualSource[];
};

export type SourcePreview = { id: string; title: string; domain: string };

export type ResearchRun =
  | { status: "idle" }
  | {
      status: "searching" | "writing";
      input: ResearchInput;
      startedAt: number;
      sources: SourcePreview[];
      /** How many times writing has already failed; 0 on a first try. */
      attempt: number;
    }
  /** The AI provider failed; the sources are saved and a retry is scheduled. */
  | {
      status: "waiting";
      id: string;
      input: ResearchInput;
      startedAt: number;
      sources: SourcePreview[];
      attempt: number;
      retryAt: number;
      reason: string;
    }
  /** Automatic retries ran out; the sources are saved until the user retries. */
  | { status: "paused"; id: string; input: ResearchInput; sources: SourcePreview[]; reason: string }
  | { status: "done"; input: ResearchInput; reportId: string; draftId: string | null }
  | { status: "error"; input: ResearchInput; error: string };

type RunRow = {
  id: string;
  status: "searching" | "writing" | "waiting" | "paused" | "done" | "error";
  input: ResearchInput;
  sources: SourcePreview[];
  error: string | null;
  report_id: string | null;
  draft_id?: string | null;
  attempt: number;
  retry_at: string | null;
  created_at: string;
  updated_at: string;
};

export { MAX_AUTO_RETRIES };

const POLL_MS = 2000;

// What only this tab knows: a run it has just asked for that the database may
// not show yet, and a start request that failed before any row was written.
type Local = {
  pending?: { id: string; input: ResearchInput; startedAt: number };
  failed?: { input: ResearchInput; error: string };
};

let local: Local = {};
const listeners = new Set<() => void>();
const NO_LOCAL: Local = {};

function setLocal(next: Local) {
  local = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const runQuery = (userId: string) =>
  queryOptions({
    queryKey: ["research-run", userId] as const,
    staleTime: 0,
    retry: false,
    queryFn: async () => {
      const latest = (fields: string) =>
        supabase.from("research_runs").select(fields).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const FIELDS = "id, status, input, sources, error, report_id, attempt, retry_at, created_at, updated_at";
      let { data, error } = await latest(`${FIELDS}, draft_id`);
      // draft_id arrived with the collaboration schema; read without it until that has been run.
      if (error?.code === "42703") ({ data, error } = await latest(FIELDS));
      if (error) throw new Error(error.message);
      return (data as unknown as RunRow | null) ?? null;
    },
    // Poll only while something is actually in flight.
    refetchInterval: (query) => {
      const row = query.state.data;
      const active = row && (isWorking(row) || row.status === "waiting") && !isStale(row);
      return active || local.pending ? POLL_MS : false;
    },
  });

const isWorking = (row: RunRow) => row.status === "searching" || row.status === "writing";

// A run the server is meant to be working on, but which hasn't changed for too
// long: the server died. A waiting run is never stale; it is waiting on purpose.
function isStale(row: RunRow) {
  return isWorking(row) && Date.now() - Date.parse(row.updated_at) > RUN_STALE_AFTER_MS;
}

function toRun(row: RunRow | null, tab: Local): ResearchRun {
  const { pending, failed } = tab;
  // A run this tab just started outranks an older row the server is about to clear.
  if (pending && row?.id !== pending.id) {
    return { status: "searching", input: pending.input, startedAt: pending.startedAt, sources: [], attempt: 0 };
  }
  if (row) {
    if (row.status === "done") {
      return row.report_id ? { status: "done", input: row.input, reportId: row.report_id, draftId: row.draft_id ?? null } : { status: "idle" };
    }
    if (row.status === "error") {
      return { status: "error", input: row.input, error: row.error || "Research failed" };
    }
    if (isStale(row)) {
      return { status: "error", input: row.input, error: "This run was interrupted before it finished. Please run it again." };
    }
    const startedAt = pending?.startedAt ?? Date.parse(row.created_at);
    const reason = row.error || "The AI provider isn't responding.";
    if (row.status === "paused") return { status: "paused", id: row.id, input: row.input, sources: row.sources, reason };
    if (row.status === "waiting") {
      return {
        status: "waiting",
        id: row.id,
        input: row.input,
        startedAt,
        sources: row.sources,
        attempt: row.attempt,
        // A waiting row always has a retry time; fall back to "now" rather than never retrying.
        retryAt: row.retry_at ? Date.parse(row.retry_at) : Date.now(),
        reason,
      };
    }
    return { status: row.status, input: row.input, startedAt, sources: row.sources, attempt: row.attempt };
  }
  if (failed) return { status: "error", input: failed.input, error: failed.error };
  return { status: "idle" };
}

/** The server is working on it right now. */
export function isRunning(run: ResearchRun): run is Extract<ResearchRun, { status: "searching" | "writing" }> {
  return run.status === "searching" || run.status === "writing";
}

/** Working, or waiting to retry by itself: either way, not finished and not abandoned. */
export function isInFlight(run: ResearchRun): run is Extract<ResearchRun, { status: "searching" | "writing" | "waiting" }> {
  return isRunning(run) || run.status === "waiting";
}

export function useResearchRun(): ResearchRun {
  const { user } = useAuth();
  const tab = useSyncExternalStore(subscribe, () => local, () => NO_LOCAL);
  const { data: row } = useQuery({ ...runQuery(user?.id ?? ""), enabled: !!user });
  return user ? toRun(row ?? null, tab) : { status: "idle" };
}

export function useResearchActions() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";

  // A finished report is already in hand, so opening it needs no loading state.
  const keepReport = useCallback(
    (result: RunResult, input: Pick<ResearchInput, "topic" | "context" | "orgId">) => {
      if (result.status !== "done") return;
      const detail: ReportDetail = {
        user_id: userId,
        org_id: input.orgId ?? null,
        topic: input.topic,
        user_context: input.context || null,
        created_at: result.created_at,
        report: result.report,
        edited: null,
      };
      queryClient.setQueryData(reportQuery(result.id).queryKey, detail);
    },
    [queryClient, userId],
  );

  const start = useCallback(
    async (input: ResearchInput) => {
      if (local.pending) return;
      const id = crypto.randomUUID();
      const key = runQuery(userId).queryKey;
      setLocal({ pending: { id, input, startedAt: Date.now() } });
      // Wake the poller: with nothing in flight it had no reason to be running.
      void queryClient.invalidateQueries({ queryKey: key });

      let failed: Local["failed"];
      try {
        keepReport(await runResearch({ data: { id, ...input, orgId: input.orgId ?? null, draftProjectId: input.draftProjectId ?? null } }), input);
      } catch (err) {
        // The request failed, but the server may still be working (a dropped
        // connection). If the run's row exists, keep following it instead.
        await queryClient.refetchQueries({ queryKey: key });
        if (queryClient.getQueryData(key)?.id !== id) {
          failed = {
            input,
            error:
              err instanceof TypeError
                ? "Couldn't reach the server. Check your connection and try again."
                : err instanceof Error
                  ? err.message
                  : "Research failed",
          };
        }
      }
      // Load the final row before letting go of the local placeholder, so the UI never blinks back to the form.
      await queryClient.refetchQueries({ queryKey: key });
      setLocal(failed ? { failed } : {});
    },
    [queryClient, userId, keepReport],
  );

  // Try the writing step again from the saved sources. `manual` is true when
  // the user asked; false when a scheduled retry came due.
  const resume = useCallback(
    async (manual: boolean) => {
      const key = runQuery(userId).queryKey;
      const row = queryClient.getQueryData(key);
      if (!row || (row.status !== "waiting" && row.status !== "paused")) return;
      // Show "writing" at once instead of waiting for the next poll.
      const optimistic: RunRow = { ...row, status: "writing", updated_at: new Date().toISOString() };
      queryClient.setQueryData(key, optimistic);
      try {
        keepReport(await resumeResearch({ data: { id: row.id, manual } }), row.input);
      } catch {
        // The request dropped; the row says what really happened.
      }
      await queryClient.refetchQueries({ queryKey: key });
    },
    [queryClient, userId, keepReport],
  );

  // Acknowledge a finished or failed run. The report, if any, stays in history.
  const dismiss = useCallback(async () => {
    const key = runQuery(userId).queryKey;
    const row = queryClient.getQueryData(key);
    setLocal(local.pending ? { pending: local.pending } : {});
    // A run the server is busy with can't be withdrawn; anything else can,
    // including one that is waiting to retry or paused.
    if (!row || (isWorking(row) && !isStale(row))) return;
    queryClient.setQueryData(key, null);
    await supabase.from("research_runs").delete().eq("id", row.id);
  }, [queryClient, userId]);

  return { start, resume, dismiss };
}
