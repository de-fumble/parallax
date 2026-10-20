import { MAX_UPLOAD_BYTES } from "./research.types";

// Reads the text out of an uploaded document, in the browser. The file itself
// never leaves the user's machine; only the extracted text is sent with the run.

const FORMATS = {
  txt: "Plain text",
  md: "Markdown",
  markdown: "Markdown",
  pdf: "PDF",
  docx: "Word",
} as const;

type Extension = keyof typeof FORMATS;

/** For the file picker's `accept` attribute. */
export const UPLOAD_ACCEPT = ".txt,.md,.markdown,.pdf,.docx";
export const UPLOAD_FORMATS_LABEL = "PDF, Word (.docx), plain text or Markdown";

function extensionOf(name: string): string {
  return name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
}

export function titleFromFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).replace(/[_-]+/g, " ").trim();
}

function tidy(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fromPdf(data: ArrayBuffer): Promise<string> {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const task = pdfjs.getDocument({ data });
  try {
    const pdf = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const content = await (await pdf.getPage(n)).getTextContent();
      let page = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        page += item.str + (item.hasEOL ? "\n" : " ");
      }
      pages.push(page);
    }
    return pages.join("\n\n");
  } finally {
    void task.destroy();
  }
}

async function fromDocx(data: ArrayBuffer): Promise<string> {
  const mammoth = await import("mammoth/mammoth.browser");
  const { value } = await mammoth.extractRawText({ arrayBuffer: data });
  return value;
}

/** Throws an Error with a message fit to show the user. */
export async function extractText(file: File): Promise<string> {
  const extension = extensionOf(file.name);
  if (!(extension in FORMATS)) {
    throw new Error(
      extension === "doc"
        ? "Older .doc files aren't supported. Save it as .docx and try again."
        : `That file type isn't supported. Use ${UPLOAD_FORMATS_LABEL}.`,
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`It's larger than the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit.`);
  }
  if (file.size === 0) throw new Error("The file is empty.");

  let text: string;
  try {
    const kind = extension as Extension;
    text =
      kind === "pdf" ? await fromPdf(await file.arrayBuffer())
      : kind === "docx" ? await fromDocx(await file.arrayBuffer())
      : await file.text();
  } catch {
    throw new Error("It couldn't be read. The file may be damaged or password-protected.");
  }

  text = tidy(text);
  if (!text) {
    throw new Error(
      extension === "pdf"
        ? "No text was found in it. Scanned PDFs are images of pages and can't be read."
        : "No text was found in it.",
    );
  }
  return text;
}
