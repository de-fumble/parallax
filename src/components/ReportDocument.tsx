import { Fragment, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, EyeOff, Pencil, Plus, X } from "lucide-react";
import { HALF_WIDTH, SECTION_TITLES, sectionHasContent, type SectionKey } from "@/lib/report-layout";
import type { Report } from "@/lib/research.types";
import { Button } from "@/components/ui/button";

// The body of a report, in reading mode or editing mode. In editing mode every
// piece of text becomes a field, list items can be added and removed, and each
// section can be moved or hidden. The parent owns the draft and saves it.

export type ReportEditor = {
  /** Change the draft report. The callback may mutate the copy it is given. */
  update: (change: (report: Report) => void) => void;
  move: (key: SectionKey, direction: -1 | 1) => void;
  hide: (key: SectionKey) => void;
  show: (key: SectionKey) => void;
};

type Props = {
  report: Report;
  topic: string;
  createdAt: string;
  layout: SectionKey[];
  hidden: SectionKey[];
  /** Present while editing. */
  editor?: ReportEditor | undefined;
  /** Sections to keep on screen while editing even if emptied, so items can be added back. */
  keep?: ReadonlySet<SectionKey> | undefined;
  /** Reading mode: called when a section is clicked, to start editing there. */
  onEditRequest?: ((key: SectionKey | "summary") => void) | undefined;
};

function Cited({ text }: { text: string }) {
  const parts = text.split(/(\[S\d+\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[(S\d+)\]$/);
        if (m) return <a key={i} href={`#src-${m[1]}`} className="cite-chip">{m[1]}</a>;
        if (p.startsWith("Interpretation:")) return <Fragment key={i}><em className="text-muted-foreground">Interpretation:</em>{p.slice(15)}</Fragment>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

const qualityClass: Record<string, string> = {
  STRONG: "bg-strong/15 text-strong",
  MODERATE: "bg-moderate/20 text-foreground",
  WEAK: "bg-weak/15 text-weak",
  HIGH: "bg-strong/15 text-strong",
  MEDIUM: "bg-moderate/20 text-foreground",
  LOW: "bg-weak/15 text-weak",
};

function Tag({ children, tone }: { children: ReactNode; tone?: string }) {
  return <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${tone ? qualityClass[tone] ?? "bg-muted" : "bg-muted text-muted-foreground"}`}>{children}</span>;
}

/** A piece of report text: plain (with citation chips) when reading, a field when editing. */
function Text({
  value,
  onChange,
  editing,
  label,
  className = "",
  cite = true,
}: {
  value: string;
  onChange: (value: string) => void;
  editing: boolean;
  label: string;
  className?: string;
  cite?: boolean;
}) {
  if (!editing) return cite ? <Cited text={value} /> : <>{value}</>;
  return (
    <textarea
      aria-label={label}
      value={value}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      // Grows with its content, so the field is always the size of the text.
      style={{ fieldSizing: "content" } as React.CSSProperties}
      className={`block w-full resize-none border border-input bg-background px-2 py-1.5 outline-none transition-colors focus:border-foreground ${className}`}
    />
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="icon" className="size-10 shrink-0 text-muted-foreground md:size-7" aria-label={label} onClick={onClick}>
      <X />
    </Button>
  );
}

/** A bulleted list. When editing, items can be reworded, removed and added. */
function List({
  items,
  onChange,
  editing,
  label,
}: {
  items: string[];
  onChange: (items: string[]) => void;
  editing: boolean;
  label: string;
}) {
  if (!editing) {
    return <ul className="list-disc space-y-1.5 pl-5">{items.map((x, i) => <li key={i}><Cited text={x} /></li>)}</ul>;
  }
  return (
    <div className="space-y-2">
      {items.map((x, i) => (
        <div key={i} className="flex items-start gap-1">
          <Text editing value={x} label={`${label} ${i + 1}`} onChange={(v) => onChange(items.map((y, j) => (j === i ? v : y)))} />
          <RemoveButton label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...items, ""])}>
        <Plus /> Add item
      </Button>
    </div>
  );
}

function SectionFrame({
  sectionKey,
  position,
  count,
  editor,
  onEditRequest,
  children,
}: {
  sectionKey: SectionKey;
  position: number;
  count: number;
  editor: ReportEditor | undefined;
  onEditRequest: Props["onEditRequest"];
  children: ReactNode;
}) {
  const title = SECTION_TITLES[sectionKey];
  return (
    <section
      id={`section-${sectionKey}`}
      data-outline={title}
      onClick={onEditRequest ? (e) => requestEdit(e, () => onEditRequest(sectionKey)) : undefined}
      className={`group/section mt-12 scroll-mt-28 ${HALF_WIDTH.has(sectionKey) ? "" : "md:col-span-2"} ${
        editor ? "border border-dashed border-border p-3 sm:p-4" : onEditRequest ? "editable-region" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
        <h2 className="min-w-0 text-2xl">{title}</h2>
        {editor ? (
          <div className="flex shrink-0 items-center gap-0.5 print:hidden">
            <Button type="button" variant="ghost" size="icon" className="size-10 md:size-8" disabled={position === 0} aria-label={`Move ${title} up`} onClick={() => editor.move(sectionKey, -1)}>
              <ArrowUp />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="size-10 md:size-8" disabled={position === count - 1} aria-label={`Move ${title} down`} onClick={() => editor.move(sectionKey, 1)}>
              <ArrowDown />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => editor.hide(sectionKey)}>
              <EyeOff /> <span className="max-sm:sr-only">Hide</span>
            </Button>
          </div>
        ) : (
          onEditRequest && <EditHint />
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EditHint() {
  return (
    // Shown on hover with a mouse; always shown on touch, where there is no hover.
    <span className="flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity group-hover/section:opacity-100 print:hidden [@media(hover:none)]:opacity-100">
      <Pencil className="size-3" />
      <span className="[@media(hover:none)]:hidden">Click to edit</span>
      <span className="hidden [@media(hover:none)]:inline">Edit</span>
    </span>
  );
}

// A click on a section starts editing — unless it was really a click on a link
// or button inside it, or the end of selecting text to copy.
function requestEdit(e: React.MouseEvent, start: () => void) {
  if ((e.target as HTMLElement).closest("a, button")) return;
  if (window.getSelection()?.toString()) return;
  start();
}

export function ReportDocument({ report: r, topic, createdAt, layout, hidden, editor, keep, onEditRequest }: Props) {
  const editing = !!editor;
  const update = editor?.update ?? (() => {});
  const visible = layout.filter((key) => !hidden.includes(key) && (sectionHasContent(r, key) || (editing && keep?.has(key))));
  const restorable = editing ? layout.filter((key) => hidden.includes(key)) : [];

  const body: Record<SectionKey, () => ReactNode> = {
    template: () => (
      <div className="space-y-8">
        {(r.template_sections ?? []).map((s, i) => (
          <div key={i}>
            <div className="flex items-start gap-1">
              <h3 className="min-w-0 flex-1 text-xl">
                <Text editing={editing} cite={false} value={s.title} label={`Section ${i + 1} title`} onChange={(v) => update((d) => { d.template_sections![i]!.title = v; })} />
              </h3>
              {editing && <RemoveButton label={`Remove section ${i + 1}`} onClick={() => update((d) => { d.template_sections!.splice(i, 1); })} />}
            </div>
            <div className="mt-2 space-y-3 leading-relaxed">
              {editing ? (
                <Text editing value={s.content} label={`Section ${i + 1} content`} onChange={(v) => update((d) => { d.template_sections![i]!.content = v; })} />
              ) : (
                s.content.split(/\n{2,}/).filter((p) => p.trim()).map((p, j) => <p key={j}><Cited text={p} /></p>)
              )}
            </div>
          </div>
        ))}
      </div>
    ),

    findings: () => (
      <ol className="space-y-5">
        {r.key_findings.map((f, i) => (
          <li key={i} className="grid grid-cols-[2rem_1fr] gap-2">
            <span className="font-mono text-sm text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1 leading-relaxed">
                  <Text editing={editing} value={f.finding} label={`Finding ${i + 1}`} onChange={(v) => update((d) => { d.key_findings[i]!.finding = v; })} />
                </div>
                {editing && <RemoveButton label={`Remove finding ${i + 1}`} onClick={() => update((d) => { d.key_findings.splice(i, 1); })} />}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <Tag tone={f.evidence_quality}>{f.evidence_quality}</Tag>
                {f.flags?.map((fl) => <Tag key={fl}>{fl.replace("_", " ")}</Tag>)}
              </div>
              {(f.caveats || editing) && (
                <div className="mt-2 text-sm text-muted-foreground">
                  <Text editing={editing} value={f.caveats} label={`Caveat for finding ${i + 1}`} onChange={(v) => update((d) => { d.key_findings[i]!.caveats = v; })} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    ),

    subtopics: () => (
      <div className="grid gap-4 md:grid-cols-2">
        {r.subtopics.map((s, i) => (
          <div key={i} className="rounded-md border border-border bg-card p-4">
            <div className="flex items-start gap-1">
              <h3 className="min-w-0 flex-1 text-lg">
                <Text editing={editing} cite={false} value={s.subtopic} label={`Subtopic ${i + 1} title`} onChange={(v) => update((d) => { d.subtopics[i]!.subtopic = v; })} />
              </h3>
              {editing && <RemoveButton label={`Remove subtopic ${i + 1}`} onClick={() => update((d) => { d.subtopics.splice(i, 1); })} />}
            </div>
            <div className="mt-2 text-sm leading-relaxed">
              <Text editing={editing} value={s.summary} label={`Subtopic ${i + 1} summary`} onChange={(v) => update((d) => { d.subtopics[i]!.summary = v; })} />
            </div>
          </div>
        ))}
      </div>
    ),

    comparison: () => (
      <>
        {r.comparison.criteria.length > 0 && <p className="mb-4 text-sm text-muted-foreground">Criteria: {r.comparison.criteria.join(" · ")}</p>}
        <div className="grid gap-4 md:grid-cols-2">
          {r.comparison.options.map((o, i) => (
            <div key={i} className="rounded-md border border-border bg-card p-4 text-sm">
              <div className="flex items-start gap-1">
                <h3 className="min-w-0 flex-1 text-xl">
                  <Text editing={editing} cite={false} value={o.option} label={`Option ${i + 1} name`} onChange={(v) => update((d) => { d.comparison.options[i]!.option = v; })} />
                </h3>
                {editing && <RemoveButton label={`Remove option ${i + 1}`} onClick={() => update((d) => { d.comparison.options.splice(i, 1); })} />}
              </div>
              <div className="mb-1 mt-3 font-mono text-xs uppercase text-strong">Strengths</div>
              <List editing={editing} items={o.strengths} label="Strength" onChange={(v) => update((d) => { d.comparison.options[i]!.strengths = v; })} />
              <div className="mb-1 mt-3 font-mono text-xs uppercase text-weak">Weaknesses</div>
              <List editing={editing} items={o.weaknesses} label="Weakness" onChange={(v) => update((d) => { d.comparison.options[i]!.weaknesses = v; })} />
            </div>
          ))}
        </div>
        {(r.comparison.decision_guidance || editing) && (
          <div className="mt-4 leading-relaxed">
            <Text editing={editing} value={r.comparison.decision_guidance} label="Decision guidance" onChange={(v) => update((d) => { d.comparison.decision_guidance = v; })} />
          </div>
        )}
      </>
    ),

    contradictions: () => (
      <div className="space-y-4">
        {r.contradictions.map((c, i) => (
          <div key={i} className="rounded-md border border-border p-4 text-sm">
            <div className="flex items-start gap-1">
              <div className="min-w-0 flex-1 font-medium">
                <Text editing={editing} cite={false} value={c.issue} label={`Contradiction ${i + 1} issue`} onChange={(v) => update((d) => { d.contradictions[i]!.issue = v; })} />
              </div>
              {editing && <RemoveButton label={`Remove contradiction ${i + 1}`} onClick={() => update((d) => { d.contradictions.splice(i, 1); })} />}
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded bg-muted p-3">
                <span className="font-mono text-xs">A · </span>
                <Text editing={editing} value={c.position_a} label={`Contradiction ${i + 1} position A`} onChange={(v) => update((d) => { d.contradictions[i]!.position_a = v; })} />
              </div>
              <div className="rounded bg-muted p-3">
                <span className="font-mono text-xs">B · </span>
                <Text editing={editing} value={c.position_b} label={`Contradiction ${i + 1} position B`} onChange={(v) => update((d) => { d.contradictions[i]!.position_b = v; })} />
              </div>
            </div>
            <div className="mt-3 text-muted-foreground">
              <em>Likely explanation:</em>{" "}
              <Text editing={editing} cite={false} value={c.likely_explanation} label={`Contradiction ${i + 1} explanation`} onChange={(v) => update((d) => { d.contradictions[i]!.likely_explanation = v; })} />
            </div>
          </div>
        ))}
      </div>
    ),

    // Implications and risks keep their source lists; a newly added item simply has none yet.
    implications: () => (
      <List editing={editing} items={r.implications.map((x) => x.implication)} label="Implication"
        onChange={(v) => update((d) => { d.implications = v.map((implication, i) => ({ implication, source_ids: d.implications[i]?.source_ids ?? [] })); })} />
    ),
    risks: () => (
      <List editing={editing} items={r.risks.map((x) => x.risk)} label="Risk"
        onChange={(v) => update((d) => { d.risks = v.map((risk, i) => ({ risk, source_ids: d.risks[i]?.source_ids ?? [] })); })} />
    ),
    assumptions: () => <List editing={editing} items={r.assumptions} label="Assumption" onChange={(v) => update((d) => { d.assumptions = v; })} />,
    gaps: () => <List editing={editing} items={r.evidence_gaps} label="Evidence gap" onChange={(v) => update((d) => { d.evidence_gaps = v; })} />,
    questions: () => <List editing={editing} items={r.open_questions} label="Open question" onChange={(v) => update((d) => { d.open_questions = v; })} />,

    next: () =>
      editing ? (
        <List editing items={r.recommended_next_searches} label="Next search" onChange={(v) => update((d) => { d.recommended_next_searches = v; })} />
      ) : (
        <ul className="space-y-1">
          {r.recommended_next_searches.map((q, i) => (
            <li key={i}>
              <Link to="/research" search={{ topic: q }} className="group -mx-2 flex items-start justify-between gap-3 px-2 py-2.5 transition-colors hover:bg-muted sm:py-1.5 print:p-0">
                <span>{q}</span>
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 print:hidden [@media(hover:none)]:opacity-100">
                  Research this →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ),

    // Sources are the evidence itself, so they can be moved or hidden but not reworded.
    sources: () => (
      <ol className="space-y-3 text-sm">
        {r.sources_used.map((s) => (
          <li key={s.source_id} id={`src-${s.source_id}`} className="source-row grid scroll-mt-28 grid-cols-[3rem_1fr] gap-2">
            <span className="font-mono text-accent">{s.source_id}</span>
            <div>
              {s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="font-medium underline decoration-border underline-offset-2 hover:decoration-accent">{s.title}</a> : <span className="font-medium">{s.title}</span>}
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{s.publisher_or_domain}</span>
                {s.published_date && <span>· {s.published_date}</span>}
                <span>· {s.source_type}</span>
                <Tag tone={s.credibility_tier === 1 ? "STRONG" : s.credibility_tier === 2 ? "MODERATE" : "WEAK"}>Tier {s.credibility_tier}</Tag>
              </div>
              {s.credibility_note && <p className="mt-1 text-xs text-muted-foreground">{s.credibility_note}</p>}
            </div>
          </li>
        ))}
      </ol>
    ),
  };

  return (
    <>
      <div
        id="section-summary"
        onClick={onEditRequest ? (e) => requestEdit(e, () => onEditRequest("summary")) : undefined}
        className={`group/section mt-6 scroll-mt-28 sm:mt-8 ${editing ? "border border-dashed border-border p-3 sm:p-4" : onEditRequest ? "editable-region" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Tag>{r.mode}</Tag>
          <Tag tone={r.status === "OK" ? "HIGH" : r.status === "PARTIAL" ? "MEDIUM" : "LOW"}>{r.status?.replace("_", " ")}</Tag>
          <Tag tone={r.confidence}>{r.confidence} confidence</Tag>
          <span className="font-mono text-xs text-muted-foreground">{new Date(createdAt).toLocaleDateString()}</span>
          {!editing && onEditRequest && <span className="ml-auto"><EditHint /></span>}
        </div>
        <h1 className="mt-4 text-3xl leading-tight sm:text-4xl md:text-5xl">
          <Text editing={editing} cite={false} value={r.research_title} label="Report title" onChange={(v) => update((d) => { d.research_title = v; })} />
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{topic}</p>

        <div className="mt-8 border-l-2 border-accent pl-5">
          <div className="font-mono text-xs uppercase tracking-widest text-accent">Bottom line</div>
          <div className="mt-2 text-lg leading-relaxed">
            <Text editing={editing} value={r.bottom_line} label="Bottom line" onChange={(v) => update((d) => { d.bottom_line = v; })} />
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            <Text editing={editing} cite={false} value={r.confidence_rationale} label="Confidence rationale" onChange={(v) => update((d) => { d.confidence_rationale = v; })} />
          </div>
        </div>

        {(r.warnings?.length > 0 || editing) && (
          <div className="mt-8 rounded-md border border-weak/40 bg-weak/5 p-4 text-sm">
            <div className="mb-2 font-mono text-xs uppercase text-weak">Warnings</div>
            <List editing={editing} items={r.warnings ?? []} label="Warning" onChange={(v) => update((d) => { d.warnings = v; })} />
          </div>
        )}
      </div>

      <div className="grid gap-x-10 md:grid-cols-2">
        {visible.map((key, i) => (
          <SectionFrame key={key} sectionKey={key} position={i} count={visible.length} editor={editor} onEditRequest={onEditRequest}>
            {body[key]()}
          </SectionFrame>
        ))}
      </div>

      {restorable.length > 0 && (
        <div className="mt-10 border border-dashed border-border p-4 print:hidden">
          <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Hidden sections</div>
          <p className="mt-1 text-xs text-muted-foreground">Left out of the page, the print-out and every export. Nothing is deleted.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {restorable.map((key) => (
              <Button key={key} type="button" variant="outline" size="sm" onClick={() => editor?.show(key)}>
                <Plus /> {SECTION_TITLES[key]}
              </Button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
