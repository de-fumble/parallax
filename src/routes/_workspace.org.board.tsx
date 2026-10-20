import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { draftsQuery, projectsQuery, reviewsQuery } from "@/lib/collab/db";
import { pendingStage } from "@/lib/collab/rules";
import { Avatar, PageTitle, UrgencyChip, timeAgo, useCollab, waited } from "@/components/collab/kit";

export const Route = createFileRoute("/_workspace/org/board")({
  component: Board,
});

type Card = { key: string; title: string; to: { draftId: string } | { number: string }; projectId: string; person: string; note: string; urgency?: string };

// The pipeline at a glance. Cards move by themselves as work is submitted,
// reviewed and filed, so the board always matches the real state.
function Board() {
  const { orgId } = useCollab();
  const reviews = useQuery(reviewsQuery(orgId));
  const drafts = useQuery(draftsQuery(orgId));
  const projects = useQuery(projectsQuery(orgId));
  const all = reviews.data ?? [];
  const monthAgo = Date.now() - 30 * 86_400_000;
  const fromReview = (r: (typeof all)[number], note: string): Card => ({
    key: r.id, title: r.title, to: { number: String(r.number) }, projectId: r.project_id, person: r.author_id, note: `#${r.number} · ${note}`, urgency: r.urgency,
  });

  const columns: { title: string; cards: Card[] }[] = [
    {
      title: "Drafts",
      cards: (drafts.data ?? []).filter((d) => d.status === "open").map((d) => ({ key: d.id, title: d.title, to: { draftId: d.id }, projectId: d.project_id, person: d.author_id, note: `changed ${timeAgo(d.updated_at)}` })),
    },
    { title: "With a Research Manager", cards: all.filter((r) => r.status === "in_review" && pendingStage(r.approvals)?.stage === "manager").map((r) => fromReview(r, `waiting ${waited(pendingStage(r.approvals)?.pending_since)}`)) },
    { title: "With the head of department", cards: all.filter((r) => r.status === "in_review" && pendingStage(r.approvals)?.stage === "hod").map((r) => fromReview(r, `waiting ${waited(pendingStage(r.approvals)?.pending_since)}`)) },
    { title: "Changes requested", cards: all.filter((r) => r.status === "changes_requested").map((r) => fromReview(r, `since ${timeAgo(r.updated_at)}`)) },
    { title: "Filed (30 days)", cards: all.filter((r) => r.status === "filed" && Date.parse(r.updated_at) > monthAgo).map((r) => fromReview(r, `filed ${timeAgo(r.updated_at)}`)) },
  ];

  return (
    <div className="space-y-5">
      <PageTitle title="Research board" sub="Every piece of work from draft to filed. Cards move on their own as work is submitted, reviewed and filed." />
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {columns.map((col) => (
          <section key={col.title} className="flex w-72 shrink-0 snap-start flex-col border border-border bg-muted/30">
            <header className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-medium">{col.title}</span>
              <span className="rounded-full bg-background px-2 font-mono text-[10px]">{col.cards.length}</span>
            </header>
            <ul className="flex-1 space-y-2 p-2">
              {col.cards.map((c) => (
                <li key={c.key}>
                  <Link
                    {...("draftId" in c.to ? { to: "/org/drafts/$draftId" as const, params: c.to } : { to: "/org/reviews/$number" as const, params: c.to })}
                    className="block border border-border bg-card p-3 shadow-sm transition-colors hover:border-foreground/40"
                  >
                    <div className="text-sm font-medium leading-snug">{c.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{projects.data?.find((p) => p.id === c.projectId)?.name} · {c.note}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <Avatar id={c.person} size="sm" />
                      {c.urgency && <UrgencyChip urgency={c.urgency} />}
                    </div>
                  </Link>
                </li>
              ))}
              {col.cards.length === 0 && <li className="px-1 py-4 text-center text-xs text-muted-foreground">Nothing here</li>}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
