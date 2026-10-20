import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ROLE_LABELS } from "@/lib/organizations";
import { eventsQuery, reviewsQuery } from "@/lib/collab/db";
import { pendingStage, STAGE_NAMES } from "@/lib/collab/rules";
import { Avatar, Panel, PageTitle, useCollab } from "@/components/collab/kit";

export const Route = createFileRoute("/_workspace/org/insights")({
  component: Insights,
});

const DAY = 86_400_000;
const SHADES = ["bg-muted", "bg-foreground/20", "bg-foreground/40", "bg-foreground/65", "bg-foreground"];

function median(values: number[]) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const hours = (ms: number | null) => (ms === null ? "—" : ms < 2 * 3_600_000 ? `${Math.round(ms / 60_000)}m` : ms < 4 * DAY ? `${Math.round(ms / 3_600_000)}h` : `${Math.round(ms / DAY)}d`);

/** A year of activity as 52 columns of 7 days, oldest on the left. */
function Heatmap({ days }: { days: number[] }) {
  const weeks = Array.from({ length: 52 }, (_, w) => days.slice(w * 7, w * 7 + 7));
  return (
    <div className="flex gap-[2px] overflow-x-auto pb-1" role="img" aria-label={`${days.reduce((a, b) => a + b, 0)} contributions in the last year`}>
      {weeks.map((week, w) => (
        <div key={w} className="flex flex-col gap-[2px]">
          {week.map((n, d) => <span key={d} className={`size-2.5 ${SHADES[Math.min(4, n === 0 ? 0 : Math.ceil(n / 2))]}`} />)}
        </div>
      ))}
    </div>
  );
}

function Insights() {
  const { orgId, members } = useCollab();
  const reviews = useQuery(reviewsQuery(orgId));
  const events = useQuery(eventsQuery(orgId, 5000, 364));
  const all = reviews.data ?? [];

  const filed = all.filter((r) => r.status === "filed");
  const toFile = median(filed.map((r) => Date.parse(r.updated_at) - Date.parse(r.created_at)));
  const hodWait = median(
    all.flatMap((r) => r.approvals.filter((a) => a.stage === "hod" && a.decided_at && a.pending_since).map((a) => Date.parse(a.decided_at!) - Date.parse(a.pending_since!))),
  );
  const quarterAgo = Date.now() - 91 * DAY;
  const filedQuarter = filed.filter((r) => Date.parse(r.updated_at) > quarterAgo).length;
  const open = all.filter((r) => r.status === "in_review" || r.status === "changes_requested").length;

  // Filed per week, the last 12 weeks, oldest first.
  const weeks = Array.from({ length: 12 }, (_, i) => {
    const end = Date.now() - (11 - i) * 7 * DAY;
    return filed.filter((r) => Date.parse(r.updated_at) <= end && Date.parse(r.updated_at) > end - 7 * DAY).length;
  });
  const max = Math.max(1, ...weeks);

  const waiting = [
    ...(["manager", "hod"] as const).map((stage) => {
      const here = all.filter((r) => r.status === "in_review" && pendingStage(r.approvals)?.stage === stage);
      const avg = here.length ? here.reduce((n, r) => n + (Date.now() - Date.parse(pendingStage(r.approvals)!.pending_since ?? r.updated_at)), 0) / here.length : null;
      return { label: `Waiting for the ${STAGE_NAMES[stage]}`, count: here.length, avg };
    }),
    (() => {
      const here = all.filter((r) => r.status === "changes_requested");
      const avg = here.length ? here.reduce((n, r) => n + (Date.now() - Date.parse(r.updated_at)), 0) / here.length : null;
      return { label: "With the author after changes were requested", count: here.length, avg };
    })(),
  ];

  // Each person's events per day over the last 364 days.
  const start = Date.now() - 364 * DAY;
  const perPerson = new Map<string, number[]>();
  for (const e of events.data ?? []) {
    if (!e.actor_id) continue;
    const day = Math.floor((Date.parse(e.created_at) - start) / DAY);
    if (day < 0 || day >= 364) continue;
    const row = perPerson.get(e.actor_id) ?? new Array<number>(364).fill(0);
    row[day]! += 1;
    perPerson.set(e.actor_id, row);
  }

  return (
    <div className="space-y-6">
      <PageTitle title="Insights" sub="How research moves through the department, and where it waits." />

      <div className="grid grid-cols-2 border-l border-t border-border lg:grid-cols-4">
        {[
          ["Median time to filing", hours(toFile)],
          ["Median head of department wait", hours(hodWait)],
          ["Filed in the last quarter", String(filedQuarter)],
          ["Open requests", String(open)],
        ].map(([label, value]) => (
          <div key={label} className="border-b border-r border-border bg-card p-4">
            <div className="font-serif text-3xl">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Filed per week, last 12 weeks">
          <div className="flex h-40 items-end gap-2 p-4">
            {weeks.map((n, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1">
                <span className="font-mono text-[10px] text-muted-foreground">{n}</span>
                <div className="w-full bg-foreground" style={{ height: `${(n / max) * 100}%`, minHeight: n ? 4 : 1 }} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Where requests are waiting now">
          <ul className="divide-y divide-border">
            {waiting.map((s) => (
              <li key={s.label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>{s.label}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{s.count} · avg {hours(s.avg)}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Contributions over the last year">
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const days = perPerson.get(m.user_id) ?? new Array<number>(364).fill(0);
            return (
              <li key={m.user_id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center">
                <div className="flex w-56 shrink-0 items-center gap-2">
                  <Avatar id={m.user_id} size="sm" />
                  <div className="min-w-0">
                    <div className="truncate text-sm">{m.full_name || m.email}</div>
                    <div className="text-[11px] text-muted-foreground">{ROLE_LABELS[m.role]} · {days.reduce((a, b) => a + b, 0)} contributions</div>
                  </div>
                </div>
                <Heatmap days={days} />
              </li>
            );
          })}
        </ul>
      </Panel>
    </div>
  );
}
