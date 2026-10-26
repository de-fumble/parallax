import { SECTION_KEYS, SECTION_TITLES, type SectionKey } from "./report-layout";
import type { Report } from "./research.types";
import { markSvg, type PrintLogo } from "./branding";

// Exports all build on one neutral outline of the report, so the PDF, Word and
// Markdown versions always carry the same content in the same order.

type Block =
  | { type: "paragraph"; text: string; tone?: "lead" | "muted" | undefined }
  | { type: "subheading"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

type Section = { heading: string; blocks: Block[] };

export type ExportDoc = { title: string; topic: string; meta: string; sections: Section[] };

export type ExportSource = {
  topic: string;
  created_at: string;
  report: Report;
  /** Section order and omissions from the user's edits; the default order when absent. */
  layout?: SectionKey[] | undefined;
  hidden?: SectionKey[] | undefined;
};

const label = (value: string) => value.replace(/_/g, " ").toLowerCase();
const sentence = (value: string) => label(value).replace(/^./, (c) => c.toUpperCase());

// The outline holds its own copy of each list. The report object it is built
// from is the one on screen, and a renderer must never be able to alter that.
function list(items: string[] | undefined, ordered = false): Block[] {
  return items?.length ? [{ type: "list", ordered, items: [...items] }] : [];
}

export function buildExportDoc({ topic, created_at, report: r, layout, hidden }: ExportSource): ExportDoc {
  // The opening sections are fixed; the rest are gathered by key and then laid
  // out in the order the user chose.
  const sections: Section[] = [];
  const add = (heading: string, blocks: Block[]) => {
    if (blocks.length) sections.push({ heading, blocks });
  };
  const movable = new Map<SectionKey, Block[]>();
  const put = (key: SectionKey, blocks: Block[]) => {
    if (blocks.length) movable.set(key, blocks);
  };

  add("Bottom line", [
    { type: "paragraph", text: r.bottom_line, tone: "lead" },
    ...(r.confidence_rationale
      ? [{ type: "paragraph" as const, text: `Confidence: ${label(r.confidence)}. ${r.confidence_rationale}`, tone: "muted" as const }]
      : []),
  ]);

  add("Warnings", list(r.warnings));

  put(
    "template",
    (r.template_sections ?? []).flatMap((s): Block[] => [
      { type: "subheading", text: s.title },
      ...s.content
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((text): Block => ({ type: "paragraph", text })),
    ]),
  );

  put(
    "findings",
    (r.key_findings ?? []).flatMap((f, i): Block[] => {
      const notes = [`Evidence: ${label(f.evidence_quality)}`, ...(f.flags ?? []).map(label)].join(" · ");
      return [
        { type: "paragraph", text: `${i + 1}. ${f.finding}` },
        { type: "paragraph", text: f.caveats ? `${notes}. ${f.caveats}` : notes, tone: "muted" },
      ];
    }),
  );

  put(
    "subtopics",
    (r.subtopics ?? []).flatMap((s): Block[] => [
      { type: "subheading", text: s.subtopic },
      { type: "paragraph", text: s.summary },
    ]),
  );

  if (r.comparison?.applicable) {
    put("comparison", [
      ...(r.comparison.criteria.length
        ? [{ type: "paragraph" as const, text: `Criteria: ${r.comparison.criteria.join(", ")}`, tone: "muted" as const }]
        : []),
      ...r.comparison.options.flatMap((o): Block[] => [
        { type: "subheading", text: o.option },
        ...(o.strengths.length ? [{ type: "paragraph" as const, text: "Strengths" }, ...list(o.strengths)] : []),
        ...(o.weaknesses.length ? [{ type: "paragraph" as const, text: "Weaknesses" }, ...list(o.weaknesses)] : []),
      ]),
      ...(r.comparison.decision_guidance
        ? [{ type: "subheading" as const, text: "Decision guidance" }, { type: "paragraph" as const, text: r.comparison.decision_guidance }]
        : []),
    ]);
  }

  put(
    "contradictions",
    (r.contradictions ?? []).flatMap((c): Block[] => [
      { type: "subheading", text: c.issue },
      { type: "paragraph", text: `Position A: ${c.position_a}` },
      { type: "paragraph", text: `Position B: ${c.position_b}` },
      { type: "paragraph", text: `Likely explanation: ${c.likely_explanation}`, tone: "muted" },
    ]),
  );

  put("implications", list(r.implications?.map((x) => x.implication)));
  put("risks", list(r.risks?.map((x) => x.risk)));
  put("assumptions", list(r.assumptions));
  put("gaps", list(r.evidence_gaps));
  put("questions", list(r.open_questions));
  put("next", list(r.recommended_next_searches));

  put(
    "sources",
    list(
      r.sources_used?.map((s) =>
        [
          `[${s.source_id}] ${s.title}`,
          [s.publisher_or_domain, s.published_date, s.source_type, `Tier ${s.credibility_tier}`].filter(Boolean).join(", "),
          s.url,
        ]
          .filter(Boolean)
          .join(" — "),
      ),
    ),
  );

  for (const key of layout ?? SECTION_KEYS) {
    const blocks = movable.get(key);
    if (blocks && !hidden?.includes(key)) sections.push({ heading: SECTION_TITLES[key], blocks });
  }

  const date = new Date(created_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  return {
    title: r.research_title || topic,
    topic,
    meta: [`${sentence(r.mode)} depth`, sentence(r.status), `${sentence(r.confidence)} confidence`, date].join(" · "),
    sections,
  };
}

export function toMarkdown(doc: ExportDoc): string {
  const out: string[] = [`# ${doc.title}`, "", `> ${doc.topic}`, "", `_${doc.meta}_`, ""];
  for (const section of doc.sections) {
    out.push(`## ${section.heading}`, "");
    for (const block of section.blocks) {
      if (block.type === "subheading") out.push(`### ${block.text}`, "");
      else if (block.type === "paragraph") out.push(block.tone === "muted" ? `_${block.text}_` : block.text, "");
      else out.push(...block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : "-"} ${item}`), "");
    }
  }
  out.push("---", "", "Generated by Parallax. Bracketed IDs such as [S1] refer to the sources listed above.", "");
  return out.join("\n");
}

const SOURCE_KEY = "Bracketed IDs such as [S1] refer to the sources listed at the end.";
const FOOTNOTE = `Generated by Parallax. ${SOURCE_KEY}`;
const INK = "#231f20";
const GREY = "#6b6b6b";

// The Parallax mark, for documents from the personal workspace or an unbranded organization.
const MARK_SVG = markSvg(INK);

// The PDF and Word libraries are large, so each is loaded only when that export is used.

async function toPdf(doc: ExportDoc, logo: PrintLogo | null): Promise<Blob> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  const engine = pdfMake as unknown as {
    addVirtualFileSystem: (vfs: unknown) => void;
    createPdf: (def: unknown) => { getBlob: (cb?: (blob: Blob) => void) => Promise<Blob> | void };
  };
  engine.addVirtualFileSystem(fonts);

  const content: unknown[] = [
    // An organization's logo, in its two tones; otherwise the Parallax mark.
    logo ? { image: logo.dataUrl, fit: [150, 56], margin: [0, 0, 0, 16] } : { svg: MARK_SVG, width: 44, margin: [0, 0, 0, 16] },
    { text: doc.title, style: "title" },
    { text: doc.topic, style: "topic" },
    { text: doc.meta, style: "meta" },
    { canvas: [{ type: "line", x1: 0, y1: 0, x2: 483, y2: 0, lineWidth: 1, lineColor: INK }], margin: [0, 10, 0, 6] },
  ];
  for (const section of doc.sections) {
    // Keep a heading with the block that follows it instead of stranding it at a page foot.
    content.push({ text: section.heading, style: "heading", headlineLevel: 1 });
    for (const block of section.blocks) {
      if (block.type === "subheading") content.push({ text: block.text, style: "subheading" });
      else if (block.type === "paragraph") content.push({ text: block.text, style: block.tone ?? "body" });
      // pdfmake rewrites the arrays it is given in place, turning each string
      // into a layout object, so it only ever gets a throwaway copy.
      else content.push({ [block.ordered ? "ol" : "ul"]: [...block.items], style: "list" });
    }
  }

  const pdf = engine.createPdf({
    info: { title: doc.title, subject: doc.topic, creator: "Parallax" },
    pageSize: "A4",
    pageMargins: [56, 60, 56, 64],
    content,
    footer: (page: number, pages: number) => ({
      columns: [
        { text: SOURCE_KEY, alignment: "left" },
        { text: `${page} / ${pages}`, alignment: "right", width: 50 },
      ],
      margin: [56, 24, 56, 0],
      fontSize: 7.5,
      color: GREY,
    }),
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.35, color: INK },
    styles: {
      title: { fontSize: 24, bold: true, lineHeight: 1.15 },
      topic: { fontSize: 11, color: GREY, margin: [0, 6, 0, 0] },
      meta: { fontSize: 9, color: GREY, margin: [0, 6, 0, 0] },
      heading: { fontSize: 15, bold: true, margin: [0, 18, 0, 6] },
      subheading: { fontSize: 11.5, bold: true, margin: [0, 8, 0, 3] },
      body: { margin: [0, 0, 0, 6] },
      lead: { fontSize: 12, margin: [0, 0, 0, 6] },
      muted: { fontSize: 9.5, color: GREY, margin: [0, 0, 0, 8] },
      list: { margin: [0, 0, 0, 6] },
    },
  });

  return new Promise<Blob>((resolve, reject) => {
    const pending = pdf.getBlob(resolve);
    if (pending) pending.then(resolve, reject);
  });
}

async function toDocx(doc: ExportDoc, logo: PrintLogo | null): Promise<Blob> {
  const { Document, HeadingLevel, ImageRun, Packer, Paragraph, TextRun } = await import("docx");
  const grey = GREY.slice(1);

  const children = [
    ...(logo
      ? [
          new Paragraph({
            spacing: { after: 240 },
            children: [
              new ImageRun({
                type: "png",
                data: Uint8Array.from(atob(logo.dataUrl.split(",")[1] ?? ""), (c) => c.charCodeAt(0)),
                // At most 200 × 75 pixels, keeping the logo's proportions.
                transformation: { width: Math.round(logo.width * Math.min(200 / logo.width, 75 / logo.height)), height: Math.round(logo.height * Math.min(200 / logo.width, 75 / logo.height)) },
              }),
            ],
          }),
        ]
      : []),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(doc.title)] }),
    new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: doc.topic, color: grey })] }),
    new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: doc.meta, color: grey, size: 18 })] }),
  ];
  for (const section of doc.sections) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, keepNext: true, children: [new TextRun(section.heading)] }));
    for (const block of section.blocks) {
      if (block.type === "subheading") {
        children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, keepNext: true, children: [new TextRun(block.text)] }));
      } else if (block.type === "paragraph") {
        const muted = block.tone === "muted";
        children.push(
          new Paragraph({
            spacing: { after: 140 },
            children: [new TextRun({ text: block.text, ...(muted ? { color: grey, size: 19 } : {}), ...(block.tone === "lead" ? { size: 24 } : {}) })],
          }),
        );
      } else {
        block.items.forEach((item, i) =>
          children.push(
            block.ordered
              ? new Paragraph({ spacing: { after: 80 }, indent: { left: 360 }, children: [new TextRun(`${i + 1}. ${item}`)] })
              : new Paragraph({ spacing: { after: 80 }, bullet: { level: 0 }, children: [new TextRun(item)] }),
          ),
        );
      }
    }
  }
  children.push(new Paragraph({ spacing: { before: 360 }, children: [new TextRun({ text: FOOTNOTE, color: grey, size: 16 })] }));

  const file = new Document({
    creator: "Parallax",
    title: doc.title,
    description: doc.topic,
    styles: { default: { document: { run: { font: "Calibri", size: 22, color: INK.slice(1) } } } },
    sections: [{ children }],
  });
  return Packer.toBlob(file);
}

export type ExportFormat = "pdf" | "docx" | "md" | "json";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: "pdf", label: "PDF", hint: ".pdf" },
  { id: "docx", label: "Word document", hint: ".docx" },
  { id: "md", label: "Markdown", hint: ".md" },
  { id: "json", label: "Raw data", hint: ".json" },
];

function fileName(title: string, extension: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `parallax-${slug || "report"}.${extension}`;
}

export function parseSectionBodyToBlocks(body: string, isLead = false): Block[] {
  const blocks: Block[] = [];
  const paragraphs = body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  let firstPara = true;
  for (const para of paragraphs) {
    const rawLines = para.split("\n").map((l) => l.trim()).filter(Boolean);
    let currentList: { ordered: boolean; items: string[] } | null = null;
    let currentParaLines: string[] = [];

    const flushList = () => {
      if (currentList && currentList.items.length > 0) {
        blocks.push({ type: "list", ordered: currentList.ordered, items: [...currentList.items] });
        currentList = null;
      }
    };

    const flushPara = () => {
      if (currentParaLines.length > 0) {
        const text = currentParaLines.join(" ");
        const isMuted = text.startsWith("_") && text.endsWith("_");
        const clean = isMuted ? text.slice(1, -1) : text;
        blocks.push({
          type: "paragraph",
          text: clean,
          tone: firstPara && isLead ? "lead" : isMuted ? "muted" : undefined,
        });
        firstPara = false;
        currentParaLines = [];
      }
    };

    for (const line of rawLines) {
      if (/^#{1,4}\s+/.test(line)) {
        flushList();
        flushPara();
        blocks.push({ type: "subheading", text: line.replace(/^#{1,4}\s+/, "") });
      } else if (/^[-*•]\s+/.test(line)) {
        flushPara();
        const item = line.replace(/^[-*•]\s+/, "");
        if (currentList && !currentList.ordered) {
          currentList.items.push(item);
        } else {
          flushList();
          currentList = { ordered: false, items: [item] };
        }
      } else if (/^\d+[.)]\s+/.test(line)) {
        flushPara();
        const item = line.replace(/^\d+[.)]\s+/, "");
        if (currentList && currentList.ordered) {
          currentList.items.push(item);
        } else {
          flushList();
          currentList = { ordered: true, items: [item] };
        }
      } else {
        flushList();
        currentParaLines.push(line);
      }
    }

    flushList();
    flushPara();
  }

  return blocks;
}

export function buildExportDocFromSections(params: {
  title: string;
  kind?: string | undefined;
  topic?: string | undefined;
  meta: string;
  sections: { title: string; body: string }[];
}): ExportDoc {
  const exportSections: Section[] = [];
  for (const s of params.sections) {
    const isLead = /^(summary|bottom line|executive summary)/i.test(s.title);
    const blocks = parseSectionBodyToBlocks(s.body, isLead);
    if (blocks.length > 0) {
      exportSections.push({ heading: s.title, blocks });
    }
  }

  if (exportSections.length === 0) {
    exportSections.push({
      heading: "Overview",
      blocks: [{ type: "paragraph", text: "No content available." }],
    });
  }

  return {
    title: params.title,
    topic: params.topic || (params.kind ? `${params.kind} · Organization Library` : "Filed Organization Document"),
    meta: params.meta,
    sections: exportSections,
  };
}

export async function exportDoc(
  doc: ExportDoc,
  format: ExportFormat,
  logo: PrintLogo | null = null,
  rawJsonFallback?: unknown,
) {
  const blob =
    format === "pdf"
      ? await toPdf(doc, logo)
      : format === "docx"
        ? await toDocx(doc, logo)
        : format === "md"
          ? new Blob([toMarkdown(doc)], { type: "text/markdown" })
          : new Blob([JSON.stringify(rawJsonFallback ?? doc, null, 2)], { type: "application/json" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName(doc.title, format);
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** `logo` is the organization's print logo, already in its colours; null prints the Parallax mark (PDF) or none (Word). */
export async function exportReport(source: ExportSource, format: ExportFormat, logo: PrintLogo | null = null) {
  const doc = buildExportDoc(source);
  return exportDoc(doc, format, logo, source.report);
}

export async function exportFiledDocument(
  params: {
    title: string;
    kind?: string | undefined;
    topic?: string | undefined;
    meta: string;
    sections: { title: string; body: string }[];
  },
  format: ExportFormat = "pdf",
  logo: PrintLogo | null = null,
) {
  const doc = buildExportDocFromSections(params);
  return exportDoc(doc, format, logo);
}
