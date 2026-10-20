import { useState } from "react";
import type { Section } from "@/lib/collab/db";
import { diffSections, type SectionDiff } from "@/lib/collab/diff";

const KIND_LABEL: Record<SectionDiff["kind"], string> = { added: "New section", removed: "Removed", changed: "Changed", same: "Unchanged" };

/**
 * Two versions of a document compared section by section: what was added,
 * removed or reworded. `extra` renders under a section (comments, for example).
 */
export function SectionDiffView({
  before,
  after,
  extra,
  header,
}: {
  before: Section[];
  after: Section[];
  extra?: (title: string) => React.ReactNode;
  header?: (title: string) => React.ReactNode;
}) {
  const [view, setView] = useState<"changes" | "result">("changes");
  const [showSame, setShowSame] = useState(false);
  const diff = diffSections(before, after);
  const changed = diff.filter((d) => d.kind !== "same");
  const shown = showSame ? diff : changed;
  const added = diff.reduce((n, d) => n + d.lines.filter((l) => l.kind === "add").length, 0);
  const removed = diff.reduce((n, d) => n + d.lines.filter((l) => l.kind === "remove").length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          <span className="text-strong">+{added}</span> <span className="text-weak">−{removed}</span> sentences in {changed.length} of {diff.length} sections
        </span>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" className="size-4" checked={showSame} onChange={(e) => setShowSame(e.target.checked)} /> Show unchanged sections
          </label>
          <div className="flex border border-border">
            {(["changes", "result"] as const).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)} className={`px-3 py-1.5 text-xs ${view === v ? "bg-foreground text-background" : "text-muted-foreground"}`}>
                {v === "changes" ? "Show changes" : "Show result"}
              </button>
            ))}
          </div>
        </div>
      </div>
      {shown.length === 0 && <p className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No sections changed.</p>}
      {shown.map((s) => (
        <section key={s.title} id={`diff-${s.title}`} className="border border-border bg-card">
          <header className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-sm">
            <span className="font-medium">{s.title}</span>
            <span className={`text-xs ${s.kind === "added" ? "text-strong" : s.kind === "removed" ? "text-weak" : "text-muted-foreground"}`}>{KIND_LABEL[s.kind]}</span>
            {header?.(s.title)}
          </header>
          <div className="text-[15px] leading-relaxed">
            {s.lines
              .filter((l) => view === "changes" || l.kind !== "remove")
              .map((l, i) => (
                <div
                  key={i}
                  className={`flex gap-3 px-3 py-1 ${
                    view === "changes" && l.kind === "add" ? "bg-strong/10" : view === "changes" && l.kind === "remove" ? "bg-weak/10 text-muted-foreground line-through decoration-weak/50" : ""
                  }`}
                >
                  <span className="w-3 shrink-0 select-none font-mono text-muted-foreground">{view === "changes" ? (l.kind === "add" ? "+" : l.kind === "remove" ? "−" : " ") : ""}</span>
                  <span className="min-w-0 whitespace-pre-wrap">{l.text}</span>
                </div>
              ))}
            {s.lines.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Empty section</div>}
          </div>
          {extra?.(s.title)}
        </section>
      ))}
    </div>
  );
}
