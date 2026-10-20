import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Lock, Plus, Search } from "lucide-react";
import { createProject, documentsQuery, projectsQuery, reviewsQuery } from "@/lib/collab/db";
import { Empty, LabelChip, LoadError, PageTitle, selectClass, timeAgo, useAction, useCollab, usePeople } from "@/components/collab/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_workspace/org/projects/")({
  component: Projects,
});

function Projects() {
  const { orgId } = useCollab();
  const person = usePeople();
  const projects = useQuery(projectsQuery(orgId));
  const documents = useQuery(documentsQuery(orgId));
  const reviews = useQuery(reviewsQuery(orgId));
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const shown = (projects.data ?? []).filter((p) => `${p.name} ${p.description} ${p.topics.join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-6">
      <PageTitle
        title="Projects"
        sub="Each project holds its documents, drafts and review requests, like a repository."
        actions={<Button onClick={() => setCreating(true)}><Plus /> New project</Button>}
      />
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a project…" className="pl-9" aria-label="Find a project" />
      </div>
      {projects.isPending ? (
        <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
      ) : projects.isError ? (
        <LoadError error={projects.error} />
      ) : shown.length === 0 ? (
        <div className="border border-dashed border-border">
          <Empty>
            {projects.data.length === 0
              ? "No projects yet. Create the first one to start organizing the department's research."
              : "No projects match."}
          </Empty>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {shown.map((p) => {
            const docs = documents.data?.filter((d) => d.project_id === p.id && d.current_version > 0).length ?? 0;
            const open = reviews.data?.filter((r) => r.project_id === p.id && (r.status === "in_review" || r.status === "changes_requested")).length ?? 0;
            return (
              <li key={p.id} className="py-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to="/org/projects/$projectId" params={{ projectId: p.id }} className="font-serif text-2xl underline-offset-4 hover:underline">{p.name}</Link>
                  {p.visibility === "restricted" && (
                    <span className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"><Lock className="size-3" /> Restricted</span>
                  )}
                </div>
                {p.description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{p.description}</p>}
                {p.topics.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{p.topics.map((t) => <LabelChip key={t}>{t}</LabelChip>)}</div>}
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>{docs} filed {docs === 1 ? "document" : "documents"}</span>
                  <span>{open} open {open === 1 ? "request" : "requests"}</span>
                  {p.lead_id && <span>Lead: {person(p.lead_id).name}</span>}
                  <span>Updated {timeAgo(p.updated_at)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <NewProject open={creating} onOpenChange={setCreating} />
    </div>
  );
}

function NewProject({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { orgId, me, members } = useCollab();
  const act = useAction();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [topics, setTopics] = useState("");
  const [visibility, setVisibility] = useState<"department" | "restricted">("department");
  const [lead, setLead] = useState(me);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const id = await act(
              () => createProject({ org: orgId, name, description, topics: topics.split(",").map((t) => t.trim()).filter(Boolean), visibility, lead }),
              "Project created",
            );
            if (id) {
              onOpenChange(false);
              navigate({ to: "/org/projects/$projectId", params: { projectId: id } });
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>A home for a line of research: its documents, drafts and reviews.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="pj-name">Name</Label>
            <Input id="pj-name" required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grid-scale storage" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pj-desc">What it's about</Label>
            <Textarea id="pj-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pj-topics">Topics <span className="font-normal text-muted-foreground">(comma separated)</span></Label>
            <Input id="pj-topics" value={topics} onChange={(e) => setTopics(e.target.value)} placeholder="energy, batteries" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="pj-lead">Lead</Label>
              <select id="pj-lead" value={lead} onChange={(e) => setLead(e.target.value)} className={selectClass}>
                {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pj-vis">Who can see it</Label>
              <select id="pj-vis" value={visibility} onChange={(e) => setVisibility(e.target.value as "department" | "restricted")} className={selectClass}>
                <option value="department">Everyone in the organization</option>
                <option value="restricted">Only people added to it</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit">Create project</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
