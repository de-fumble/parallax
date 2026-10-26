import type { Report } from "./research.types";

// A report's movable sections, and the edits a user can save over the report
// the AI wrote. The original is never overwritten: edits are stored beside it,
// so "reset to original" is always possible.

export const SECTION_KEYS = [
  "template",
  "findings",
  "subtopics",
  "comparison",
  "contradictions",
  "implications",
  "risks",
  "assumptions",
  "gaps",
  "questions",
  "next",
  "sources",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_TITLES: Record<SectionKey, string> = {
  template: "Research report",
  findings: "Key findings",
  subtopics: "Subtopics",
  comparison: "Comparison",
  contradictions: "Contradictions",
  implications: "Implications",
  risks: "Risks",
  assumptions: "Assumptions",
  gaps: "Evidence gaps",
  questions: "Open questions",
  next: "Next searches",
  sources: "Sources",
};

/** Short list sections sit two to a row on wide screens; the rest take the full width. */
export const HALF_WIDTH: ReadonlySet<SectionKey> = new Set(["implications", "risks", "assumptions", "gaps", "questions", "next"]);

export function sectionHasContent(r: Report, key: SectionKey): boolean {
  switch (key) {
    case "template": return (r.template_sections?.length ?? 0) > 0;
    case "findings": return (r.key_findings?.length ?? 0) > 0;
    case "subtopics": return (r.subtopics?.length ?? 0) > 0;
    case "comparison": return !!r.comparison?.applicable;
    case "contradictions": return (r.contradictions?.length ?? 0) > 0;
    case "implications": return (r.implications?.length ?? 0) > 0;
    case "risks": return (r.risks?.length ?? 0) > 0;
    case "assumptions": return (r.assumptions?.length ?? 0) > 0;
    case "gaps": return (r.evidence_gaps?.length ?? 0) > 0;
    case "questions": return (r.open_questions?.length ?? 0) > 0;
    case "next": return (r.recommended_next_searches?.length ?? 0) > 0;
    case "sources": return (r.sources_used?.length ?? 0) > 0;
  }
}

/** What is saved when a user edits a report. */
export type ReportEdits = {
  report: Report;
  /** Section order, top to bottom. */
  layout: SectionKey[];
  /** Sections left out of the page, the print-out and every export. */
  hidden: SectionKey[];
  saved_at: string;
};

const isKey = (value: unknown): value is SectionKey => (SECTION_KEYS as readonly unknown[]).includes(value);

/** A stored order made safe to use: unknown keys dropped, missing sections added at the end. */
export function normalizeLayout(layout: unknown): SectionKey[] {
  const known = Array.isArray(layout) ? [...new Set(layout.filter(isKey))] : [];
  return [...known, ...SECTION_KEYS.filter((k) => !known.includes(k))];
}

export type ReportView = { report: Report; layout: SectionKey[]; hidden: SectionKey[]; isEdited: boolean };

/** The report as it should be shown: the user's edited version if there is one, else the original. */
export function viewOf(detail: { report: Report; edited?: ReportEdits | null | undefined }): ReportView {
  const edits = detail.edited;
  if (!edits?.report) return { report: detail.report, layout: [...SECTION_KEYS], hidden: [], isEdited: false };
  return {
    report: edits.report,
    layout: normalizeLayout(edits.layout),
    hidden: Array.isArray(edits.hidden) ? edits.hidden.filter(isKey) : [],
    isEdited: true,
  };
}
