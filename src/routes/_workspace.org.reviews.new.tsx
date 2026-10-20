import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Paperclip, Plus, Upload, X } from "lucide-react";
import { z } from "zod";
import {
  draftsQuery,
  MAX_ATTACHMENT_BYTES,
  milestonesQuery,
  orgReportsQuery,
  projectsQuery,
  reviewIdByNumber,
  reviewsQuery,
  submitReview,
  uploadAttachment,
  type NextStep,
  type ReviewKind,
  type Urgency,
} from "@/lib/collab/db";
import { Empty, PageTitle, selectClass, useAction, useCollab, usePeople } from "@/components/collab/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_workspace/org/reviews/new")({
  validateSearch: (s) => z.object({ draft: z.string().uuid().optional() }).parse(s),
  component: NewRequest,
});

const KINDS: ReviewKind[] = ["New research", "Update", "Procedure change", "Idea"];
const URGENCY: Urgency[] = ["Low", "Normal", "High", "Urgent"];

// The submission form: a draft plus everything a reviewer needs to judge it.
function NewRequest() {
  const search = Route.useSearch();
  const { orgId, me, members } = useCollab();
  const person = usePeople();
  const act = useAction();
  const navigate = useNavigate();
  const drafts = useQuery(draftsQuery(orgId));
  const projects = useQuery(projectsQuery(orgId));
  const milestones = useQuery(milestonesQuery(orgId));
  const reviews = useQuery(reviewsQuery(orgId));
  const reports = useQuery(orgReportsQuery(orgId));

  const mine = (drafts.data ?? []).filter((d) => d.author_id === me && d.status === "open");
  const [draftId, setDraftId] = useState(search.draft ?? "");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ReviewKind>("New research");
  const [summary, setSummary] = useState("");
  const [steps, setSteps] = useState<NextStep[]>([{ text: "", assignee: me }]);
  const [urgency, setUrgency] = useState<Urgency>("Normal");
  const [labels, setLabels] = useState("");
  const [milestone, setMilestone] = useState("");
  const [links, setLinks] = useState<{ kind: "review" | "report"; id: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const draft = mine.find((d) => d.id === draftId);
  // Pick the first draft, and take its title, once the list arrives.
  useEffect(() => {
    if (!draftId && mine[0]) setDraftId(mine[0].id);
  }, [draftId, mine]);
  useEffect(() => {
    if (draft) {
      setTitle((t) => t || draft.title);
      setKind(draft.base_version ? "Update" : "New research");
    }
  }, [draft?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setBusy(true);
    const number = await act(
      () =>
        submitReview({
          draft: draft.id,
          title,
          kind,
          summary,
          nextSteps: steps.filter((s) => s.text.trim()),
          urgency,
          labels: labels.split(",").map((l) => l.trim()).filter(Boolean),
          milestone: milestone || null,
          links,
        }),
      "Submitted for review",
    );
    if (number !== undefined) {
      // Attachments go up once the request exists, into the organization's folder.
      if (files.length) {
        const reviewId = await reviewIdByNumber(orgId, number);
        for (const file of files) {
          try {
            await uploadAttachment(orgId, reviewId, file, me);
          } catch (err) {
            toast.error(`Couldn't attach ${file.name}`, { description: err instanceof Error ? err.message : undefined });
          }
        }
      }
      navigate({ to: "/org/reviews/$number", params: { number: String(number) } });
    }
    setBusy(false);
  }

  if (drafts.isSuccess && mine.length === 0) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <PageTitle title="New review request" />
        <div className="border border-dashed border-border">
          <Empty>
            A review request proposes one of your drafts for filing. You have no open drafts:{" "}
            <Link to="/org/projects" className="underline">open a project</Link> and start a new document, or start a draft from a filed one.
          </Empty>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageTitle title="New review request" sub="It goes to a Research Manager first if you're an intern or assistant, then to the head of department, who files it." />
      <form className="space-y-6" onSubmit={submit}>
        <div className="grid gap-1.5">
          <Label htmlFor="nr-draft">Draft to submit</Label>
          <select id="nr-draft" required value={draftId} onChange={(e) => setDraftId(e.target.value)} className={selectClass}>
            {mine.map((d) => (
              <option key={d.id} value={d.id}>{d.title} — {projects.data?.find((p) => p.id === d.project_id)?.name}</option>
            ))}
          </select>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">What is it?</legend>
          <div className="grid gap-2 sm:grid-cols-4">
            {KINDS.map((k) => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={`border px-3 py-2.5 text-left text-sm transition-colors ${kind === k ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"}`}>
                {k}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-1.5">
          <Label htmlFor="nr-title">Title</Label>
          <Input id="nr-title" required minLength={3} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="nr-summary">Research summary and key findings</Label>
          <Textarea id="nr-summary" required rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What did you find, and how strong is the evidence?" />
        </div>

        <div className="space-y-2">
          <Label>Proposed next steps</Label>
          <p className="text-xs text-muted-foreground">Each one becomes a task for the person named when the request is filed.</p>
          {steps.map((s, i) => (
            <div key={i} className="flex flex-col gap-2 sm:flex-row">
              <Input value={s.text} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} placeholder={`Next step ${i + 1}`} />
              <div className="flex gap-2">
                <select aria-label="Assign to" value={s.assignee ?? me} onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, assignee: e.target.value } : x)))} className={`${selectClass} min-w-40`}>
                  {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.user_id === me ? "Me" : m.full_name || m.email}</option>)}
                </select>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove step" onClick={() => setSteps(steps.filter((_, j) => j !== i))}><X /></Button>
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={() => setSteps([...steps, { text: "", assignee: me }])}><Plus /> Add a step</Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="nr-files">Attachments</Label>
          <label htmlFor="nr-files" className="flex cursor-pointer flex-col items-center gap-1 border border-dashed border-border p-6 text-sm text-muted-foreground hover:bg-muted/40">
            <Upload className="size-5" /> Documents, images or data files, up to {MAX_ATTACHMENT_BYTES / 1024 / 1024} MB each
          </label>
          <input
            id="nr-files"
            type="file"
            multiple
            className="sr-only"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              const tooBig = picked.filter((f) => f.size > MAX_ATTACHMENT_BYTES);
              if (tooBig.length) toast.error(`${tooBig.map((f) => f.name).join(", ")} ${tooBig.length === 1 ? "is" : "are"} over the size limit`);
              setFiles([...files, ...picked.filter((f) => f.size <= MAX_ATTACHMENT_BYTES)]);
              e.target.value = "";
            }}
          />
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              <Paperclip className="size-3.5 text-muted-foreground" /> <span className="flex-1 truncate">{f.name}</span>
              <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}><X /></Button>
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Urgency</legend>
            <div className="flex border border-border">
              {URGENCY.map((u) => (
                <button key={u} type="button" role="radio" aria-checked={urgency === u} onClick={() => setUrgency(u)}
                  className={`flex-1 py-2 text-sm ${urgency === u ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{u}</button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="nr-ms">Milestone</Label>
            <select id="nr-ms" value={milestone} onChange={(e) => setMilestone(e.target.value)} className={selectClass}>
              <option value="">None</option>
              {milestones.data?.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="nr-tags">Tags</Label>
          <Input id="nr-tags" value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="e.g. literature review, cost, safety" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="nr-link">Linked items</Label>
          <select
            id="nr-link"
            value=""
            onChange={(e) => {
              const [k, id] = e.target.value.split(":") as ["review" | "report", string];
              if (id && !links.some((l) => l.id === id)) setLinks([...links, { kind: k, id }]);
            }}
            className={selectClass}
          >
            <option value="">Link a review request or report…</option>
            {reviews.data?.map((r) => <option key={r.id} value={`review:${r.id}`}>#{r.number} {r.title}</option>)}
            {reports.data?.map((r) => <option key={r.id} value={`report:${r.id}`}>Report: {(r.title || r.topic).slice(0, 70)}</option>)}
          </select>
          {links.map((l) => {
            const label = l.kind === "review" ? (() => { const r = reviews.data?.find((x) => x.id === l.id); return r ? `#${r.number} ${r.title}` : "Review"; })() : `Report: ${reports.data?.find((x) => x.id === l.id)?.topic ?? ""}`;
            return (
              <div key={l.id} className="flex items-center gap-2 text-sm">
                <span className="flex-1 truncate">{label}</span>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove link" onClick={() => setLinks(links.filter((x) => x.id !== l.id))}><X /></Button>
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
          <span className="text-xs text-muted-foreground">Submitting as {person(me).name}</span>
          <Button type="submit" disabled={busy || !draft}>Submit for review</Button>
        </div>
      </form>
    </div>
  );
}
