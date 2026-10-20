import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckSquare, FilePlus2, Plus, Square } from "lucide-react";
import { ROLE_LABELS, isManager } from "@/lib/organizations";
import { closeRequestsQuery, createMilestone, deleteMilestone, draftsQuery, eventsQuery, milestonesQuery, projectsQuery, reviewsQuery, setTaskDone, tasksQuery } from "@/lib/collab/db";
import { waitingOnMe } from "@/lib/collab/rules";
import { describeEvent } from "@/lib/collab/events";
import { Avatar, Empty, Panel, timeAgo, useAction, useCollab, usePeople } from "@/components/collab/kit";
import { ReviewRow } from "@/components/collab/ReviewRow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_workspace/org/")({
  component: Overview,
});

function Overview() {
  const { orgId, role, me, members } = useCollab();
  const person = usePeople();
  const act = useAction();
  const reviews = useQuery(reviewsQuery(orgId));
  const projects = useQuery(projectsQuery(orgId));
  const drafts = useQuery(draftsQuery(orgId));
  const tasks = useQuery(tasksQuery(orgId));
  const milestones = useQuery(milestonesQuery(orgId));
  const events = useQuery(eventsQuery(orgId, 20));
  // Only requests sent to me come back; my own requests show on the draft itself.
  const closeRequests = useQuery({ ...closeRequestsQuery(orgId), enabled: isManager(role), select: (list) => list.filter((q) => q.requested_by !== me) });
  const [newMilestone, setNewMilestone] = useState(false);

  const all = reviews.data ?? [];
  const needsMe = all.filter((r) => waitingOnMe(r, r.approvals, role, me, members));
  const mine = all.filter((r) => r.author_id === me && (r.status === "in_review" || r.status === "changes_requested"));
  const myDrafts = (drafts.data ?? []).filter((d) => d.author_id === me && d.status === "open");
  const myTasks = (tasks.data ?? []).filter((t) => t.assignee_id === me && !t.done);
  const monthAgo = Date.now() - 30 * 86_400_000;
  const pipeline = [
    { label: "Open drafts", n: (drafts.data ?? []).filter((d) => d.status === "open").length, to: "/org/board" },
    { label: "In review", n: all.filter((r) => r.status === "in_review").length, to: "/org/reviews" },
    { label: "Changes requested", n: all.filter((r) => r.status === "changes_requested").length, to: "/org/reviews" },
    { label: "Filed in 30 days", n: all.filter((r) => r.status === "filed" && Date.parse(r.updated_at) > monthAgo).length, to: "/org/library" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{person(me).name} · {ROLE_LABELS[role]}</p>
          <h1 className="mt-1 text-3xl leading-tight sm:text-4xl">Overview</h1>
        </div>
        <Button asChild><Link to="/org/reviews/new"><FilePlus2 /> New review request</Link></Button>
      </div>

      <div className="grid grid-cols-2 border-l border-t border-border sm:grid-cols-4">
        {pipeline.map((p) => (
          <Link key={p.label} to={p.to} className="border-b border-r border-border bg-card p-4 transition-colors hover:bg-muted/50">
            <div className="font-serif text-3xl">{p.n}</div>
            <div className="mt-1 text-xs text-muted-foreground">{p.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Panel title={`Needs your review (${needsMe.length})`}>
            {needsMe.length ? (
              <ul className="divide-y divide-border">{needsMe.map((r) => <ReviewRow key={r.id} r={r} projects={projects.data} />)}</ul>
            ) : (
              <Empty>{isManager(role) ? "Nothing is waiting on you." : "Research Managers and heads of department review requests. Yours are below."}</Empty>
            )}
          </Panel>

          <Panel title={`Your open requests (${mine.length})`}>
            {mine.length ? (
              <ul className="divide-y divide-border">{mine.map((r) => <ReviewRow key={r.id} r={r} projects={projects.data} />)}</ul>
            ) : (
              <Empty>You have no requests in review.</Empty>
            )}
          </Panel>

          {isManager(role) && (closeRequests.data?.length ?? 0) > 0 && (
            <Panel title={`Requests to close a draft, sent to you (${closeRequests.data!.length})`}>
              <ul className="divide-y divide-border">
                {closeRequests.data!.map((q) => (
                  <li key={q.id}>
                    <Link to="/org/drafts/$draftId" params={{ draftId: q.draft_id }} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                      <Avatar id={q.requested_by} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{q.drafts?.title ?? "Draft"}</div>
                        <div className="truncate text-xs text-muted-foreground">
                          {person(q.requested_by).name}: “{q.reason}” · {timeAgo(q.created_at)}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          {myDrafts.length > 0 && (
            <Panel title={`Your drafts (${myDrafts.length})`}>
              <ul className="divide-y divide-border">
                {myDrafts.map((d) => (
                  <li key={d.id}>
                    <Link to="/org/drafts/$draftId" params={{ draftId: d.id }} className="block px-4 py-3 transition-colors hover:bg-muted/50">
                      <div className="text-sm font-medium">{d.title}</div>
                      <div className="text-xs text-muted-foreground">{projects.data?.find((p) => p.id === d.project_id)?.name} · changed {timeAgo(d.updated_at)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel title="Recent activity">
            {events.data?.length ? (
              <ul className="divide-y divide-border">
                {events.data.map((e) => (
                  <li key={e.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                    <Avatar id={e.actor_id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{person(e.actor_id).name}</span> <span className="text-muted-foreground">{describeEvent(e)}</span>
                      <div className="text-xs text-muted-foreground">
                        {projects.data?.find((p) => p.id === e.project_id)?.name ?? "Organization"} · {timeAgo(e.created_at)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Nothing has happened yet. Create a project to get started.</Empty>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title={`Your tasks (${myTasks.length})`}>
            {myTasks.length ? (
              <ul className="divide-y divide-border">
                {myTasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 px-4 py-3 text-sm">
                    <button type="button" aria-label={`Mark "${t.title}" done`} onClick={() => void act(() => setTaskDone(t.id, true), "Task done")} className="mt-0.5 text-muted-foreground hover:text-foreground">
                      <Square className="size-4" />
                    </button>
                    <div className="min-w-0">
                      <div>{t.title}</div>
                      {t.review_id && (
                        <div className="text-xs text-muted-foreground">
                          From #{reviews.data?.find((r) => r.id === t.review_id)?.number} · {timeAgo(t.created_at)}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No tasks. Follow-up tasks appear here when a request you're named on is filed.</Empty>
            )}
          </Panel>

          <Panel
            title="Milestones"
            action={isManager(role) && <button type="button" className="text-xs underline" onClick={() => setNewMilestone(true)}><Plus className="inline size-3" /> New</button>}
          >
            {milestones.data?.length ? (
              <ul className="divide-y divide-border">
                {milestones.data.map((m) => {
                  const items = [...all.filter((r) => r.milestone_id === m.id && r.status !== "closed"), ...(tasks.data ?? []).filter((t) => t.milestone_id === m.id)];
                  const done = all.filter((r) => r.milestone_id === m.id && r.status === "filed").length + (tasks.data ?? []).filter((t) => t.milestone_id === m.id && t.done).length;
                  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
                  return (
                    <li key={m.id} className="space-y-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-medium">{m.title}</span>
                        {isManager(role) && (
                          <button type="button" className="text-[11px] text-muted-foreground underline" onClick={() => void act(() => deleteMilestone(m.id), "Milestone removed")}>Remove</button>
                        )}
                      </div>
                      <div className="h-1.5 bg-muted"><div className="h-full bg-foreground transition-all" style={{ width: `${pct}%` }} /></div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{items.length ? `${pct}% · ${items.length - done} open` : "Nothing assigned yet"}</span>
                        {m.due_on && <span>Due {new Date(m.due_on).toLocaleDateString()}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>No milestones. {isManager(role) ? "Add one to group work towards a deadline." : ""}</Empty>
            )}
          </Panel>

          <Panel title="Projects" action={<Link to="/org/projects" className="text-xs underline">All</Link>}>
            {projects.data?.length ? (
              <ul className="divide-y divide-border">
                {projects.data.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <Link to="/org/projects/$projectId" params={{ projectId: p.id }} className="block px-4 py-3 transition-colors hover:bg-muted/50">
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">Updated {timeAgo(p.updated_at)}</div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No projects yet.</Empty>
            )}
          </Panel>
        </div>
      </div>

      <NewMilestone open={newMilestone} onOpenChange={setNewMilestone} />
      {/* Tasks the person has finished stay out of the list; this note says where they went. */}
      {(tasks.data ?? []).some((t) => t.assignee_id === me && t.done) && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><CheckSquare className="size-3.5" /> Finished tasks count towards their milestone.</p>
      )}
    </div>
  );
}

function NewMilestone({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { orgId } = useCollab();
  const act = useAction();
  const projects = useQuery(projectsQuery(orgId));
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [project, setProject] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const id = await act(() => createMilestone({ org: orgId, project: project || null, title, due: due || null }), "Milestone created");
            if (id) {
              setTitle("");
              setDue("");
              onOpenChange(false);
            }
          }}
        >
          <DialogHeader><DialogTitle>New milestone</DialogTitle></DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="ms-title">Title</Label>
            <Input id="ms-title" required minLength={2} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Q4 grid storage brief" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ms-due">Due</Label>
              <Input id="ms-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ms-project">Project</Label>
              <select id="ms-project" value={project} onChange={(e) => setProject(e.target.value)} className="h-11 border border-input bg-background px-2 text-sm md:h-9">
                <option value="">Any project</option>
                {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Create milestone</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
