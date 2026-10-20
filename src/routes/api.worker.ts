import { createFileRoute } from "@tanstack/react-router";

// POST /api/worker — run one pass of the research retry worker.
//
// For hosts that can't keep a background timer alive: point a scheduled job
// (Vercel Cron, a GitHub Action, cron-job.org, Supabase pg_cron…) at this URL
// once a minute, sending `Authorization: Bearer <WORKER_SECRET>`. Disabled, and
// answering 404, until WORKER_SECRET is set.

async function authorized(request: Request): Promise<boolean> {
  // CRON_SECRET is what Vercel Cron sends by default, so accept either name.
  const secret = process.env["WORKER_SECRET"] || process.env["CRON_SECRET"];
  const given = /^Bearer (.+)$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!secret || !given) return false;
  // Compare digests so the check takes the same time whatever was sent.
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(given), digest(secret));
}

async function handle({ request }: { request: Request }) {
  if (!process.env["WORKER_SECRET"] && !process.env["CRON_SECRET"]) return new Response("Not found", { status: 404 });
  if (!(await authorized(request))) return new Response("Unauthorized", { status: 401 });
  const { processDueRuns } = await import("@/lib/research.worker.server");
  const tick = await processDueRuns();
  // A failed pass answers 500 so the scheduler's own alerting notices it.
  return Response.json(tick, { status: tick.error ? 500 : 200 });
}

export const Route = createFileRoute("/api/worker")({
  // GET as well as POST: some schedulers can only send GET.
  server: { handlers: { GET: handle, POST: handle } },
});
