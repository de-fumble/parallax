import type { ResearchInput } from "./research-run";

// The half-written research form, kept in memory so opening a report and coming
// back doesn't wipe what was typed. Cleared when the run is submitted.

export const EMPTY_DRAFT: ResearchInput = { topic: "", context: "", mode: "MEDIUM", useWeb: true, manual: [] };

let draft: ResearchInput = EMPTY_DRAFT;

export const getDraft = () => draft;

export function saveDraft(next: ResearchInput) {
  draft = next;
}
