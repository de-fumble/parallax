import type { Section } from "./db";

// Section-by-section comparison of two versions of a document, for the
// "Changes" view: which sections were added, removed or changed, and within a
// changed section, which sentences.

export type DiffLine = { kind: "same" | "add" | "remove"; text: string };
export type SectionDiff = { title: string; kind: "added" | "removed" | "changed" | "same"; lines: DiffLine[] };

/** Break text into sentences (and lines), the unit a reader notices changing. */
function pieces(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z0-9["“(])/))
    .map((p) => p.trim())
    .filter(Boolean);
}

/** A longest-common-subsequence diff of two lists of sentences. */
export function diffText(before: string, after: string): DiffLine[] {
  const a = pieces(before);
  const b = pieces(after);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ kind: "remove", text: a[i++]! });
    } else {
      out.push({ kind: "add", text: b[j++]! });
    }
  }
  while (i < n) out.push({ kind: "remove", text: a[i++]! });
  while (j < m) out.push({ kind: "add", text: b[j++]! });
  return out;
}

/** Compare two versions, section by section, in the order of the newer one. */
export function diffSections(before: Section[], after: Section[]): SectionDiff[] {
  const old = new Map(before.map((s) => [s.title, s.body]));
  const seen = new Set<string>();
  const out: SectionDiff[] = after.map((s) => {
    seen.add(s.title);
    const prior = old.get(s.title);
    if (prior === undefined) return { title: s.title, kind: "added", lines: pieces(s.body).map((text) => ({ kind: "add", text })) };
    if (prior === s.body) return { title: s.title, kind: "same", lines: pieces(s.body).map((text) => ({ kind: "same", text })) };
    return { title: s.title, kind: "changed", lines: diffText(prior, s.body) };
  });
  for (const s of before) {
    if (!seen.has(s.title)) out.push({ title: s.title, kind: "removed", lines: pieces(s.body).map((text) => ({ kind: "remove", text })) });
  }
  return out;
}

/** Sentences added and removed, for the "+12 −3" summary on a revision. */
export function countChanges(before: Section[], after: Section[]) {
  let added = 0;
  let removed = 0;
  for (const s of diffSections(before, after)) {
    for (const l of s.lines) {
      if (l.kind === "add") added++;
      else if (l.kind === "remove") removed++;
    }
  }
  return { added, removed };
}
