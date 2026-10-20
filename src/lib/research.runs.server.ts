import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateReport, TemporaryAiFailure } from "./research.server";
import { MAX_AUTO_RETRIES, type Mode, type RetrievedSource, type RunResult } from "./research.types";

// The part of a research run that can be picked up again: writing the report
// from sources already saved. A fresh run, a retry asked for in the browser and
// the background worker all come through here.

type StoredInput = {
  topic: string;
  mode: Mode;
  context: string;
  orgId?: string | null;
  draftProjectId?: string | null;
  draftKind?: string;
};

type DraftTarget = { projectId: string; kind: string } | null;

const retryStepMs = () => Number(process.env["RESEARCH_RETRY_STEP_MS"]) || 60_000;

// Record a change of state. If the write itself fails the run is left showing
// its old state, which is misleading, so that must at least reach the log.
async function updateRun(id: string, patch: Record<string, unknown>) {
  const { error } = await supabaseAdmin
    .from("research_runs")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) console.error(`[research] run ${id} could not be marked ${String(patch["status"])}:`, error.message);
}

/** Turn saved sources into a saved report, or schedule the next retry. */
export async function writeStage(run: {
  id: string;
  userId: string;
  /** The organization the report is for; null or absent for a personal report. */
  orgId?: string | null | undefined;
  /** Turn the report into a draft in this project, for the researcher. */
  draft?: DraftTarget | undefined;
  input: StoredInput;
  sources: RetrievedSource[];
  failures: number;
}): Promise<RunResult> {
  try {
    const report = await generateReport({ topic: run.input.topic, mode: run.input.mode, context: run.input.context, sources: run.sources });
    const { data: row, error } = await supabaseAdmin
      .from("reports")
      .insert({
        user_id: run.userId,
        topic: run.input.topic,
        mode: run.input.mode,
        user_context: run.input.context || null,
        report: report as never,
        sources: run.sources as never,
        // Only sent when set, so personal research works on a database from before organizations.
        ...(run.orgId ? { org_id: run.orgId } : {}),
      } as never)
      .select("id, created_at")
      .single();
    if (error) throw new Error(error.message);

    // Research started for a project becomes a draft there. If that fails the
    // report is still saved, so the run still counts as done.
    let draftId: string | null = null;
    if (run.draft) {
      const { reportToSections } = await import("./collab/templates");
      const { data: created, error: draftError } = await supabaseAdmin.rpc("create_draft_from_research" as never, {
        _user: run.userId,
        _project: run.draft.projectId,
        _title: report.research_title || run.input.topic,
        _kind: run.draft.kind,
        _sections: reportToSections(report),
      } as never);
      if (draftError) console.error(`[research] run ${run.id}: report saved but the draft couldn't be created:`, draftError.message);
      else draftId = created as unknown as string;
    }

    // The saved sources have done their job; drop them rather than keep a second copy.
    await updateRun(run.id, { status: "done", report_id: row.id, retrieved: [], retry_at: null, error: null, ...(draftId ? { draft_id: draftId } : {}) });
    return { status: "done", id: row.id, created_at: row.created_at, report, draftId };
  } catch (err) {
    const message = (err instanceof Error ? err.message : "Research failed").slice(0, 1000);
    if (!(err instanceof TemporaryAiFailure)) {
      await updateRun(run.id, { status: "error", error: message, retry_at: null });
      return { status: "error" };
    }
    const failures = run.failures + 1;
    if (failures > MAX_AUTO_RETRIES) {
      await updateRun(run.id, { status: "paused", error: message, attempt: failures, retry_at: null });
      return { status: "paused" };
    }
    await updateRun(run.id, {
      status: "waiting",
      error: message,
      attempt: failures,
      retry_at: new Date(Date.now() + failures * retryStepMs()).toISOString(),
    });
    return { status: "waiting" };
  }
}

/**
 * Pick a run back up. It is claimed by flipping it to "writing" only if it is
 * still in one of the `from` states, so when a browser tab and the worker both
 * go for the same run, the database lets exactly one through.
 */
export async function resumeRun(run: { id: string; userId?: string; from: ("waiting" | "paused")[] }): Promise<RunResult> {
  let claim = supabaseAdmin
    .from("research_runs")
    .update({ status: "writing", retry_at: null, updated_at: new Date().toISOString() })
    .eq("id", run.id)
    .in("status", run.from);
  // A signed-in user may only resume their own run; the worker resumes anyone's.
  if (run.userId) claim = claim.eq("user_id", run.userId);

  const { data: claimed, error } = await claim.select("user_id, input, retrieved, attempt");
  if (error) throw new Error(error.message);
  const row = claimed?.[0];
  if (!row) return { status: "busy" };

  const input = row.input as unknown as StoredInput;
  return writeStage({
    id: run.id,
    userId: row.user_id,
    // The run's saved input remembers which workspace it was started in.
    orgId: input.orgId ?? null,
    draft: input.draftProjectId ? { projectId: input.draftProjectId, kind: input.draftKind ?? "Report" } : null,
    input: { topic: input.topic, mode: input.mode, context: input.context ?? "" },
    sources: row.retrieved as unknown as RetrievedSource[],
    // A retry the user asked for after the automatic ones ran out starts a fresh series.
    failures: row.attempt > MAX_AUTO_RETRIES ? 0 : row.attempt,
  });
}
