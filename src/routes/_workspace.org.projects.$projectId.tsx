import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FilePlus2, FileText, GitBranch, Lock, Sparkles, Users } from "lucide-react";
import { isManager } from "@/lib/organizations";
import { reportQuery } from "@/lib/reports.queries";
import {
  DOCUMENT_KINDS,
  documentsQuery,
  draftsQuery,
  orgReportsQuery,
  projectMembersQuery,
  ownersQuery,
  projectsQuery,
  revisionsQuery,
  reviewsQuery,
  setProjectMembers,
  startDraft,
  type DocumentKind,
} from "@/lib/collab/db";
import { reportToSections, TEMPLATES } from "@/lib/collab/templates";
import { Avatar, Empty, LabelChip, Panel, PageTitle, StatusPill, selectClass, timeAgo, useAction, useCollab, usePeople } from "@/components/collab/kit";
import { ReviewRow } from "@/components/collab/ReviewRow";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_workspace/org/projects/$projectId")({
  component: ProjectPage,
});

const TABS = ["Documents", "Drafts", "History", "Reviews", "Members"] as const;
type Tab = (typeof TABS)[number];

function ProjectPage() {
  const { projectId } = Route.useParams();
  const { orgId, role, me } = useCollab();
  const person = usePeople();
  const projects = useQuery(projectsQuery(orgId));
  const documents = useQuery(documentsQuery(orgId));
  const drafts = useQuery(draftsQuery(orgId));
  const revisions = useQuery(revisionsQuery(orgId));
  const reviews = useQuery(reviewsQuery(orgId));
  const owners = useQuery(ownersQuery(orgId));
  const [tab, setTab] = useState<Tab>("Documents");
  const [newDoc, setNewDoc] = useState(false);

  const p = projects.data?.find((x) => x.id === projectId);
  if (projects.isPending) return <Skeleton className="h-40" />;
  if (!p) return <p>This project doesn't exist or you don't have access to it. <Link to="/org/projects" className="underline">All projects</Link></p>;

  const docs = (documents.data ?? []).filter((d) => d.project_id === p.id && d.current_version > 0);
  const projectDrafts = (drafts.data ?? []).filter((d) => d.project_id === p.id && d.status !== "filed" && d.status !== "closed");
  const closedDrafts = (drafts.data ?? []).filter((d) => d.project_id === p.id && d.status === "closed");
  const history = (revisions.data ?? []).filter((r) => r.drafts?.project_id === p.id);
  const projectReviews = (reviews.data ?? []).filter((r) => r.project_id === p.id);
  const canManage = isManager(role) || p.lead_id === me;
  const counts: Record<Tab, number> = { Documents: docs.length, Drafts: projectDrafts.length, History: history.length, Reviews: projectReviews.length, Members: 0 };

  return (
    <div className="space-y-6">
      <PageTitle
        title={<>{p.name}{p.visibility === "restricted" && <Lock className="size-5 text-muted-foreground" />}</>}
        sub={p.description || undefined}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/research" search={{ project: p.id }}><Sparkles /> Research it with Parallax</Link>
            </Button>
            <Button onClick={() => setNewDoc(true)}><FilePlus2 /> New document</Button>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {p.topics.map((t) => <LabelChip key={t}>{t}</LabelChip>)}
        {p.lead_id && <span>Lead: {person(p.lead_id).name}</span>}
        <span>{p.visibility === "restricted" ? "Only people added to it can see this project" : "Everyone in the organization can see this project"}</span>
      </div>

      <div className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
        {TABS.filter((t) => t !== "Members" || p.visibility === "restricted").map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm ${tab === t ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t} {t !== "Members" && <span className="rounded-full bg-muted px-1.5 font-mono text-[10px]">{counts[t]}</span>}
          </button>
        ))}
      </div>

      {tab === "Documents" && (
        <Panel title="Filed documents">
          {docs.length ? (
            <ul className="divide-y divide-border">
              {docs.map((d) => {
                const docOwners = (owners.data ?? []).filter((o) => o.document_id === d.id);
                const bySection = [...new Set(docOwners.map((o) => o.section_title))];
                return (
                  <li key={d.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
                    <FileText className="mt-0.5 hidden size-4 shrink-0 text-muted-foreground sm:block" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to="/org/documents/$documentId" params={{ documentId: d.id }} className="font-medium underline-offset-4 hover:underline">{d.title}</Link>
                        <span className="rounded-full border border-border px-1.5 font-mono text-[10px]">v{d.current_version}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{d.kind} · filed {timeAgo(d.filed_at)}</div>
                      {bySection.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          {bySection.map((s) => (
                            <span key={s}>{s}: {docOwners.filter((o) => o.section_title === s).map((o) => person(o.user_id).name).join(", ")}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>Nothing filed in this project yet. Start a document; once it's approved it appears here.</Empty>
          )}
        </Panel>
      )}

      {tab === "Drafts" && (
        <Panel title="Working drafts">
          {projectDrafts.length ? (
            <ul className="divide-y divide-border">
              {projectDrafts.map((d) => {
                const review = reviews.data?.find((r) => r.draft_id === d.id && r.status !== "closed");
                return (
                  <li key={d.id}>
                    <Link to="/org/drafts/$draftId" params={{ draftId: d.id }} className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                      <GitBranch className="size-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{d.title}</div>
                        <div className="text-xs text-muted-foreground">
                          {person(d.author_id).name} · {d.base_version ? `from version ${d.base_version}` : "new document"} · changed {timeAgo(d.updated_at)}
                        </div>
                      </div>
                      {review ? <span className="text-xs">#{review.number} <StatusPill status={review.status} /></span> : <StatusPill status="draft" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>No drafts in progress.</Empty>
          )}
        </Panel>
      )}
      {tab === "Drafts" && closedDrafts.length > 0 && (
        <Panel title={`Closed drafts (${closedDrafts.length})`}>
          <ul className="divide-y divide-border">
            {closedDrafts.map((d) => (
              <li key={d.id}>
                <Link to="/org/drafts/$draftId" params={{ draftId: d.id }} className="flex flex-wrap items-center gap-3 px-4 py-3 text-muted-foreground transition-colors hover:bg-muted/50">
                  <GitBranch className="size-4" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{d.title}</div>
                    <div className="truncate text-xs">
                      {person(d.author_id).name} · closed {timeAgo(d.closed_at ?? d.updated_at)}{d.closed_reason ? `: “${d.closed_reason}”` : ""}
                    </div>
                  </div>
                  <span className="border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider">Closed</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {tab === "History" && (
        <Panel title="Revision history">
          {history.length ? (
            <ul className="divide-y divide-border">
              {history.map((r) => (
                <li key={r.id}>
                  <Link to="/org/drafts/$draftId" params={{ draftId: r.draft_id }} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                    <Avatar id={r.author_id} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">{r.message}</div>
                      <div className="text-xs text-muted-foreground">{person(r.author_id).name} · {r.drafts?.title} · {timeAgo(r.created_at)}</div>
                    </div>
                    <span className="shrink-0 font-mono text-xs"><span className="text-strong">+{r.added}</span> <span className="text-weak">−{r.removed}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No revisions yet.</Empty>
          )}
        </Panel>
      )}

      {tab === "Reviews" && (
        <Panel title="Review requests">
          {projectReviews.length ? (
            <ul className="divide-y divide-border">{projectReviews.map((r) => <ReviewRow key={r.id} r={r} projects={projects.data} />)}</ul>
          ) : (
            <Empty>No review requests in this project.</Empty>
          )}
        </Panel>
      )}

      {tab === "Members" && <ProjectMembers projectId={p.id} editable={canManage} />}

      <NewDocument projectId={p.id} open={newDoc} onOpenChange={setNewDoc} />
    </div>
  );
}

function ProjectMembers({ projectId, editable }: { projectId: string; editable: boolean }) {
  const { members } = useCollab();
  const act = useAction();
  const { orgId } = useCollab();
  const current = useQuery(projectMembersQuery(orgId, projectId));
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => setPicked(current.data ?? []), [current.data]);

  return (
    <Panel title={<><Users className="size-3.5" /> Who can see this project</>}>
      <p className="px-4 pt-3 text-xs text-muted-foreground">Research Managers, heads of department and the project lead can always see it.</p>
      <ul className="divide-y divide-border">
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <input
              type="checkbox"
              className="size-4"
              disabled={!editable}
              checked={picked.includes(m.user_id)}
              onChange={(e) => setPicked(e.target.checked ? [...picked, m.user_id] : picked.filter((x) => x !== m.user_id))}
              aria-label={`Add ${m.full_name || m.email}`}
            />
            <Avatar id={m.user_id} size="sm" />
            <span className="flex-1">{m.full_name || m.email}</span>
          </li>
        ))}
      </ul>
      {editable && (
        <div className="flex justify-end border-t border-border p-3">
          <Button size="sm" onClick={() => void act(() => setProjectMembers(projectId, picked), "Project members saved")}>
            Save members
          </Button>
        </div>
      )}
    </Panel>
  );
}

function NewDocument({ projectId, open, onOpenChange }: { projectId: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { orgId } = useCollab();
  const act = useAction();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reports = useQuery({ ...orgReportsQuery(orgId), enabled: open });
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<DocumentKind>("Report");
  const [from, setFrom] = useState("blank");
  const [busy, setBusy] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const id = await act(async () => {
              let sections = TEMPLATES[kind];
              if (from !== "blank") {
                const detail = await queryClient.fetchQuery(reportQuery(from));
                if (detail) sections = reportToSections(detail.edited?.report ?? detail.report);
              }
              return startDraft({ project: projectId, document: null, title, kind, sections });
            }, "Draft started");
            setBusy(false);
            if (id) {
              onOpenChange(false);
              navigate({ to: "/org/drafts/$draftId", params: { draftId: id } });
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
            <DialogDescription>It starts as your draft. When it's ready, ask for review; once approved it's filed in the library.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="nd-title">Title</Label>
            <Input id="nd-title" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Literature review: cold-climate performance" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nd-kind">Kind</Label>
              <select id="nd-kind" value={kind} onChange={(e) => setKind(e.target.value as DocumentKind)} className={selectClass}>
                {DOCUMENT_KINDS.map((k) => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nd-from">Start from</Label>
              <select id="nd-from" value={from} onChange={(e) => setFrom(e.target.value)} className={selectClass}>
                <option value="blank">The {kind.toLowerCase()} template</option>
                {reports.data?.map((r) => <option key={r.id} value={r.id}>Report: {(r.title || r.topic).slice(0, 60)}</option>)}
              </select>
            </div>
          </div>
          {reports.data?.length === 0 && <p className="text-xs text-muted-foreground">Parallax reports run in this organization's workspace can be used as a starting point too.</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>Start draft</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
