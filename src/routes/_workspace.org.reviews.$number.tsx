import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AtSign, CheckCircle2, CircleDashed, Clock, Download, FileText, GitBranch, Link2, Loader2, MessageSquare, Paperclip, Smile, X, XCircle } from "lucide-react";
import {
  acceptSuggestion,
  addComment,
  addLink,
  attachmentUrl,
  decide,
  milestonesQuery,
  orgReportsQuery,
  projectsQuery,
  REACTIONS,
  removeLink,
  resubmit,
  reviewQuery,
  reviewsQuery,
  setResolved,
  toggleReaction,
  type Approval,
  type Comment,
  type Reaction,
} from "@/lib/collab/db";
import { canDecide, pendingStage, STAGE_NAMES } from "@/lib/collab/rules";
import { exportFiledDocument } from "@/lib/report-export";
import { printLogoFor } from "@/lib/branding";
import { useOrgBranding } from "@/components/OrgBranding";
import { Avatar, LabelChip, Panel, StatusPill, UrgencyChip, selectClass, timeAgo, useAction, useCollab, usePeople, waited } from "@/components/collab/kit";
import { SectionDiffView } from "@/components/collab/SectionDiff";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_workspace/org/reviews/$number")({
  component: ReviewPage,
});

function ReviewPage() {
  const { number } = Route.useParams();
  const { orgId } = useCollab();
  const query = useQuery(reviewQuery(orgId, Number(number)));
  const projects = useQuery(projectsQuery(orgId));
  const milestones = useQuery(milestonesQuery(orgId));
  const person = usePeople();

  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <p className="border border-weak/40 bg-weak/5 p-4 text-sm">{query.error.message}</p>;
  const data = query.data;
  if (!data) return <p>Review request #{number} doesn't exist or you don't have access to it. <Link to="/org/reviews" className="underline">All requests</Link></p>;
  const { review: r, draft, before, after, comments, attachments } = data;
  const project = projects.data?.find((p) => p.id === r.project_id);
  const milestone = milestones.data?.find((m) => m.id === r.milestone_id);
  const orphaned = comments.filter((c) => !after.some((s) => s.title === c.section_title) && !before.some((s) => s.title === c.section_title));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl leading-tight [overflow-wrap:anywhere] sm:text-3xl">
          {r.title} <span className="font-normal text-muted-foreground">#{r.number}</span>
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <StatusPill status={r.status} />
          <UrgencyChip urgency={r.urgency} />
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{person(r.author_id).name}</span> wants to file {r.touched.length} {r.touched.length === 1 ? "section" : "sections"} into
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 font-mono text-xs">
            <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
              <FileText className="size-3" /> {draft.base_version ? `${draft.title} · v${draft.base_version} → v${draft.base_version + 1}` : "Library · new document"}
            </span>
            <span className="text-muted-foreground">from</span>
            <Link to="/org/drafts/$draftId" params={{ draftId: draft.id }} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 underline-offset-2 hover:underline">
              <GitBranch className="size-3" /> draft by {person(draft.author_id).name.split(" ")[0]}
            </Link>
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div className="min-w-0 space-y-5">
          <article className="border border-border bg-card">
            <header className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2 text-sm">
              <Avatar id={r.author_id} size="sm" /> <span className="font-medium">{person(r.author_id).name}</span>
              <span className="text-muted-foreground">submitted {timeAgo(r.created_at)} · {r.kind}</span>
            </header>
            <div className="space-y-4 p-4 text-sm leading-relaxed">
              <div>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Summary and key findings</div>
                <p className="whitespace-pre-wrap">{r.summary || <span className="text-muted-foreground">No summary given.</span>}</p>
              </div>
              {r.next_steps.length > 0 && (
                <div>
                  <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Next steps {r.status !== "filed" && "· become tasks when filed"}
                  </div>
                  <ul className="space-y-1">{r.next_steps.map((s, i) => <li key={i}>☐ {s.text} <span className="text-muted-foreground">→ {person(s.assignee ?? r.author_id).name}</span></li>)}</ul>
                </div>
              )}
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={async () => {
                        try {
                          window.open(await attachmentUrl(a.path), "_blank", "noopener");
                        } catch (err) {
                          toast.error("Couldn't open the file", { description: err instanceof Error ? err.message : undefined });
                        }
                      }}
                      className="flex items-center gap-1.5 border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      <Paperclip className="size-3" /> {a.name} <span className="text-muted-foreground">{Math.max(1, Math.round(a.size / 1024))} KB</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </article>

          <div>
            <h2 className="mb-3 text-xl">Changes</h2>
            <SectionDiffView
              before={before}
              after={after}
              header={(title) => {
                const n = comments.filter((c) => c.section_title === title).length;
                return n ? <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground"><MessageSquare className="size-3" /> {n}</span> : null;
              }}
              extra={(title) => <SectionComments data={data} section={title} body={after.find((s) => s.title === title)?.body ?? ""} />}
            />
            {orphaned.length > 0 && (
              <Panel title="Comments on sections that no longer exist">
                <ul className="divide-y divide-border">{orphaned.map((c) => <CommentItem key={c.id} c={c} data={data} />)}</ul>
              </Panel>
            )}
          </div>

          <DecisionBox data={data} />
        </div>

        <aside className="space-y-4 text-sm">
          <Block title="Approvals">
            <ul>{data.approvals.map((a) => <StageRow key={a.stage} a={a} />)}</ul>
            {!r.needs_manager && r.status !== "filed" && <p className="mt-1 text-xs text-muted-foreground">Goes straight to the head of department.</p>}
          </Block>
          {data.owners.some((o) => r.touched.includes(o.section_title)) && (
            <Block title="Section owners told">
              <ul className="space-y-1">
                {[...new Set(data.owners.filter((o) => r.touched.includes(o.section_title)).map((o) => o.user_id))].map((id) => (
                  <li key={id} className="flex items-center gap-2"><Avatar id={id} size="sm" /> {person(id).name}</li>
                ))}
              </ul>
            </Block>
          )}
          {r.labels.length > 0 && <Block title="Tags"><div className="flex flex-wrap gap-1">{r.labels.map((l) => <LabelChip key={l}>{l}</LabelChip>)}</div></Block>}
          <Block title="Project">{project ? <Link to="/org/projects/$projectId" params={{ projectId: project.id }} className="underline">{project.name}</Link> : "—"}</Block>
          {milestone && <Block title="Milestone">{milestone.title}</Block>}
          <Links data={data} />
        </aside>
      </div>
    </div>
  );
}

type ReviewData = NonNullable<Awaited<ReturnType<ReturnType<typeof reviewQuery>["queryFn"] & {}>>>;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border pb-4">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function StageRow({ a }: { a: Approval }) {
  const person = usePeople();
  const icon =
    a.state === "approved" ? <CheckCircle2 className="size-4 text-strong" /> :
    a.state === "changes_requested" ? <XCircle className="size-4 text-weak" /> :
    a.state === "pending" ? <Clock className="size-4 text-moderate" /> :
    <CircleDashed className="size-4 text-muted-foreground" />;
  const detail =
    a.state === "approved" ? `Approved by ${person(a.decided_by).name} ${timeAgo(a.decided_at)}` :
    a.state === "changes_requested" ? `Changes requested by ${person(a.decided_by).name}` :
    a.state === "pending" ? `Waiting ${waited(a.pending_since)}` :
    "After stage 1";
  return (
    <li className="flex items-start gap-2 py-1.5">
      <span className="mt-0.5">{icon}</span>
      <div className="min-w-0">
        <div>{a.stage === "manager" ? "Stage 1 · " : "Stage 2 · "}{STAGE_NAMES[a.stage]}</div>
        <div className={`text-[11px] ${a.state === "pending" && a.pending_since && Date.now() - Date.parse(a.pending_since) > 86_400_000 ? "text-weak" : "text-muted-foreground"}`}>{detail}</div>
        {a.note && <div className="mt-1 border-l-2 border-border pl-2 text-xs text-muted-foreground">{a.note}</div>}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Comments on a section, with suggested wording, mentions and reactions.

function SectionComments({ data, section, body }: { data: ReviewData; section: string; body: string }) {
  const { members } = useCollab();
  const act = useAction();
  const here = data.comments.filter((c) => c.section_title === section);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [suggest, setSuggest] = useState(false);
  const [suggestion, setSuggestion] = useState(body);
  const [picking, setPicking] = useState(false);
  const closed = data.review.status === "filed" || data.review.status === "closed";

  async function send() {
    // Anyone named as @Full Name is notified.
    const mentions = members.filter((m) => {
      const name = m.full_name || m.email;
      return name && text.includes(`@${name}`);
    }).map((m) => m.user_id);
    const ok = await act(() => addComment({ review: data.review.id, section, body: text, suggestion: suggest ? suggestion : null, mentions }), "Comment added");
    if (ok !== undefined) {
      setText("");
      setSuggest(false);
      setOpen(false);
    }
  }

  return (
    <div className="border-t border-border">
      {here.length > 0 && <ul className="divide-y divide-border">{here.map((c) => <CommentItem key={c.id} c={c} data={data} />)}</ul>}
      {!closed && (
        open ? (
          <div className="space-y-2 bg-background p-3">
            <div className="relative">
              <Textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Comment on "${section}". Use @ to mention someone.`} />
              <button type="button" aria-label="Mention someone" onClick={() => setPicking(!picking)} className="absolute bottom-2 right-2 rounded p-1 text-muted-foreground hover:text-foreground">
                <AtSign className="size-4" />
              </button>
              {picking && (
                <ul className="absolute bottom-10 right-2 z-10 max-h-48 w-56 overflow-y-auto border border-border bg-popover shadow-lg">
                  {members.map((m) => (
                    <li key={m.user_id}>
                      <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => { setText(`${text}${text && !text.endsWith(" ") ? " " : ""}@${m.full_name || m.email} `); setPicking(false); }}>
                        <Avatar id={m.user_id} size="sm" /> {m.full_name || m.email}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={suggest} onChange={(e) => { setSuggest(e.target.checked); if (e.target.checked) setSuggestion(body); }} />
              Suggest new wording for this section
            </label>
            {suggest && <Textarea rows={5} value={suggestion} onChange={(e) => setSuggestion(e.target.value)} aria-label="Suggested wording" className="bg-strong/5" />}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" disabled={!text.trim()} onClick={() => void send()}>Comment</Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground">
            <MessageSquare className="size-3.5" /> Comment on this section
          </button>
        )
      )}
    </div>
  );
}

function CommentItem({ c, data }: { c: Comment; data: ReviewData }) {
  const { me, members } = useCollab();
  const person = usePeople();
  const act = useAction();
  const [react, setReact] = useState(false);
  const reactions = data.reactions.filter((x) => x.comment_id === c.id);
  const grouped = REACTIONS.map((e) => ({ emoji: e, people: reactions.filter((x: Reaction) => x.emoji === e) })).filter((g) => g.people.length);
  const isAuthor = data.review.author_id === me;
  const open = data.review.status === "in_review" || data.review.status === "changes_requested";
  const names = members.map((m) => m.full_name || m.email).filter(Boolean) as string[];
  const mention = new RegExp(`(@(?:${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") || "(?!)"}))`);

  return (
    <li className={`p-3 ${c.resolved ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Avatar id={c.author_id} size="sm" /> <span className="font-medium">{person(c.author_id).name}</span>
        <span className="text-muted-foreground">{timeAgo(c.created_at)}</span>
        {c.resolved && <span className="text-xs text-strong">Resolved</span>}
        {(c.author_id === me || isAuthor) && (
          <button type="button" className="ml-auto text-xs text-muted-foreground underline" onClick={() => void act(() => setResolved(c.id, !c.resolved))}>
            {c.resolved ? "Reopen" : "Resolve"}
          </button>
        )}
      </div>
      <p className="mt-1.5 whitespace-pre-wrap text-sm">
        {c.body.split(mention).map((part, i) => (part.startsWith("@") && names.includes(part.slice(1)) ? <span key={i} className="font-medium underline decoration-dotted">{part}</span> : part))}
      </p>
      {c.suggestion && (
        <div className="mt-2 border border-border">
          <div className="border-b border-border bg-muted/40 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Suggested wording</div>
          <p className="whitespace-pre-wrap bg-strong/10 px-2 py-1.5 text-sm">{c.suggestion}</p>
          {isAuthor && open && !c.resolved && (
            <div className="flex justify-end p-2">
              <Button size="sm" variant="outline" onClick={() => void act(() => acceptSuggestion(c.id), "Suggestion applied to your draft")}>Accept suggestion</Button>
            </div>
          )}
        </div>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {grouped.map((g) => {
          const mine = g.people.some((x) => x.user_id === me);
          return (
            <button key={g.emoji} type="button" title={g.people.map((x) => person(x.user_id).name).join(", ")}
              onClick={() => void act(() => toggleReaction(c.id, me, g.emoji, !mine))}
              className={`rounded-full border px-2 py-0.5 text-xs ${mine ? "border-foreground bg-muted" : "border-border"}`}>
              {g.emoji} {g.people.length}
            </button>
          );
        })}
        <div className="relative">
          <button type="button" aria-label="React" onClick={() => setReact(!react)} className="rounded-full border border-border p-1 text-muted-foreground hover:text-foreground">
            <Smile className="size-3.5" />
          </button>
          {react && (
            <div className="absolute left-0 top-8 z-10 flex gap-1 border border-border bg-popover p-1 shadow-lg">
              {REACTIONS.map((e) => {
                const mine = reactions.some((x) => x.emoji === e && x.user_id === me);
                return (
                  <button key={e} type="button" className="rounded px-1.5 py-1 hover:bg-muted" onClick={() => { setReact(false); void act(() => toggleReaction(c.id, me, e, !mine)); }}>
                    {e}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------

function Links({ data }: { data: ReviewData }) {
  const { orgId, me, role } = useCollab();
  const act = useAction();
  const reviews = useQuery(reviewsQuery(orgId));
  const reports = useQuery(orgReportsQuery(orgId));
  const canEdit = data.review.author_id === me || ["manager", "hod", "owner"].includes(role);
  const label = (kind: "review" | "report", id: string) => {
    if (kind === "review") {
      const r = reviews.data?.find((x) => x.id === id);
      return r ? <Link to="/org/reviews/$number" params={{ number: String(r.number) }} className="underline">#{r.number} {r.title}</Link> : "A review request";
    }
    const rep = reports.data?.find((x) => x.id === id);
    return <Link to="/reports/$id" params={{ id }} className="underline">Report: {rep?.title || rep?.topic || "research report"}</Link>;
  };
  const linked = data.links.map((l) => ({ kind: l.target_kind, id: l.target_id, mine: true }));
  const from = data.linkedFrom.map((l) => ({ kind: "review" as const, id: l.review_id, mine: false }));

  return (
    <Block title="Linked">
      {linked.length + from.length === 0 && <p className="text-muted-foreground">Nothing linked.</p>}
      <ul className="space-y-1.5">
        {[...linked, ...from].map((l) => (
          <li key={`${l.kind}-${l.id}-${l.mine}`} className="flex items-start gap-1.5">
            <Link2 className="mt-1 size-3 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">{l.mine ? null : <span className="text-muted-foreground">Linked from </span>}{label(l.kind, l.id)}</span>
            {l.mine && canEdit && (
              <button type="button" aria-label="Remove link" className="text-muted-foreground hover:text-foreground" onClick={() => void act(() => removeLink(data.review.id, l.kind, l.id))}><X className="size-3.5" /></button>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <select
          aria-label="Link an item"
          value=""
          onChange={(e) => {
            const [kind, id] = e.target.value.split(":") as ["review" | "report", string];
            if (id) void act(() => addLink(data.review.id, kind, id, me), "Linked");
          }}
          className={`${selectClass} mt-2 w-full`}
        >
          <option value="">Link another item…</option>
          {reviews.data?.filter((r) => r.id !== data.review.id && !data.links.some((l) => l.target_id === r.id)).map((r) => <option key={r.id} value={`review:${r.id}`}>#{r.number} {r.title}</option>)}
          {reports.data?.filter((r) => !data.links.some((l) => l.target_id === r.id)).map((r) => <option key={r.id} value={`report:${r.id}`}>Report: {(r.title || r.topic).slice(0, 60)}</option>)}
        </select>
      )}
    </Block>
  );
}

// ---------------------------------------------------------------------------
// What this person can do with the request now.

function DecisionBox({ data }: { data: ReviewData }) {
  const { role, me, members } = useCollab();
  const act = useAction();
  const person = usePeople();
  const branding = useOrgBranding();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const r = data.review;
  const stage = pendingStage(data.approvals);
  const allowed = canDecide(r, data.approvals, role, me, members);
  const isAuthor = r.author_id === me;

  async function handleDownloadFiledPdf() {
    setDownloadingPdf(true);
    try {
      const logo = await printLogoFor(branding)?.catch(() => null);
      const authorName = r.author_id ? person(r.author_id).name : "Unknown";
      const meta = [
        `Version ${r.filed_version ?? 1}`,
        r.kind,
        `By ${authorName}`,
      ]
        .filter(Boolean)
        .join(" · ");

      await exportFiledDocument(
        {
          title: r.title,
          kind: r.kind,
          topic: `${r.kind} · Review #${r.number}`,
          meta,
          sections: data.after,
        },
        "pdf",
        logo ?? null,
      );
      toast.success(`Downloaded ${r.title} (v${r.filed_version}) as PDF`);
    } catch (err) {
      toast.error("Failed to download PDF", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDownloadingPdf(false);
    }
  }

  const run = async (decision: "approve" | "request_changes" | "reject") => {
    if (decision !== "approve" && !note.trim()) {
      toast.error(decision === "reject" ? "Say why it's being rejected" : "Say what needs to change");
      return;
    }
    setBusy(true);
    const result = await act(() => decide(r.id, decision, note), decision === "approve" ? (stage?.stage === "hod" ? "Approved and filed" : "Approved") : decision === "reject" ? "Rejected" : "Changes requested");
    setBusy(false);
    if (result !== undefined) setNote("");
  };

  let headline: string;
  let detail: string;
  if (r.status === "filed") {
    headline = `Filed as version ${r.filed_version}`;
    detail = "Approved by every required reviewer and added to the library.";
  } else if (r.status === "closed") {
    headline = "Rejected";
    detail = r.closed_reason ?? "Closed without filing.";
  } else if (r.status === "changes_requested") {
    const who = data.approvals.find((a) => a.state === "changes_requested");
    headline = "Changes requested";
    detail = who?.note ? `${person(who.decided_by).name}: ${who.note}` : "Back with the author to revise and resubmit.";
  } else if (stage?.stage === "manager") {
    headline = "Waiting for a Research Manager";
    detail = "The head of department reviews it once a Research Manager approves.";
  } else {
    headline = "Waiting for the head of department";
    detail = "Final approval files it into the library as a new version.";
  }

  return (
    <section className="border-2 border-foreground bg-card">
      <div className="flex items-start gap-3 border-b border-border p-4">
        {r.status === "filed" ? <CheckCircle2 className="mt-0.5 size-5 text-strong" /> : r.status === "closed" || r.status === "changes_requested" ? <XCircle className="mt-0.5 size-5 text-weak" /> : <Clock className="mt-0.5 size-5 text-muted-foreground" />}
        <div className="min-w-0">
          <div className="font-medium">{headline}</div>
          <div className="text-sm text-muted-foreground">{detail}</div>
        </div>
      </div>

      {allowed && (
        <div className="space-y-3 p-4">
          {stage?.stage === "hod" && r.next_steps.length > 0 && (
            <p className="text-xs text-muted-foreground">Filing creates {r.next_steps.length} follow-up {r.next_steps.length === 1 ? "task" : "tasks"}.</p>
          )}
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="A note for the author (needed to request changes or reject)" />
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void run("approve")}>{stage?.stage === "hod" ? "Approve & file" : "Approve"}</Button>
            <Button variant="outline" disabled={busy} onClick={() => void run("request_changes")}>Request changes</Button>
            <Button variant="ghost" className="text-weak" disabled={busy} onClick={() => void run("reject")}>Reject</Button>
          </div>
        </div>
      )}

      {!allowed && isAuthor && r.status === "changes_requested" && (
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Button asChild variant="outline"><Link to="/org/drafts/$draftId" params={{ draftId: r.draft_id }}>Edit the draft</Link></Button>
          <Button disabled={busy} onClick={async () => { setBusy(true); await act(() => resubmit(r.id), "Resubmitted for review"); setBusy(false); }}>Resubmit for review</Button>
        </div>
      )}
      {!allowed && isAuthor && r.status === "in_review" && (
        <p className="p-4 text-sm text-muted-foreground">Your request is with its reviewers. Changing the draft now sends it back to the first stage.</p>
      )}
      {!allowed && !isAuthor && r.status === "in_review" && (
        <p className="p-4 text-sm text-muted-foreground">You can comment on any section. Approving needs the {stage ? STAGE_NAMES[stage.stage] : "reviewer"} role.</p>
      )}
      {r.status === "filed" && (
        <div className="flex flex-wrap items-center gap-2 p-4">
          <Button asChild variant="outline">
            <Link to="/org/documents/$documentId" params={{ documentId: r.document_id }}>Open in the library</Link>
          </Button>
          <Button
            variant="outline"
            disabled={downloadingPdf}
            onClick={() => void handleDownloadFiledPdf()}
          >
            {downloadingPdf ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            <span>Download PDF {r.filed_version ? `(v${r.filed_version})` : ""}</span>
          </Button>
        </div>
      )}
    </section>
  );
}
