import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus2, Search } from "lucide-react";
import { projectsQuery, reviewsQuery, type ReviewWithApprovals } from "@/lib/collab/db";
import { waitingOnMe } from "@/lib/collab/rules";
import { Empty, LoadError, PageTitle, selectClass, useCollab } from "@/components/collab/kit";
import { ReviewRow } from "@/components/collab/ReviewRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_workspace/org/reviews/")({
  component: Reviews,
});

function Reviews() {
  const { orgId, role, me, members } = useCollab();
  const reviews = useQuery(reviewsQuery(orgId));
  const projects = useQuery(projectsQuery(orgId));
  const [filter, setFilter] = useState("open");
  const [projectId, setProjectId] = useState("all");
  const [q, setQ] = useState("");

  const filters: { id: string; label: string; match: (r: ReviewWithApprovals) => boolean }[] = [
    { id: "open", label: "Open", match: (r) => r.status === "in_review" || r.status === "changes_requested" },
    { id: "mine", label: "Needs my review", match: (r) => waitingOnMe(r, r.approvals, role, me, members) },
    { id: "authored", label: "Mine", match: (r) => r.author_id === me },
    { id: "filed", label: "Filed", match: (r) => r.status === "filed" },
    { id: "closed", label: "Closed", match: (r) => r.status === "closed" },
    { id: "all", label: "All", match: () => true },
  ];
  const f = filters.find((x) => x.id === filter)!;
  const all = reviews.data ?? [];
  const shown = all.filter(
    (r) => f.match(r) && (projectId === "all" || r.project_id === projectId) && `${r.title} ${r.number} ${r.labels.join(" ")}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <PageTitle
        title="Review requests"
        sub="Proposed research and changes, on their way to approval and the library."
        actions={<Button asChild><Link to="/org/reviews/new"><FilePlus2 /> New review request</Link></Button>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title, number or label" className="pl-9" aria-label="Search review requests" />
        </div>
        <select aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectClass}>
          <option value="all">All projects</option>
          {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="border border-border bg-card">
        <div className="flex gap-1 overflow-x-auto border-b border-border px-2">
          {filters.map((x) => (
            <button key={x.id} type="button" onClick={() => setFilter(x.id)}
              className={`shrink-0 border-b-2 px-3 py-2.5 text-sm ${filter === x.id ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {x.label} <span className="font-mono text-[10px] text-muted-foreground">{all.filter(x.match).length}</span>
            </button>
          ))}
        </div>
        {reviews.isPending ? (
          <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : reviews.isError ? (
          <div className="p-4"><LoadError error={reviews.error} /></div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((r) => <ReviewRow key={r.id} r={r} projects={projects.data} />)}
            {shown.length === 0 && <li><Empty>Nothing here.</Empty></li>}
          </ul>
        )}
      </div>
    </div>
  );
}
