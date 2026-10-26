import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, GitBranch, Loader2, Users } from "lucide-react";
import { isManager } from "@/lib/organizations";
import { documentQuery, projectsQuery, reviewsQuery, setSectionOwners, startDraft, type DocumentVersion } from "@/lib/collab/db";
import { exportFiledDocument } from "@/lib/report-export";
import { printLogoFor } from "@/lib/branding";
import { useOrgBranding } from "@/components/OrgBranding";
import { Avatar, Panel, PageTitle, timeAgo, useAction, useCollab, usePeople } from "@/components/collab/kit";
import { SectionDiffView } from "@/components/collab/SectionDiff";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_workspace/org/documents/$documentId")({
  component: DocumentPage,
});

// A filed document: its current version, every earlier version, and who owns
// which section.
function DocumentPage() {
  const { documentId } = Route.useParams();
  const { orgId, role, me } = useCollab();
  const branding = useOrgBranding();
  const person = usePeople();
  const act = useAction();
  const navigate = useNavigate();
  const query = useQuery(documentQuery(orgId, documentId));
  const projects = useQuery(projectsQuery(orgId));
  const reviews = useQuery(reviewsQuery(orgId));
  const [compare, setCompare] = useState<number | null>(null);
  const [owning, setOwning] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  if (query.isPending) return <Skeleton className="h-64" />;
  if (query.isError) return <p className="border border-weak/40 bg-weak/5 p-4 text-sm">{query.error.message}</p>;
  const { doc, versions, owners } = query.data;
  if (!doc) return <p>This document doesn't exist or you don't have access to it.</p>;

  const project = projects.data?.find((p) => p.id === doc.project_id);
  const current = versions.find((v) => v.version === doc.current_version);
  const canOwn = isManager(role) || project?.lead_id === me;
  const shown = compare ? versions.find((v) => v.version === compare) : null;
  const previous = shown ? versions.find((v) => v.version === shown.version - 1) : null;

  async function downloadPdf(v?: DocumentVersion) {
    const target = v ?? shown ?? current;
    if (!doc || !target) return;
    const tag = `v${target.version}`;
    setDownloading(tag);
    try {
      const logo = await printLogoFor(branding)?.catch(() => null);
      const author = target.filed_by ? person(target.filed_by).name : "Unknown";
      const filedDate = target.filed_at
        ? new Date(target.filed_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
        : "";
      const meta = [
        `Version ${target.version}`,
        doc.kind,
        project ? project.name : null,
        filedDate ? `Filed ${filedDate}` : null,
        `By ${author}`,
      ]
        .filter(Boolean)
        .join(" · ");

      await exportFiledDocument(
        {
          title: doc.title,
          kind: doc.kind,
          topic: project ? `${doc.kind} · Project: ${project.name}` : `${doc.kind} · Organization Library`,
          meta,
          sections: target.sections,
        },
        "pdf",
        logo ?? null,
      );
      toast.success(`Downloaded ${doc.title} (v${target.version}) as PDF`);
    } catch (err) {
      toast.error("Failed to download PDF", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        title={<>{doc.title} <span className="rounded-full border border-foreground px-2 font-mono text-xs">v{doc.current_version}</span></>}
        sub={<>{doc.kind} · {project && <Link to="/org/projects/$projectId" params={{ projectId: project.id }} className="underline">{project.name}</Link>} · filed {timeAgo(doc.filed_at)}</>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={!!downloading}
              onClick={() => void downloadPdf()}
              title="Download this version as PDF"
            >
              {downloading === (shown ? `v${shown.version}` : `v${doc.current_version}`) ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              <span>Download PDF {shown ? `(v${shown.version})` : `(v${doc.current_version})`}</span>
            </Button>
            <Button
              onClick={async () => {
                const id = await act(() => startDraft({ project: doc.project_id, document: doc.id, title: doc.title, kind: doc.kind, sections: null }), "Draft started");
                if (id) navigate({ to: "/org/drafts/$draftId", params: { draftId: id } });
              }}
            >
              <GitBranch /> Start a draft
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          {shown ? (
            <>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>Version {shown.version} compared with {previous ? `version ${previous.version}` : "nothing (first version)"}</span>
                <button type="button" className="underline" onClick={() => setCompare(null)}>Back to the current version</button>
              </div>
              <SectionDiffView before={previous?.sections ?? []} after={shown.sections} />
            </>
          ) : (
            current?.sections.map((s) => {
              const sectionOwners = owners.filter((o) => o.section_title === s.title);
              return (
                <section key={s.title} className="border-b border-border pb-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-2xl">{s.title}</h2>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {sectionOwners.length > 0 && <span>Owned by {sectionOwners.map((o) => person(o.user_id).name).join(", ")}</span>}
                      {canOwn && <button type="button" className="underline" onClick={() => setOwning(s.title)}><Users className="inline size-3" /> Owners</button>}
                    </div>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{s.body || <span className="text-muted-foreground">Empty</span>}</p>
                </section>
              );
            })
          )}
        </div>

        <aside className="space-y-4">
          <Panel title={`Versions (${versions.length})`}>
            <ul className="divide-y divide-border">
              {versions.map((v) => {
                const review = reviews.data?.find((r) => r.id === v.review_id);
                return (
                  <li key={v.version} className="flex items-start gap-2 px-4 py-2.5">
                    <Avatar id={v.filed_by} size="sm" />
                    <div className="min-w-0 flex-1 text-sm">
                      <div>
                        <span className="font-mono">v{v.version}</span> · {timeAgo(v.filed_at)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Filed by {person(v.filed_by).name}
                        {review && <> from <Link to="/org/reviews/$number" params={{ number: String(review.number) }} className="underline">#{review.number}</Link></>}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-50"
                        title={`Download v${v.version} as PDF`}
                        disabled={downloading === `v${v.version}`}
                        onClick={() => void downloadPdf(v)}
                      >
                        {downloading === `v${v.version}` ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Download className="size-3" />
                        )}
                        <span>PDF</span>
                      </button>
                      <button type="button" className="text-xs underline" onClick={() => setCompare(v.version)}>Changes</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </aside>
      </div>

      {owning !== null && (
        <OwnersDialog
          documentId={doc.id}
          section={owning}
          current={owners.filter((o) => o.section_title === owning).map((o) => o.user_id)}
          onClose={() => setOwning(null)}
          onSave={(users) => act(() => setSectionOwners(doc.id, owning, users), "Section owners saved")}
        />
      )}
    </div>
  );
}

function OwnersDialog({ section, current, onClose, onSave }: { documentId: string; section: string; current: string[]; onClose: () => void; onSave: (users: string[]) => Promise<unknown> }) {
  const { members } = useCollab();
  const [picked, setPicked] = useState(current);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Owners of "{section}"</DialogTitle>
          <DialogDescription>Owners are told whenever a review request changes this section.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 divide-y divide-border overflow-y-auto border border-border">
          {members.map((m) => (
            <li key={m.user_id}>
              <label className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <input type="checkbox" className="size-4" checked={picked.includes(m.user_id)} onChange={(e) => setPicked(e.target.checked ? [...picked, m.user_id] : picked.filter((x) => x !== m.user_id))} />
                <Avatar id={m.user_id} size="sm" />
                {m.full_name || m.email}
              </label>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={async () => { await onSave(picked); onClose(); }}>Save owners</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
