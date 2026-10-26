export type Mode = "LIGHT" | "MEDIUM" | "DEEP";

/** The professional research structure a user can switch on, and the sections it follows. */
export type ResearchTemplate = { enabled: boolean; sections: string[] };

/** A standard professional report layout. Users can add to it or remove from it. */
export const DEFAULT_TEMPLATE_SECTIONS = [
  "Executive summary",
  "Introduction and background",
  "Research questions and objectives",
  "Methodology",
  "Findings",
  "Analysis and discussion",
  "Limitations",
  "Conclusions",
  "Recommendations",
];
export const MAX_TEMPLATE_SECTIONS = 20;
export const MAX_TEMPLATE_SECTION_TITLE = 80;

export type ManualSource = {
  title: string;
  url: string;
  text: string;
  /** Set when the text was extracted from an uploaded document. */
  fileName?: string | undefined;
};

export type RetrievedSource = {
  source_id: string;
  title: string;
  url: string;
  publisher_or_domain: string;
  published_date: string | null;
  source_type: string;
  extracted_text: string;
};

export type Report = {
  research_title: string;
  mode: Mode;
  /** Present only when the professional research structure was switched on. */
  template_sections?: { title: string; content: string; source_ids: string[] }[];
  status: "OK" | "PARTIAL" | "INSUFFICIENT_EVIDENCE";
  bottom_line: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  confidence_rationale: string;
  key_findings: {
    finding: string;
    supporting_source_ids: string[];
    evidence_quality: "STRONG" | "MODERATE" | "WEAK";
    flags: string[];
    caveats: string;
  }[];
  subtopics: { subtopic: string; summary: string; source_ids: string[] }[];
  implications: { implication: string; source_ids: string[] }[];
  risks: { risk: string; source_ids: string[] }[];
  comparison: {
    applicable: boolean;
    criteria: string[];
    options: { option: string; strengths: string[]; weaknesses: string[]; evidence_source_ids: string[] }[];
    decision_guidance: string;
  };
  contradictions: {
    issue: string;
    position_a: string;
    position_b: string;
    source_ids_a: string[];
    source_ids_b: string[];
    likely_explanation: string;
  }[];
  assumptions: string[];
  evidence_gaps: string[];
  open_questions: string[];
  recommended_next_searches: string[];
  warnings: string[];
  sources_used: {
    source_id: string;
    title: string;
    url: string;
    publisher_or_domain: string;
    published_date: string | null;
    source_type: string;
    credibility_tier: 1 | 2 | 3;
    credibility_note: string;
  }[];
};

// Limits on the sources a user supplies themselves. One definition, used by the
// form, the server's validation and the report writer, so what the page
// promises is exactly what gets read.
export const MAX_MANUAL_SOURCES = 20;
/** Characters read from any one source; a longer document is cut off here. */
export const MAX_MANUAL_SOURCE_CHARS = 50_000;
/** Characters across all of a run's own sources together. */
export const MAX_MANUAL_TOTAL_CHARS = 200_000;
/** Largest document that can be uploaded. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

// A run with no change for this long is treated as dead (server restarted, request killed).
export const RUN_STALE_AFTER_MS = 10 * 60 * 1000;

// When the AI provider fails, the run waits and tries again: one step after the
// first failure, two after the second, and so on. After MAX_AUTO_RETRIES it
// stops and waits for the user. With the default step that is 1, 2, … 10 minutes.
export const MAX_AUTO_RETRIES = 10;

/** What a request to start or resume a run reports back. The run's row holds the detail. */
export type RunResult =
  /** draftId is set when the run was started for a project and its draft was created. */
  | { status: "done"; id: string; created_at: string; report: Report; draftId?: string | null }
  | { status: "waiting" | "paused" | "error" }
  /** Another tab, request or the background worker already picked the run up. */
  | { status: "busy" };
