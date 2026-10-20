import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MAX_MANUAL_SOURCE_CHARS,
  MAX_MANUAL_SOURCES,
  MAX_MANUAL_TOTAL_CHARS,
  RUN_STALE_AFTER_MS,
  type RetrievedSource,
  type RunResult,
} from "./research.types";

const StartInput = z.object({
  // Chosen by the browser so it can start watching the run before this call returns.
  id: z.string().uuid(),
  // The organization this research is for; null for the personal workspace.
  orgId: z.string().uuid().nullable().default(null),
  // When set, the finished report also becomes a draft in this project of the organization.
  draftProjectId: z.string().uuid().nullable().default(null),
  draftKind: z.enum(["Report", "Literature review", "Procedure", "Data note", "Proposal"]).default("Report"),
  topic: z.string().trim().min(3).max(1000),
  mode: z.enum(["LIGHT", "MEDIUM", "DEEP"]),
  context: z.string().max(4000).default(""),
  useWeb: z.boolean(),
  manual: z
    .array(
      z.object({
        title: z.string().max(300),
        url: z.string().max(2000),
        text: z.string().max(MAX_MANUAL_SOURCE_CHARS),
        fileName: z.string().max(300).optional(),
      }),
    )
    .max(MAX_MANUAL_SOURCES)
    .refine((sources) => sources.reduce((sum, s) => sum + s.text.length, 0) <= MAX_MANUAL_TOTAL_CHARS, {
      message: `Your sources add up to more than ${MAX_MANUAL_TOTAL_CHARS.toLocaleString()} characters.`,
    }),
});

const ResumeInput = z.object({
  id: z.string().uuid(),
  // True when the user pressed a button; false when a scheduled retry came due.
  manual: z.boolean(),
});

// Runs the whole job in one request and records each stage in research_runs.
// The browser follows that row rather than this response, so a reload or a
// dropped connection doesn't lose track of the run.
export const runResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => StartInput.parse(d))
  .handler(async ({ data, context }): Promise<RunResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { webSearch, buildSources } = await import("./research.server");
    const { writeStage } = await import("./research.runs.server");
    const { id: runId, ...input } = data;
    const userId = context.userId;
    const runs = () => supabaseAdmin.from("research_runs");

    // Research for an organization is only accepted from its members.
    if (input.orgId) {
      const { data: membership } = await supabaseAdmin
        .from("organization_members" as never)
        .select("role")
        .eq("org_id", input.orgId)
        .eq("user_id", userId)
        .maybeSingle();
      if (!membership) throw new Error("You're not a member of that organization.");
    }
    if (input.draftProjectId && !input.orgId) throw new Error("A draft can only be started inside an organization.");

    // Clear this user's finished, abandoned and dead runs, then claim the single active slot.
    const staleBefore = new Date(Date.now() - RUN_STALE_AFTER_MS).toISOString();
    await runs()
      .delete()
      .eq("user_id", userId)
      .or(`status.in.(done,error,paused),and(status.in.(searching,writing),updated_at.lt.${staleBefore})`);
    const { error: claimError } = await runs().insert({ id: runId, user_id: userId, status: "searching", input: input as never });
    if (claimError) {
      if (claimError.code === "23505") throw new Error("A research run is already in progress. Wait for it to finish, or cancel it first.");
      throw new Error(`Couldn't start the run: ${claimError.message}`);
    }

    let sources: RetrievedSource[];
    try {
      const query = input.context ? `${input.topic} — ${input.context.slice(0, 300)}` : input.topic;
      const web = input.useWeb ? await webSearch(query, input.mode) : [];
      sources = buildSources(web, input.manual);
      if (sources.length === 0) throw new Error("No sources were found. Try rewording the topic or add your own sources.");
    } catch (err) {
      const message = (err instanceof Error ? err.message : "Research failed").slice(0, 1000);
      const { error } = await runs().update({ status: "error", error: message, updated_at: new Date().toISOString() }).eq("id", runId);
      if (error) console.error(`[research] run ${runId} could not be marked error:`, error.message);
      return { status: "error" };
    }

    // Save the gathered sources before the slow, failure-prone step, so that
    // whatever happens next the search never has to be repeated.
    const { error: saveError } = await runs()
      .update({
        status: "writing",
        retrieved: sources as never,
        sources: sources.map((s) => ({ id: s.source_id, title: s.title, domain: s.publisher_or_domain })) as never,
        updated_at: new Date().toISOString(),
      })
      .eq("id", runId);
    // Without saved sources the run can't be retried or tracked, so stop here
    // rather than carry on with a run nobody can follow.
    if (saveError) throw new Error(`Couldn't save the run's progress: ${saveError.message}`);

    return writeStage({ id: runId, userId, orgId: input.orgId, draft: input.draftProjectId ? { projectId: input.draftProjectId, kind: input.draftKind } : null, input, sources, failures: 0 });
  });

// Picks a waiting or paused run back up from its saved sources.
export const resumeResearch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => ResumeInput.parse(d))
  .handler(async ({ data, context }): Promise<RunResult> => {
    const { resumeRun } = await import("./research.runs.server");
    return resumeRun({ id: data.id, userId: context.userId, from: data.manual ? ["waiting", "paused"] : ["waiting"] });
  });
