import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { AlignLeft, ArrowRight, ArrowUp, ClipboardPaste, FileText, Globe, Loader2, Paperclip, Plus, RotateCcw, X } from "lucide-react";
import {
  DEFAULT_TEMPLATE_SECTIONS,
  MAX_MANUAL_SOURCE_CHARS,
  MAX_TEMPLATE_SECTION_TITLE,
  MAX_TEMPLATE_SECTIONS,
  MAX_MANUAL_SOURCES,
  MAX_MANUAL_TOTAL_CHARS,
  MAX_UPLOAD_BYTES,
  type ManualSource,
  type Mode,
} from "@/lib/research.types";
import { extractText, titleFromFileName, UPLOAD_ACCEPT, UPLOAD_FORMATS_LABEL } from "@/lib/extract-text";
import { isInFlight, MAX_AUTO_RETRIES, useResearchActions, useResearchRun } from "@/lib/research-run";
import { EMPTY_DRAFT, getDraft, saveDraft } from "@/lib/research-draft";
import { useWorkspace } from "@/hooks/use-workspace";
import { projectsQuery } from "@/lib/collab/db";
import { ResearchProgress } from "@/components/ResearchProgress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

// Lets other pages open the form pre-filled: "Run again" on a report, or a
// suggested follow-up search.
const Search = z.object({
  topic: z.string().max(1000).optional(),
  context: z.string().max(4000).optional(),
  mode: z.enum(["LIGHT", "MEDIUM", "DEEP"]).optional(),
  // "Research it with Parallax" from a project: draft the result there.
  project: z.string().uuid().optional(),
});

const DRAFT_KINDS = ["Report", "Literature review", "Procedure", "Data note", "Proposal"] as const;

export const Route = createFileRoute("/_workspace/research")({
  validateSearch: (search) => Search.parse(search),
  head: () => ({
    meta: [
      { title: "New research — Parallax" },
      { name: "description", content: "Research any topic from web and your own sources, with every claim cited and every gap flagged." },
    ],
  }),
  component: Research,
});

// Web results fetched per depth; mirrors RESULTS_BY_MODE on the server.
const MODES: { id: Mode; label: string; hint: string; sources: number }[] = [
  { id: "LIGHT", label: "Light", hint: "A quick scan", sources: 6 },
  { id: "MEDIUM", label: "Medium", hint: "A balanced report", sources: 12 },
  { id: "DEEP", label: "Deep", hint: "The fullest report", sources: 20 },
];

const EXAMPLES = [
  "Is sodium-ion battery storage ready for grid deployment?",
  "How do heat pumps compare with gas boilers on lifetime cost?",
  "What does the evidence say about four-day work weeks and productivity?",
];

// What the form tracks about an uploaded document beyond what is sent with the run.
type FormSource = ManualSource & { originalChars?: number; fileSize?: number };

// The user's own version of the professional structure is remembered in this browser.
const SECTIONS_KEY = "parallax.template.sections";
function loadSections(): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "null") as unknown;
    if (Array.isArray(saved) && saved.every((s) => typeof s === "string")) return saved.slice(0, MAX_TEMPLATE_SECTIONS);
  } catch {
    // Storage unavailable or corrupt: use the standard structure.
  }
  return [...DEFAULT_TEMPLATE_SECTIONS];
}

// A toolbar control in the composer: quiet until it's on.
const tool = (on: boolean) =>
  `inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 ${
    on ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
  }`;

const fieldSelect = "h-9 rounded-lg border border-input bg-background px-3 text-sm shadow-[var(--shadow-soft)]";

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function Research() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const run = useResearchRun();
  const { start, resume, dismiss } = useResearchActions();
  const workspace = useWorkspace();
  // Inside an organization, the finished report can become a draft in one of its projects.
  const projects = useQuery({ ...projectsQuery(workspace.orgId ?? ""), enabled: !!workspace.orgId, retry: false });
  const [draftProject, setDraftProject] = useState("");
  const [draftKind, setDraftKind] = useState<(typeof DRAFT_KINDS)[number]>("Report");
  const targetProject = workspace.org ? projects.data?.find((p) => p.id === draftProject) : undefined;

  const [topic, setTopic] = useState(() => getDraft().topic);
  const [context, setContext] = useState(() => getDraft().context);
  const [mode, setMode] = useState<Mode>(() => getDraft().mode);
  const [useWeb, setUseWeb] = useState(() => getDraft().useWeb);
  const [templateOn, setTemplateOn] = useState(() => getDraft().template?.enabled ?? false);
  const [sections, setSections] = useState<string[]>(() => getDraft().template?.sections ?? loadSections());
  const [newSection, setNewSection] = useState("");
  const [manual, setManual] = useState<FormSource[]>(() => getDraft().manual);
  const [reading, setReading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [showContext, setShowContext] = useState(() => !!getDraft().context);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveDraft({ topic, context, mode, useWeb, template: { enabled: templateOn, sections }, manual });
  }, [topic, context, mode, useWeb, templateOn, sections, manual]);

  useEffect(() => {
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(sections));
    } catch {
      // Not remembered; still works for this visit.
    }
  }, [sections]);

  function addSection() {
    const title = newSection.replace(/\s+/g, " ").trim().slice(0, MAX_TEMPLATE_SECTION_TITLE);
    if (!title) return;
    if (sections.some((s) => s.toLowerCase() === title.toLowerCase())) {
      toast.error("That section is already in the structure.");
      return;
    }
    if (sections.length >= MAX_TEMPLATE_SECTIONS) {
      toast.error(`A structure can have up to ${MAX_TEMPLATE_SECTIONS} sections.`);
      return;
    }
    setSections([...sections, title]);
    setNewSection("");
  }

  // A pre-filled link replaces the form once, then leaves the URL clean so a
  // reload doesn't overwrite later edits.
  useEffect(() => {
    if (search.topic === undefined && search.project === undefined) return;
    if (search.topic !== undefined) {
      setTopic(search.topic);
      setContext(search.context ?? "");
      if (search.context) setShowContext(true);
    }
    if (search.mode) setMode(search.mode);
    if (search.project) setDraftProject(search.project);
    // No cross-fade: this only tidies the URL, and it would cut off the page's own transition.
    navigate({ to: "/research", search: {}, replace: true, viewTransition: false });
  }, [search, navigate]);

  // After a failed run, refill an empty form with what was submitted so nothing
  // has to be retyped — including after a reload, when the run arrives late.
  const failedInput = run.status === "error" ? run.input : undefined;
  const refilled = useRef(false);
  useEffect(() => {
    if (!failedInput) {
      refilled.current = false;
      return;
    }
    // Once per failure, and never over something already typed.
    if (refilled.current) return;
    refilled.current = true;
    if (topic) return;
    setTopic(failedInput.topic);
    setContext(failedInput.context);
    if (failedInput.context) setShowContext(true);
    setMode(failedInput.mode);
    setUseWeb(failedInput.useWeb);
    if (failedInput.template) {
      setTemplateOn(failedInput.template.enabled);
      setSections(failedInput.template.sections);
    }
    setManual(failedInput.manual);
  }, [failedInput, topic]);

  // Text restored from an older draft can exceed the limit the field enforces while typing.
  const usableSources = manual
    .filter((m) => m.text.trim())
    .map((m) => ({ ...m, text: m.text.slice(0, MAX_MANUAL_SOURCE_CHARS) }));
  const selected = MODES.find((m) => m.id === mode) ?? MODES[1]!;
  const totalChars = usableSources.reduce((sum, m) => sum + m.text.length, 0);
  const overTotal = totalChars > MAX_MANUAL_TOTAL_CHARS;

  // Documents are read here in the browser; only their text travels with the run.
  async function addFiles(files: File[]) {
    if (files.length === 0) return;
    const room = MAX_MANUAL_SOURCES - manual.length;
    if (room <= 0) {
      toast.error(`You already have ${MAX_MANUAL_SOURCES} sources, which is the most a run can take.`);
      return;
    }
    if (files.length > room) {
      toast.warning(`Only ${room} more ${room === 1 ? "source fits" : "sources fit"}`, {
        description: `A run takes up to ${MAX_MANUAL_SOURCES}. The other ${files.length - room} were skipped.`,
      });
    }
    const accepted = files.slice(0, room);
    setReading((n) => n + accepted.length);
    for (const file of accepted) {
      try {
        const text = await extractText(file);
        const source: FormSource = {
          title: titleFromFileName(file.name).slice(0, 300),
          url: "",
          text: text.slice(0, MAX_MANUAL_SOURCE_CHARS),
          fileName: file.name.slice(0, 300),
          originalChars: text.length,
          fileSize: file.size,
        };
        setManual((current) => (current.length < MAX_MANUAL_SOURCES ? [...current, source] : current));
      } catch (err) {
        toast.error(`Couldn't add ${file.name}`, { description: err instanceof Error ? err.message : undefined });
      } finally {
        setReading((n) => n - 1);
      }
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reading > 0) {
      toast.error("Still reading your documents. Try again in a moment.");
      return;
    }
    if (templateOn && sections.length === 0) {
      toast.error("Add at least one section, or turn the professional structure off.");
      return;
    }
    if (!useWeb && usableSources.length === 0) {
      toast.error("Turn on web search or add at least one source.");
      return;
    }
    if (overTotal) {
      toast.error("Your sources are over the total text limit", {
        description: `Remove a source to get under ${MAX_MANUAL_TOTAL_CHARS.toLocaleString()} characters.`,
      });
      return;
    }
    void start({
      orgId: workspace.orgId,
      draftProjectId: targetProject?.id ?? null,
      draftKind,
      topic,
      context,
      mode,
      useWeb,
      template: templateOn ? { enabled: true, sections } : null,
      manual: usableSources.map(({ title, url, text, fileName }) => ({ title, url, text, ...(fileName ? { fileName } : {}) })),
    });
    saveDraft(EMPTY_DRAFT);
  }

  const updateSource = (index: number, patch: Partial<FormSource>) =>
    setManual(manual.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  const sourcesUsed = usableSources.length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-8 sm:px-6 sm:pt-14 lg:pt-20">
      {isInFlight(run) ? (
        <ResearchProgress run={run} />
      ) : (
        <div className="animate-in fade-in duration-300">
          {run.status === "done" && (
            <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-strong/25 bg-strong/[0.06] px-4 py-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex min-w-0 items-center gap-3">
                <span aria-hidden className="size-2 shrink-0 rounded-full bg-strong" />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">{run.draftId ? "Your draft is ready" : "Your report is ready"}</div>
                  <div className="truncate text-xs text-muted-foreground">{run.input.topic}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {run.draftId && (
                  <Button asChild size="sm">
                    <Link to="/org/drafts/$draftId" params={{ draftId: run.draftId }}>Open draft <ArrowRight /></Link>
                  </Button>
                )}
                <Button asChild size="sm" variant={run.draftId ? "outline" : "default"}>
                  <Link to="/reports/$id" params={{ id: run.reportId }}>
                    Open report {!run.draftId && <ArrowRight />}
                  </Link>
                </Button>
              </div>
            </div>
          )}
          {run.status === "paused" && (
            <div className="mb-8 rounded-xl border border-moderate/40 bg-moderate/[0.08] p-4 animate-in fade-in slide-in-from-bottom-2 duration-300 sm:p-5">
              <div className="text-[13px] font-medium">Research paused</div>
              <div className="mt-1 text-base font-semibold tracking-tight">{run.input.topic}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                The AI provider didn't respond after {MAX_AUTO_RETRIES} tries. Your {run.sources.length}{" "}
                {run.sources.length === 1 ? "source is" : "sources are"} saved, so retrying goes straight to writing.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void resume(true)}>Retry now</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void dismiss()}>Discard</Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Last response: {run.reason}</p>
            </div>
          )}
          {run.status === "error" && (
            <div role="alert" className="mb-8 flex items-start justify-between gap-3 rounded-xl border border-weak/30 bg-weak/[0.05] p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <div className="text-[13px] font-medium text-weak">Research didn't finish</div>
                <div className="mt-1 text-sm">{run.error}</div>
                <div className="mt-1 text-xs text-muted-foreground">Your question is still below. Adjust it or run it again.</div>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Dismiss" onClick={() => void dismiss()}>
                <X />
              </Button>
            </div>
          )}

          <header className="text-center">
            <h1 className="text-[1.75rem] leading-tight sm:text-[2.5rem]">What do you want to know?</h1>
            <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-muted-foreground">
              {workspace.org ? `Research for ${workspace.name}. ` : ""}Parallax reads the sources and cites every claim.
            </p>
          </header>

          <form
            onSubmit={submit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.requestSubmit();
            }}
            className="mt-8 sm:mt-10"
          >
            {/* The composer: the question, then everything that shapes the answer in one toolbar. */}
            <div
              data-tour="question"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }}
              onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(Array.from(e.dataTransfer.files)); }}
              className={`rounded-2xl border bg-card shadow-[var(--shadow-float)] transition-[border-color,box-shadow] duration-200 focus-within:border-ring/40 ${
                dragging ? "border-foreground/50 ring-4 ring-foreground/[0.06]" : "border-border"
              }`}
            >
              <Label htmlFor="topic" className="sr-only">Your question</Label>
              <Textarea
                id="topic"
                required
                minLength={3}
                maxLength={1000}
                rows={3}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder={dragging ? "Drop documents to add them as sources" : "Ask a question or describe what to investigate…"}
                style={{ fieldSizing: "content" } as React.CSSProperties}
                className="max-h-80 min-h-28 resize-none rounded-2xl border-0 bg-transparent px-5 pt-5 text-[17px] leading-relaxed shadow-none md:text-[17px] placeholder:text-muted-foreground/70 focus-visible:ring-0 max-md:border-0 max-md:bg-transparent max-md:px-5 max-md:pt-5 max-md:focus-visible:ring-0"
              />
              {showContext && (
                <div className="px-5 pb-1 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Label htmlFor="ctx" className="sr-only">Context</Label>
                  <Textarea
                    id="ctx"
                    rows={2}
                    maxLength={4000}
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="Context: who it's for, region, timeframe, or the decision you're facing"
                    style={{ fieldSizing: "content" } as React.CSSProperties}
                    className="min-h-12 resize-none rounded-lg border-0 bg-muted/60 px-3 py-2.5 text-sm leading-relaxed shadow-none focus-visible:ring-0 max-md:border-0 max-md:px-3 max-md:py-2.5 max-md:focus-visible:ring-0"
                  />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1 px-3 pb-3 pt-2">
                <div data-tour="sources" className="flex items-center gap-1">
                  <button type="button" onClick={() => fileInput.current?.click()} disabled={manual.length >= MAX_MANUAL_SOURCES} className={tool(false)} title={`${UPLOAD_FORMATS_LABEL}, up to ${MAX_UPLOAD_BYTES / 1024 / 1024} MB each`}>
                    <Paperclip /> <span className="hidden sm:inline">Files</span>
                    {manual.length > 0 && <span className="tabular-nums text-foreground">{manual.length}</span>}
                  </button>
                  <button type="button" role="switch" aria-checked={useWeb} onClick={() => setUseWeb(!useWeb)} className={tool(useWeb)} title={useWeb ? "Searching the web" : "Web search off: only your sources"}>
                    <Globe /> Web
                  </button>
                  <button type="button" onClick={() => setManual([...manual, { title: "", url: "", text: "" }])} disabled={manual.length >= MAX_MANUAL_SOURCES} className={tool(false)} title="Paste text as a source">
                    <ClipboardPaste /> <span className="hidden sm:inline">Paste</span>
                  </button>
                </div>
                <button type="button" onClick={() => setShowContext(!showContext)} className={tool(showContext)} aria-expanded={showContext}>
                  <AlignLeft /> <span className="hidden sm:inline">Context</span>
                </button>

                <div className="ml-auto flex items-center gap-2">
                  <div data-tour="depth" role="radiogroup" aria-label="Depth" className="flex rounded-lg bg-muted p-0.5">
                    {MODES.map((m) => (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={mode === m.id}
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        title={`${m.hint}: up to ${m.sources} web sources`}
                        className={`h-7 rounded-md px-2.5 text-xs font-medium transition-all duration-150 ${
                          mode === m.id ? "bg-background text-foreground shadow-[var(--shadow-soft)]" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <Button data-tour="run" type="submit" size="icon" aria-label="Run research" disabled={topic.trim().length < 3} className="size-9 rounded-xl max-md:size-10">
                    <ArrowUp />
                  </Button>
                </div>
              </div>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept={UPLOAD_ACCEPT}
                className="sr-only"
                aria-label="Upload documents"
                onChange={(e) => {
                  void addFiles(Array.from(e.target.files ?? []));
                  e.target.value = ""; // so the same file can be picked again
                }}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
              <span>
                {selected.label}: {selected.hint.toLowerCase()}
                {useWeb ? `, up to ${selected.sources} web sources` : ", your sources only"}
                {sourcesUsed > 0 && ` + ${sourcesUsed} of yours`}
                {targetProject ? ` · draft in ${targetProject.name}` : ""}
              </span>
              <span className="hidden items-center gap-1 sm:flex">
                <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">⌘</kbd>
                <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">Enter</kbd>
                to run
              </span>
            </div>

            {!topic && (
              <div className="mt-8 grid gap-2 sm:grid-cols-3">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setTopic(example)}
                    className="rounded-xl border border-border/80 px-3.5 py-3 text-left text-[13px] leading-snug text-muted-foreground transition-colors duration-150 hover:border-border hover:bg-muted/50 hover:text-foreground"
                  >
                    {example}
                  </button>
                ))}
              </div>
            )}

            {(manual.length > 0 || reading > 0) && (
              <section aria-label="Your sources" className="mt-8 space-y-2">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-[13px] font-medium tracking-normal">Your sources</h2>
                  <span className={`text-xs tabular-nums ${overTotal ? "font-medium text-weak" : "text-muted-foreground"}`}>
                    {manual.length} of {MAX_MANUAL_SOURCES} · {totalChars.toLocaleString()} / {MAX_MANUAL_TOTAL_CHARS.toLocaleString()} characters
                  </span>
                </div>
                {reading > 0 && (
                  <div role="status" className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Reading {reading} {reading === 1 ? "document" : "documents"}…
                  </div>
                )}
                {manual.map((m, i) =>
                  m.fileName ? (
                    <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 pl-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <FileText className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <input aria-label="Source title" placeholder="Title" maxLength={300} value={m.title}
                          onChange={(e) => updateSource(i, { title: e.target.value })}
                          className="w-full truncate bg-transparent text-sm font-medium outline-none" />
                        <div className="truncate text-xs text-muted-foreground">
                          {m.fileName}
                          {m.fileSize !== undefined && ` · ${formatBytes(m.fileSize)}`}
                          {m.originalChars !== undefined && m.originalChars > MAX_MANUAL_SOURCE_CHARS
                            ? <span className="text-weak"> · first {MAX_MANUAL_SOURCE_CHARS.toLocaleString()} characters read</span>
                            : ` · ${m.text.length.toLocaleString()} characters`}
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="icon" className="size-8 text-muted-foreground" aria-label={`Remove ${m.fileName}`} onClick={() => setManual(manual.filter((_, j) => j !== i))}>
                        <X />
                      </Button>
                    </div>
                  ) : (
                    <div key={i} className="space-y-2 rounded-xl border border-border bg-card p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      <div className="flex gap-2">
                        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                          <Input placeholder="Title" maxLength={300} value={m.title} onChange={(e) => updateSource(i, { title: e.target.value })} />
                          <Input placeholder="Link (optional)" inputMode="url" maxLength={2000} value={m.url} onChange={(e) => updateSource(i, { url: e.target.value })} />
                        </div>
                        <Button type="button" variant="ghost" size="icon" className="shrink-0 text-muted-foreground" aria-label="Remove source" onClick={() => setManual(manual.filter((_, j) => j !== i))}>
                          <X />
                        </Button>
                      </div>
                      <Textarea rows={4} maxLength={MAX_MANUAL_SOURCE_CHARS} placeholder="Paste the text…" value={m.text}
                        onChange={(e) => updateSource(i, { text: e.target.value })} />
                      <div className={`text-right text-xs tabular-nums ${m.text.length >= MAX_MANUAL_SOURCE_CHARS ? "text-weak" : "text-muted-foreground"}`}>
                        {m.text.length.toLocaleString()} / {MAX_MANUAL_SOURCE_CHARS.toLocaleString()}
                      </div>
                    </div>
                  ),
                )}
                <p className="px-1 text-xs text-muted-foreground">Documents are read on your device; only their text is sent, and files aren't stored.</p>
              </section>
            )}

            {/* Less common choices, out of the way until wanted. */}
            <section aria-label="Options" className="mt-10 divide-y divide-border/70 rounded-xl border border-border/80">
              <div data-tour="template">
                <div className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="min-w-0">
                    <Label htmlFor="template" className="text-sm font-medium">Professional structure</Label>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {templateOn ? `${sections.length} sections, in your order` : "Executive summary, method, findings and recommendation"}
                    </p>
                  </div>
                  <Switch id="template" checked={templateOn} onCheckedChange={setTemplateOn} />
                </div>
                {templateOn && (
                  <div className="space-y-3 px-4 pb-4 animate-in fade-in slide-in-from-top-1 duration-200">
                    <ol className="flex flex-wrap gap-1.5">
                      {sections.map((sec, i) => (
                        <li key={sec} className="flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-xs">
                          <span className="text-muted-foreground tabular-nums">{i + 1}</span>
                          <span className="max-w-48 truncate font-medium">{sec}</span>
                          <button type="button" className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove ${sec}`} onClick={() => setSections(sections.filter((_, j) => j !== i))}>
                            <X className="size-3" />
                          </button>
                        </li>
                      ))}
                    </ol>
                    <div className="flex gap-2">
                      <Input
                        aria-label="New section name"
                        placeholder="Add a section…"
                        maxLength={MAX_TEMPLATE_SECTION_TITLE}
                        value={newSection}
                        onChange={(e) => setNewSection(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.stopPropagation();
                            addSection();
                          }
                        }}
                        className="h-8 text-[13px]"
                      />
                      <Button type="button" variant="outline" size="sm" aria-label="Add section" onClick={addSection}>
                        <Plus />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setSections([...DEFAULT_TEMPLATE_SECTIONS])}>
                        <RotateCcw /> Reset
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {workspace.org && projects.data && projects.data.length > 0 && (
                <div data-tour="draft-target" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">Save as a draft in a project</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {targetProject ? `Ready to edit and send for review in ${targetProject.name}` : "Or keep it as a standalone report"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select aria-label="Project to draft in" value={draftProject} onChange={(e) => setDraftProject(e.target.value)} className={fieldSelect}>
                      <option value="">Standalone report</option>
                      {projects.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {targetProject && (
                      <select aria-label="Kind of document" value={draftKind} onChange={(e) => setDraftKind(e.target.value as (typeof DRAFT_KINDS)[number])} className={fieldSelect}>
                        {DRAFT_KINDS.map((k) => <option key={k}>{k}</option>)}
                      </select>
                    )}
                  </div>
                </div>
              )}
            </section>
          </form>
        </div>
      )}
    </div>
  );
}
