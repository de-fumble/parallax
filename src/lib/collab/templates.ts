import type { Report } from "@/lib/research.types";
import type { DocumentKind, Section } from "./db";

// Starting points for a new document: a set of empty sections for each kind,
// or the sections of a Parallax research report.

const blank = (...titles: string[]): Section[] => titles.map((title) => ({ title, body: "" }));

export const TEMPLATES: Record<DocumentKind, Section[]> = {
  Report: blank("Summary", "Key findings", "Evidence gaps", "Recommendations", "Sources"),
  "Literature review": blank("Summary", "Scope and method", "Findings", "Evidence gaps", "Sources"),
  Procedure: blank("Purpose", "Scope", "Safety", "Procedure", "Training required", "References"),
  "Data note": blank("Summary", "Data source", "Method", "Findings", "Limitations"),
  Proposal: blank("Summary", "Background", "Proposal", "Costs and resources", "Next steps"),
};

const lines = (items: (string | undefined)[] | undefined, numbered = false) =>
  (items ?? []).filter(Boolean).map((x, i) => (numbered ? `${i + 1}. ${x}` : `- ${x}`)).join("\n");

/** A Parallax report as document sections, citations kept as written. */
export function reportToSections(r: Report): Section[] {
  const sections: Section[] = [
    { title: "Summary", body: [r.bottom_line, r.confidence_rationale && `Confidence: ${r.confidence.toLowerCase()}. ${r.confidence_rationale}`].filter(Boolean).join("\n\n") },
    { title: "Key findings", body: lines(r.key_findings?.map((f) => f.finding), true) },
    ...(r.subtopics ?? []).map((s) => ({ title: s.subtopic, body: s.summary })),
    { title: "Implications", body: lines(r.implications?.map((x) => x.implication)) },
    { title: "Risks", body: lines(r.risks?.map((x) => x.risk)) },
    { title: "Evidence gaps", body: lines(r.evidence_gaps) },
    { title: "Open questions", body: lines(r.open_questions) },
    {
      title: "Sources",
      body: (r.sources_used ?? []).map((s) => `[${s.source_id}] ${s.title}. ${s.publisher_or_domain}${s.published_date ? `, ${s.published_date}` : ""}. ${s.url}`.trim()).join("\n"),
    },
  ];
  // Section titles identify sections across versions, so they must be unique.
  const seen = new Set<string>();
  return sections.filter((s) => s.body.trim() && !seen.has(s.title) && seen.add(s.title));
}
