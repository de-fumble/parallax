import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Archive, ArchiveRestore, Download, GitBranch, Loader2, Plus, Save, Send, Sparkles, X } from "lucide-react";
import {
  closeDraft,
  decideCloseRequest,
  draftQuery,
  documentsQuery,
  orgReportsQuery,
  projectsQuery,
  reopenDraft,
  requestDraftClose,
  saveRevision,
  withdrawCloseRequest,
  type CloseRequest,
  type Draft,
  type Section,
} from "@/lib/collab/db";
import { isManager, ROLE_LABELS } from "@/lib/organizations";
import { canCloseDraft } from "@/lib/collab/rules";
import { reportQuery } from "@/lib/reports.queries";
import { reportToSections } from "@/lib/collab/templates";
import { exportFiledDocument } from "@/lib/report-export";
import { printLogoFor } from "@/lib/branding";
import { useOrgBranding } from "@/components/OrgBranding";
import { useResearchActions, useResearchRun } from "@/lib/research-run";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { countChanges } from "@/lib/collab/diff";
import { Avatar, Panel, PageTitle, selectClass, StatusPill, timeAgo, useAction, useCollab, usePeople } from "@/components/collab/kit";
import { SectionDiffView } from "@/components/collab/SectionDiff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_workspace/org/drafts/$draftId")({
  component: DraftPage,
});

// A draft is the working copy of a document (a branch). Its author edits the
// sections and saves revisions (commits); anyone who can see the project can
// read it and compare it with the version it started from.
function DraftPage() {
  const { draftId } = Route.useParams();
  const { orgId, me } = useCollab();
  const person = usePeople();
  const act = useAction();
  const query = useQuery(draftQuery(orgId, draftId));
  const projects = useQuery(projectsQuery(orgId));
  const documents = useQuery(documentsQuery(orgId));
  const [sections, setSections] = useState<Section[]>([]);
  const [message, setMessage] = useState("");
  const [view, setView] = useState<"edit" | "compare">("edit");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  // Opening the draft a research run just produced retires the "Draft ready" notice.
  const run = useResearchRun();
  const { dismiss } = useResearchActions();
  const justFinished = run.status === "done" && run.draftId === draftId;
  useEffect(() => {
    if (justFinished) void dismiss();
  }, [justFinished, dismiss]);

  const data = query.data;
  useEffect(() => {
    if (data?.draft) setSections(data.draft.sections);
  }, [data?.draft]);

  const saved = data?.draft.sections ?? [];
  const dirty = useMemo(() => JSON.stringify(sections) !== JSON.stringify(saved), [sections, saved]);

  // Leaving with unsaved changes asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <p className="border border-weak/40 bg-weak/5 p-4 text-sm">{query.error.message}</p>;
  if (!data) return <p>This draft doesn't exist or you don't have access to it.</p>;

  const { draft, revisions, base, review, closeRequest } = data;
  const project = projects.data?.find((p) => p.id === draft.project_id);
  const doc = documents.data?.find((d) => d.id === draft.document_id);
  const finished = draft.status === "filed" || draft.status === "closed";
  const mine = draft.author_id === me;
  // In review, a change sends the request back to the first approval stage.
  const inReview = review?.status === "in_review";
  const editable = mine && !finished;
  const titles = sections.map((s) => s.title.trim());
  const duplicate = titles.find((t, i) => t && titles.indexOf(t) !== i);
  const untitled = titles.some((t) => !t);

  const update = (i: number, patch: Partial<Section>) => setSections(sections.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...sections];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s!);
    setSections(next);
  };

  async function save() {
    const { added, removed } = countChanges(saved, sections);
    setSaving(true);
    const ok = await act(() => saveRevision(draft.id, sections.map((s) => ({ title: s.title.trim(), body: s.body })), message, added, removed), "Revision saved");
    setSaving(false);
    if (ok !== undefined) setMessage("");
  }

  const branding = useOrgBranding();
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  async function handleDownloadFiledDraftPdf() {
    if (!data) return;
    setDownloadingPdf(true);
    try {
      const logo = await printLogoFor(branding)?.catch(() => null);
      const authorName = data.draft.author_id ? person(data.draft.author_id).name : "Unknown";
      const kind = doc?.kind ?? "Report";
      const meta = [
        kind,
        project ? project.name : null,
        `By ${authorName}`,
      ]
        .filter(Boolean)
        .join(" · ");

      await exportFiledDocument(
        {
          title: data.draft.title,
          kind,
          topic: project ? `${kind} · Project: ${project.name}` : `${kind} · Organization Library`,
          meta,
          sections: data.draft.sections,
        },
        "pdf",
        logo ?? null,
      );
      toast.success(`Downloaded ${data.draft.title} as PDF`);
    } catch (err) {
      toast.error("Failed to download PDF", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title={draft.title}
        sub={
          <span className="flex flex-wrap items-center gap-x-2">
            <GitBranch className="inline size-3.5" /> Draft by {person(draft.author_id).name} ·{" "}
            {project && <Link to="/org/projects/$projectId" params={{ projectId: project.id }} className="underline">{project.name}</Link>} ·{" "}
            {draft.base_version ? <>changes to {doc && <Link to="/org/documents/$documentId" params={{ documentId: doc.id }} className="underline">version {draft.base_version}</Link>}</> : "a new document"}
          </span>
        }
        actions={
          review ? (
            <Button asChild variant="outline"><Link to="/org/reviews/$number" params={{ number: String(review.number) }}>Review #{review.number} <StatusPill status={review.status} /></Link></Button>
          ) : (
            mine && !finished && (
              <Button asChild disabled={dirty}><Link to="/org/reviews/new" search={{ draft: draft.id }}><Send /> Ask for review</Link></Button>
            )
          )
        }
      />

      {draft.status === "filed" && (
        <div className="flex flex-wrap items-center justify-between gap-3 border border-border bg-muted/40 p-3 text-sm">
          <span>This draft is filed: it is now part of the document's history and can no longer change.</span>
          <div className="flex items-center gap-2">
            {doc && (
              <Button asChild size="sm" variant="outline">
                <Link to="/org/documents/$documentId" params={{ documentId: doc.id }}>View in library</Link>
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={downloadingPdf}
              onClick={() => void handleDownloadFiledDraftPdf()}
            >
              {downloadingPdf ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
              <span>Download PDF</span>
            </Button>
          </div>
        </div>
      )}
      {draft.status === "closed" && (
        <p className="border border-border bg-muted/40 p-3 text-sm">
          {draft.closed_by ? `${person(draft.closed_by).name} closed this draft` : "This draft is closed"}
          {draft.closed_at ? ` ${timeAgo(draft.closed_at)}` : ""}
          {draft.closed_reason ? `: “${draft.closed_reason}”` : ""}. It is kept under Closed drafts and can't change unless it is reopened.
        </p>
      )}
      {!finished && <CloseRequestBanner request={closeRequest} />}
      {editable && inReview && (
        <p className="border border-moderate/50 bg-moderate/10 p-3 text-sm">
          This draft is in review. Saving a change sends review #{review!.number} back to the first approval stage, because earlier approvals were for different wording.
        </p>
      )}

      <div className="flex border border-border">
        {(["edit", "compare"] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} className={`flex-1 px-3 py-2 text-sm ${view === v ? "bg-foreground text-background" : "text-muted-foreground"}`}>
            {v === "edit" ? (editable ? "Edit" : "Read") : draft.base_version ? `Compare with version ${draft.base_version}` : "Compare with the start"}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          {view === "compare" ? (
            <SectionDiffView before={base} after={sections} />
          ) : (
            <>
              {sections.map((s, i) => (
                <section key={i} className="border border-border bg-card">
                  <header className="flex items-center gap-2 border-b border-border px-3 py-2">
                    {editable ? (
                      <Input aria-label={`Section ${i + 1} title`} value={s.title} onChange={(e) => update(i, { title: e.target.value })} className="h-9 border-0 px-1 font-medium shadow-none focus-visible:ring-0 md:h-8" placeholder="Section title" />
                    ) : (
                      <h2 className="flex-1 text-lg">{s.title}</h2>
                    )}
                    {editable && (
                      <div className="flex shrink-0">
                        <Button variant="ghost" size="icon" className="size-9 md:size-8" disabled={i === 0} aria-label="Move section up" onClick={() => move(i, -1)}><ArrowUp /></Button>
                        <Button variant="ghost" size="icon" className="size-9 md:size-8" disabled={i === sections.length - 1} aria-label="Move section down" onClick={() => move(i, 1)}><ArrowDown /></Button>
                        <Button variant="ghost" size="icon" className="size-9 md:size-8" aria-label="Remove section" onClick={() => setSections(sections.filter((_, j) => j !== i))}><X /></Button>
                      </div>
                    )}
                  </header>
                  {editable ? (
                    <textarea
                      aria-label={`${s.title || "Section"} text`}
                      value={s.body}
                      onChange={(e) => update(i, { body: e.target.value })}
                      rows={4}
                      style={{ fieldSizing: "content" } as React.CSSProperties}
                      className="block min-h-24 w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-relaxed outline-none"
                      placeholder="Write this section…"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap px-4 py-3 text-[15px] leading-relaxed">{s.body || <span className="text-muted-foreground">Empty</span>}</p>
                  )}
                </section>
              ))}
              {editable && (
                <Button variant="outline" onClick={() => setSections([...sections, { title: "", body: "" }])}><Plus /> Add section</Button>
              )}
            </>
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {editable && (
            <Panel title="Save a revision">
              <div className="space-y-3 p-4">
                <Input value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What changed? (optional)" aria-label="Revision message" />
                {(duplicate || untitled) && (
                  <p className="text-xs text-weak">{duplicate ? `Two sections are called "${duplicate}". Section titles must be different.` : "Every section needs a title."}</p>
                )}
                <Button className="w-full" disabled={!dirty || saving || !!duplicate || untitled} onClick={() => void save()}>
                  <Save /> {dirty ? "Save revision" : "No unsaved changes"}
                </Button>
              </div>
            </Panel>
          )}
          {editable && (
            <Panel title="Use the research engine">
              <div className="space-y-2 p-4">
                <Button variant="outline" className="w-full" onClick={() => setImporting(true)}><Sparkles /> Add from a report</Button>
                <Button variant="ghost" className="w-full" asChild>
                  <Link to="/research" search={{ project: draft.project_id }}>Run new research</Link>
                </Button>
                <p className="text-xs text-muted-foreground">Pull sections from any report researched in this organization into the draft, then edit them here.</p>
              </div>
            </Panel>
          )}
          {!finished && <ClosePanel draft={draft} request={closeRequest} />}
          {draft.status === "closed" && <ReopenPanel draft={draft} />}
          <Panel title={`History (${revisions.length})`}>
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {revisions.map((r) => (
                <li key={r.id} className="flex items-start gap-2 px-4 py-2.5">
                  <Avatar id={r.author_id} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{r.message}</div>
                    <div className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</div>
                  </div>
                  <span className="shrink-0 font-mono text-[11px]"><span className="text-strong">+{r.added}</span> <span className="text-weak">−{r.removed}</span></span>
                </li>
              ))}
            </ul>
          </Panel>
        </aside>
      </div>
      {importing && <ImportReport onClose={() => setImporting(false)} onAdd={(picked) => setSections(mergeSections(sections, picked))} />}
    </div>
  );
}

const ROLE_PLURAL: Record<"manager" | "hod" | "owner", string> = { manager: "Research Managers", hod: "Heads of Department", owner: "Owners" };

// Who a request was sent to, in words.
function recipients(request: CloseRequest, name: (id: string) => string) {
  if (request.target_user) return name(request.target_user);
  if (request.target_role) return `all ${ROLE_PLURAL[request.target_role]}`;
  return "everyone who can close it";
}

// A pending request to close the draft, as its recipients and its asker see
// it. Nobody else is shown it. A declined one stays visible to the asker.
function CloseRequestBanner({ request }: { request: CloseRequest | null }) {
  const { me } = useCollab();
  const person = usePeople();
  const act = useAction();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (!request) return null;

  if (request.status === "declined" && request.requested_by === me) {
    return (
      <p className="border border-border bg-muted/40 p-3 text-sm">
        {request.decided_by ? person(request.decided_by).name : "A manager"} kept this draft open {request.decided_at ? timeAgo(request.decided_at) : ""}
        {request.note ? `: “${request.note}”` : "."}
      </p>
    );
  }
  if (request.status !== "pending") return null;

  const asker = request.requested_by ? person(request.requested_by).name : "Someone";
  const mine = request.requested_by === me;
  const decide = async (approve: boolean) => {
    setBusy(true);
    await act(() => decideCloseRequest(request.id, approve, note), approve ? "Draft closed" : "Draft kept open");
    setBusy(false);
  };

  return (
    <div className="space-y-3 border border-moderate/50 bg-moderate/10 p-3 text-sm">
      <p>
        <span className="font-medium">{mine ? "You asked" : `${asker} asks`} to close this draft</span>{" "}
        <span className="text-muted-foreground">{timeAgo(request.created_at)}</span>: “{request.reason}”
      </p>
      {mine ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Sent to {recipients(request, (id) => person(id).name)}. The first of them to decide settles it.</span>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void act(() => withdrawCloseRequest(request.id), "Request withdrawn")}>Withdraw request</Button>
        </div>
      ) : (
        // Only the people it was sent to can see it, so whoever sees it can decide.
        <>
          <p className="text-xs text-muted-foreground">Sent to {recipients(request, (id) => (id === me ? "you" : person(id).name))}. The first to decide settles it.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={`A note for ${asker} (optional)`} aria-label="Note" className="bg-background" />
            <div className="flex shrink-0 gap-2">
              <Button disabled={busy} onClick={() => void decide(true)}><Archive /> Approve close</Button>
              <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>Keep open</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Close a draft you outrank (owners close any), or ask someone who can.
// Interns and assistants ask about their own drafts; managers and heads of
// department ask about drafts above their rank.
function ClosePanel({ draft, request }: { draft: Draft; request: CloseRequest | null }) {
  const { role, me, members } = useCollab();
  const person = usePeople();
  const act = useAction();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [to, setTo] = useState("all");
  const [busy, setBusy] = useState(false);
  const author = person(draft.author_id);
  const own = draft.author_id === me;
  const canClose = canCloseDraft(role, me, draft.author_id, author.role);
  const canAsk = !canClose && request?.status !== "pending" && (isManager(role) || own);
  if (!canClose && !canAsk) return null;

  // The people who could close it, and the roles they hold, for the "Send to" list.
  const closers = members.filter((m) => m.user_id !== me && canCloseDraft(m.role, m.user_id, draft.author_id, author.role));
  const roles = (["manager", "hod", "owner"] as const).filter((r) => closers.some((m) => m.role === r));
  const opener = own ? "you" : `${author.role ? `${ROLE_LABELS[author.role]} ` : ""}${author.name}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const [kind, id = ""] = to.split(":");
    const done = await act(
      async () => {
        if (canClose) await closeDraft(draft.id, reason);
        else await requestDraftClose(draft.id, reason, kind === "user" ? { user: id } : kind === "role" ? { role: id } : {});
        return true;
      },
      canClose ? "Draft closed" : "Request sent",
    );
    setBusy(false);
    if (done !== undefined) {
      setOpen(false);
      setReason("");
    }
  }

  return (
    <Panel title="Close this draft">
      <div className="space-y-2 p-4">
        <Button variant="outline" className="w-full" onClick={() => setOpen(true)} disabled={!canClose && closers.length === 0}>
          <Archive /> {canClose ? "Close draft" : "Request to close"}
        </Button>
        <p className="text-xs text-muted-foreground">
          {canClose
            ? "A closed draft is kept under Closed drafts. It can be reopened later, then submitted and filed into the library."
            : closers.length
              ? `This draft was opened by ${opener}. Ask someone who can close it: one person, one role, or everyone above.`
              : "Nobody in the organization can close this draft."}
        </p>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{canClose ? "Close this draft?" : "Ask to close this draft"}</DialogTitle>
              <DialogDescription>
                This draft was opened by <span className="font-medium text-foreground">{opener}</span>.{" "}
                {canClose
                  ? `Are you sure you want to close it? “${draft.title}” moves to Closed drafts${own ? "" : " and its author is told"}. It can be reopened later.`
                  : "Only the people you send it to see the request. The first of them to decide settles it."}
              </DialogDescription>
            </DialogHeader>
            {!canClose && (
              <div className="grid gap-1.5">
                <Label htmlFor="close-to">Send to</Label>
                <select id="close-to" value={to} onChange={(e) => setTo(e.target.value)} className={selectClass}>
                  <option value="all">Everyone who can close it ({closers.length})</option>
                  {roles.length > 0 && (
                    <optgroup label="Everyone in one role">
                      {roles.map((r) => <option key={r} value={`role:${r}`}>All {ROLE_PLURAL[r]} ({closers.filter((m) => m.role === r).length})</option>)}
                    </optgroup>
                  )}
                  <optgroup label="One person">
                    {closers.map((m) => <option key={m.user_id} value={`user:${m.user_id}`}>{m.full_name || m.email} · {ROLE_LABELS[m.role]}</option>)}
                  </optgroup>
                </select>
              </div>
            )}
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required={!canClose}
              rows={3}
              aria-label="Reason"
              placeholder={canClose ? "Why? (optional, shown to the author)" : "Why should it be closed? e.g. superseded, out of scope, duplicate"}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={busy || (!canClose && !reason.trim())}>{canClose ? "Yes, close draft" : "Send request"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

// A closed draft can come back: whoever could close it reopens it.
function ReopenPanel({ draft }: { draft: Draft }) {
  const { role, me } = useCollab();
  const person = usePeople();
  const act = useAction();
  const [busy, setBusy] = useState(false);
  if (!canCloseDraft(role, me, draft.author_id, person(draft.author_id).role)) return null;
  return (
    <Panel title="Reopen this draft">
      <div className="space-y-2 p-4">
        <Button variant="outline" className="w-full" disabled={busy} onClick={async () => {
          setBusy(true);
          await act(() => reopenDraft(draft.id), "Draft reopened");
          setBusy(false);
        }}>
          <ArchiveRestore /> Reopen draft
        </Button>
        <p className="text-xs text-muted-foreground">It goes back to the open drafts, where its author can keep working, submit it for review and get it filed.</p>
      </div>
    </Panel>
  );
}

/** Add sections to a draft: new titles are appended, matching titles get the text added. */
function mergeSections(current: Section[], added: Section[]): Section[] {
  const next = current.map((s) => ({ ...s }));
  for (const s of added) {
    const same = next.find((x) => x.title.trim().toLowerCase() === s.title.trim().toLowerCase());
    if (same) same.body = same.body.trim() ? `${same.body.trim()}\n\n${s.body}` : s.body;
    else next.push({ ...s });
  }
  return next;
}

// Choose a report from the organization's research, then which of its sections to bring in.
function ImportReport({ onClose, onAdd }: { onClose: () => void; onAdd: (sections: Section[]) => void }) {
  const { orgId } = useCollab();
  const queryClient = useQueryClient();
  const reports = useQuery(orgReportsQuery(orgId));
  const [reportId, setReportId] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  async function choose(id: string) {
    setReportId(id);
    if (!id) return setSections([]);
    setLoading(true);
    const detail = await queryClient.fetchQuery(reportQuery(id));
    const found = detail ? reportToSections(detail.edited?.report ?? detail.report) : [];
    setSections(found);
    setPicked(found.map((s) => s.title));
    setLoading(false);
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add from a report</DialogTitle>
          <DialogDescription>Sections with the same title as one in your draft are added to the end of it; the rest become new sections. Citations stay as written.</DialogDescription>
        </DialogHeader>
        <select aria-label="Report" value={reportId} onChange={(e) => void choose(e.target.value)} className="h-11 border border-input bg-background px-2 text-sm md:h-9">
          <option value="">Choose a report…</option>
          {reports.data?.map((r) => <option key={r.id} value={r.id}>{(r.title || r.topic).slice(0, 80)}</option>)}
        </select>
        {reports.data?.length === 0 && <p className="text-sm text-muted-foreground">No reports have been researched in this organization yet.</p>}
        {loading && <Skeleton className="h-24" />}
        {sections.length > 0 && (
          <ul className="max-h-72 divide-y divide-border overflow-y-auto border border-border">
            {sections.map((s) => (
              <li key={s.title}>
                <label className="flex items-start gap-3 px-3 py-2.5 text-sm">
                  <input type="checkbox" className="mt-0.5 size-4" checked={picked.includes(s.title)}
                    onChange={(e) => setPicked(e.target.checked ? [...picked, s.title] : picked.filter((t) => t !== s.title))} />
                  <span className="min-w-0">
                    <span className="font-medium">{s.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{s.body.slice(0, 120)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!picked.length || !sections.length} onClick={() => { onAdd(sections.filter((s) => picked.includes(s.title))); onClose(); }}>
            Add {picked.length || ""} {picked.length === 1 ? "section" : "sections"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
