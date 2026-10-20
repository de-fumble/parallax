import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, GitBranch, Search } from "lucide-react";
import { z } from "zod";
import { draftsQuery, projectsQuery, reviewsQuery, type Draft, type DraftStatus } from "@/lib/collab/db";
import { Empty, LoadError, PageTitle, selectClass, StatusPill, timeAgo, useCollab, usePeople } from "@/components/collab/kit";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const SHELVES: { id: DraftStatus; label: string; empty: string }[] = [
  { id: "open", label: "Open", empty: "No drafts in progress." },
  { id: "submitted", label: "In review", empty: "No drafts are waiting on a review." },
  { id: "closed", label: "Closed drafts", empty: "No closed drafts. Closed drafts are kept here and can be reopened." },
  { id: "filed", label: "Filed", empty: "Nothing has been filed yet. Filed drafts become versions of documents in the library." },
];

export const Route = createFileRoute("/_workspace/org/drafts/")({
  validateSearch: (s) => z.object({ shelf: z.enum(["open", "submitted", "closed", "filed"]).optional() }).parse(s),
  component: Drafts,
});

// Every draft in the organization, by where it is: being worked on, in review,
// closed, or filed into the library.
function Drafts() {
  const { orgId, me } = useCollab();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const drafts = useQuery(draftsQuery(orgId));
  const projects = useQuery(projectsQuery(orgId));
  const [projectId, setProjectId] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [q, setQ] = useState("");
  const shelf = SHELVES.find((s) => s.id === (search.shelf ?? "open"))!;

  const all = (drafts.data ?? []).filter(
    (d) => (projectId === "all" || d.project_id === projectId) && (!mineOnly || d.author_id === me) && d.title.toLowerCase().includes(q.toLowerCase()),
  );
  const shown = all.filter((d) => d.status === shelf.id);

  return (
    <div className="space-y-5">
      <PageTitle title="Drafts" sub="Work in progress, drafts waiting on review, closed drafts, and drafts filed into the library." />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search drafts by title" className="pl-9" aria-label="Search drafts" />
        </div>
        <select aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectClass}>
          <option value="all">All projects</option>
          {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only mine
        </label>
      </div>
      <div className="border border-border bg-card">
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2">
          {SHELVES.map((s) => (
            <button key={s.id} type="button" onClick={() => void navigate({ search: { shelf: s.id }, replace: true })}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm ${shelf.id === s.id ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {s.label} <span className="font-mono text-[10px] text-muted-foreground">{all.filter((d) => d.status === s.id).length}</span>
            </button>
          ))}
        </div>
        {drafts.isPending ? (
          <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : drafts.isError ? (
          <div className="p-4"><LoadError error={drafts.error} /></div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((d) => <DraftRow key={d.id} d={d} projectName={projects.data?.find((p) => p.id === d.project_id)?.name} />)}
            {shown.length === 0 && <li><Empty>{shelf.empty}</Empty></li>}
          </ul>
        )}
      </div>
    </div>
  );
}

function DraftRow({ d, projectName }: { d: Draft; projectName: string | undefined }) {
  const { orgId } = useCollab();
  const person = usePeople();
  const reviews = useQuery(reviewsQuery(orgId));
  const review = reviews.data?.find((r) => r.draft_id === d.id && (d.status !== "submitted" || r.status !== "closed"));

  let note = `changed ${timeAgo(d.updated_at)}`;
  if (d.status === "closed") {
    note = `closed ${d.closed_at ? timeAgo(d.closed_at) : timeAgo(d.updated_at)}${d.closed_by ? ` by ${person(d.closed_by).name}` : ""}${d.closed_reason ? `: “${d.closed_reason}”` : ""}`;
  }
  if (d.status === "filed") note = `filed ${timeAgo(d.updated_at)}`;

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
      <GitBranch className="size-4 shrink-0 text-muted-foreground" />
      <Link to="/org/drafts/$draftId" params={{ draftId: d.id }} className="min-w-0 flex-1">
        <div className="text-sm font-medium">{d.title}</div>
        <div className="truncate text-xs text-muted-foreground">{person(d.author_id).name} · {projectName} · {note}</div>
      </Link>
      {d.status === "filed" ? (
        <Link to="/org/documents/$documentId" params={{ documentId: d.document_id }} className="flex items-center gap-1 text-xs underline">
          <BookOpen className="size-3.5" /> In the library
        </Link>
      ) : d.status === "closed" ? (
        <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Closed</span>
      ) : review ? (
        <Link to="/org/reviews/$number" params={{ number: String(review.number) }} className="text-xs">#{review.number} <StatusPill status={review.status} /></Link>
      ) : (
        <StatusPill status="draft" />
      )}
    </li>
  );
}
