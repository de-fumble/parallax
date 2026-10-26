import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, Search } from "lucide-react";
import { DOCUMENT_KINDS, libraryQuery, projectsQuery } from "@/lib/collab/db";
import { exportFiledDocument } from "@/lib/report-export";
import { printLogoFor } from "@/lib/branding";
import { useOrgBranding } from "@/components/OrgBranding";
import { Empty, LoadError, PageTitle, selectClass, timeAgo, useCollab, usePeople } from "@/components/collab/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_workspace/org/library")({
  component: Library,
});

const PERIODS = [
  { id: "any", label: "Any time", days: 0 },
  { id: "30", label: "Last 30 days", days: 30 },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "365", label: "Last year", days: 365 },
];

// The permanent home of approved research: only filed documents appear here,
// at their current version. Search covers the full text.
function Library() {
  const { orgId, members } = useCollab();
  const branding = useOrgBranding();
  const person = usePeople();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [author, setAuthor] = useState("all");
  const [kind, setKind] = useState("all");
  const [period, setPeriod] = useState("any");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // Search after a pause in typing, not on every key.
  useEffect(() => {
    const t = setTimeout(() => setTerm(q), 300);
    return () => clearTimeout(t);
  }, [q]);
  const library = useQuery(libraryQuery(orgId, term));
  const projects = useQuery(projectsQuery(orgId));
  const days = PERIODS.find((p) => p.id === period)!.days;
  const shown = (library.data ?? []).filter(
    (d) =>
      (projectId === "all" || d.project_id === projectId) &&
      (author === "all" || d.created_by === author || d.filed_by === author) &&
      (kind === "all" || d.kind === kind) &&
      (!days || Date.parse(d.filed_at) > Date.now() - days * 86_400_000),
  );

  async function downloadPdf(e: React.MouseEvent, d: (typeof shown)[number]) {
    e.preventDefault();
    e.stopPropagation();
    setDownloadingId(d.id);
    try {
      const logo = await printLogoFor(branding)?.catch(() => null);
      const proj = projects.data?.find((p) => p.id === d.project_id);
      const authorName = d.filed_by ? person(d.filed_by).name : "Unknown";
      const filedDate = d.filed_at
        ? new Date(d.filed_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
        : "";
      const meta = [
        `Version ${d.current_version}`,
        d.kind,
        proj ? proj.name : null,
        filedDate ? `Filed ${filedDate}` : null,
        `By ${authorName}`,
      ]
        .filter(Boolean)
        .join(" · ");

      await exportFiledDocument(
        {
          title: d.title,
          kind: d.kind,
          topic: proj ? `${d.kind} · Project: ${proj.name}` : `${d.kind} · Organization Library`,
          meta,
          sections: d.sections,
        },
        "pdf",
        logo ?? null,
      );
      toast.success(`Downloaded ${d.title} (v${d.current_version}) as PDF`);
    } catch (err) {
      toast.error("Failed to download PDF", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDownloadingId(null);
    }
  }


  return (
    <div className="space-y-5">
      <PageTitle title="Research library" sub="Approved research, filed and searchable by the whole department." />
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the full text of filed research" className="pl-9" aria-label="Search the library" />
        </div>
        <select aria-label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} className={selectClass}>
          <option value="all">All projects</option>
          {projects.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select aria-label="Author" value={author} onChange={(e) => setAuthor(e.target.value)} className={selectClass}>
          <option value="all">All authors</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
        </select>
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
          <option value="all">All kinds</option>
          {DOCUMENT_KINDS.map((k) => <option key={k}>{k}</option>)}
        </select>
        <select aria-label="Filed" value={period} onChange={(e) => setPeriod(e.target.value)} className={selectClass}>
          {PERIODS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>

      {library.isPending ? (
        <div className="grid gap-3 md:grid-cols-2"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : library.isError ? (
        <LoadError error={library.error} />
      ) : shown.length === 0 ? (
        <div className="border border-dashed border-border">
          <Empty>{library.data.length === 0 && !term ? "Nothing has been filed yet. Approved review requests land here." : "No filed research matches."}</Empty>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {shown.map((d) => {
            const summary = d.sections.find((s) => s.body.trim())?.body ?? "";
            return (
              <li key={d.id}>
                <div className="flex h-full flex-col border border-border bg-card p-4 transition-colors hover:border-foreground/40">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to="/org/documents/$documentId"
                      params={{ documentId: d.id }}
                      className="font-serif text-xl leading-snug hover:underline"
                    >
                      {d.title}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="rounded-full border border-foreground px-2 font-mono text-[10px]">v{d.current_version}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-2.5 text-xs gap-1.5 border-border hover:border-foreground"
                        disabled={downloadingId === d.id}
                        onClick={(e) => void downloadPdf(e, d)}
                        title={`Download ${d.title} as PDF`}
                      >
                        {downloadingId === d.id ? <Loader2 className="size-3 animate-spin" /> : <Download className="size-3" />}
                        <span>PDF</span>
                      </Button>
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{d.kind} · {projects.data?.find((p) => p.id === d.project_id)?.name}</div>
                  {summary && (
                    <Link
                      to="/org/documents/$documentId"
                      params={{ documentId: d.id }}
                      className="mt-3 line-clamp-3 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {summary}
                    </Link>
                  )}
                  <div className="mt-auto pt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>Filed {timeAgo(d.filed_at)} by {person(d.filed_by).name}</span>
                    <Link
                      to="/org/documents/$documentId"
                      params={{ documentId: d.id }}
                      className="underline text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      View document →
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
