import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resumeRun } from "./research.runs.server";

// The background worker: retries waiting research runs when they come due, so
// a run recovers whether or not its owner still has Parallax open.
//
// It runs in two ways, and they are safe to use together:
//   - Inside the server process, on a timer. This is all a long-lived server
//     (`npm start`, Docker, a VM) needs.
//   - On demand, through POST /api/worker. Hosts that only run code while a
//     request is in flight (Vercel, Netlify, Cloudflare) can't keep a timer
//     alive, so there a scheduled job calls that URL instead.

const TICK_MS = 15_000;
// A slow provider shouldn't let one tick start an unbounded pile of requests.
const MAX_RUNS_PER_TICK = 5;

export type WorkerTick = { due: number; resumed: number; outcomes: Record<string, number>; reminders?: number; error?: string };

// Review reminders are checked less often than research retries: the rule is
// "once a day after 24 hours", so every few minutes is plenty.
const REMINDER_EVERY_MS = 5 * 60_000;
let lastReminderCheck = 0;

/** Remind reviewers about requests that have waited more than a day. The database decides who and when. */
async function sendReviewReminders(tick: WorkerTick) {
  if (Date.now() - lastReminderCheck < REMINDER_EVERY_MS) return;
  lastReminderCheck = Date.now();
  const { data, error } = await supabaseAdmin.rpc("send_review_reminders" as never);
  // A database without the collaboration tables has nothing to remind about.
  if (error) {
    if (!/send_review_reminders|PGRST202|42883/.test(`${error.code} ${error.message}`)) console.error("[worker] review reminders failed:", error.message);
    return;
  }
  tick.reminders = Number(data) || 0;
  if (tick.reminders) console.log(`[worker] sent ${tick.reminders} review reminder(s)`);
}

let ticking = false;
let lastError = "";

/** Retry every waiting run whose time has come. Never throws. */
export async function processDueRuns(): Promise<WorkerTick> {
  const tick: WorkerTick = { due: 0, resumed: 0, outcomes: {} };
  // One pass at a time in this process: a pass can outlast the gap between ticks.
  if (ticking) return tick;
  ticking = true;
  try {
    const { data: due, error } = await supabaseAdmin
      .from("research_runs")
      .select("id")
      .eq("status", "waiting")
      .lte("retry_at", new Date().toISOString())
      .order("retry_at", { ascending: true })
      .limit(MAX_RUNS_PER_TICK);
    if (error) throw new Error(error.message);
    tick.due = due?.length ?? 0;

    await Promise.all(
      (due ?? []).map(async ({ id }) => {
        try {
          const { status } = await resumeRun({ id, from: ["waiting"] });
          // "busy" means a browser tab or another server instance got there first.
          if (status !== "busy") tick.resumed++;
          tick.outcomes[status] = (tick.outcomes[status] ?? 0) + 1;
        } catch (err) {
          console.error(`[worker] run ${id} could not be resumed:`, err);
          tick.outcomes["failed"] = (tick.outcomes["failed"] ?? 0) + 1;
        }
      }),
    );
    if (tick.resumed > 0) console.log(`[worker] retried ${tick.resumed} run(s):`, JSON.stringify(tick.outcomes));
    await sendReviewReminders(tick);
    if (lastError) console.log("[worker] database reachable again; back to normal");
    lastError = "";
  } catch (err) {
    // "fetch failed" on its own says nothing; the reason (DNS, timeout, refused) is in the cause.
    const cause = err instanceof Error ? (err.cause as { code?: string; message?: string } | undefined) : undefined;
    const reason = cause?.code || cause?.message;
    tick.error = (err instanceof Error ? err.message : String(err)) + (reason ? ` (${reason})` : "");
    // The same failure every 15 seconds would bury the log; report it once until it changes.
    if (tick.error !== lastError) {
      console.error(`[worker] couldn't check for due runs: ${tick.error}. Will keep trying every ${TICK_MS / 1000}s.`);
    }
    lastError = tick.error;
  } finally {
    ticking = false;
  }
  return tick;
}

// Kept on globalThis so a dev-server hot reload replaces the timer instead of stacking a second one.
const TIMER = Symbol.for("parallax.research-worker");
type WithTimer = typeof globalThis & { [TIMER]?: ReturnType<typeof setInterval> };

/** Start the in-process timer. Safe to call on every request; it starts once. */
export function startWorker() {
  const g = globalThis as WithTimer;
  if (g[TIMER] || process.env["RESEARCH_WORKER"] === "off") return;
  if (!process.env["SUPABASE_URL"] || !process.env["SUPABASE_SERVICE_ROLE_KEY"]) return;

  const timer = setInterval(() => void processDueRuns(), TICK_MS);
  // The worker alone should never keep a server from shutting down.
  (timer as { unref?: () => void }).unref?.();
  g[TIMER] = timer;
  console.log(`[worker] research retry worker started (checks every ${TICK_MS / 1000}s)`);
}
