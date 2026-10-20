import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowRight, FileText, Globe, Loader2, Plus, Upload, X } from "lucide-react";
import {
  MAX_MANUAL_SOURCE_CHARS,
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
  const [manual, setManual] = useState<FormSource[]>(() => getDraft().manual);
  const [reading, setReading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveDraft({ topic, context, mode, useWeb, manual });
  }, [topic, context, mode, useWeb, manual]);

  // A pre-filled link replaces the form once, then leaves the URL clean so a
  // reload doesn't overwrite later edits.
  useEffect(() => {
    if (search.topic === undefined && search.project === undefined) return;
    if (search.topic !== undefined) {
      setTopic(search.topic);
      setContext(search.context ?? "");
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
    setMode(failedInput.mode);
    setUseWeb(failedInput.useWeb);
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
      manual: usableSources.map(({ title, url, text, fileName }) => ({ title, url, text, ...(fileName ? { fileName } : {}) })),
    });
    saveDraft(EMPTY_DRAFT);
  }

  const updateSource = (index: number, patch: Partial<FormSource>) =>
    setManual(manual.map((m, i) => (i === index ? { ...m, ...patch } : m)));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-3xl leading-tight sm:text-4xl">New research</h1>
      <p className="mt-2 text-muted-foreground">
        {workspace.org
          ? `Research for ${workspace.name}. Every member of the organization will be able to read the report.`
          : "Ask a question. Get a report where every claim is cited and every gap is named."}
      </p>

      {isInFlight(run) ? (
        <div className="max-w-3xl">
          <ResearchProgress run={run} />
        </div>
      ) : (
        <div className="animate-in fade-in duration-300">
          {run.status === "done" && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border border-strong/40 bg-strong/5 p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="min-w-0">
                <div className="font-mono text-xs uppercase tracking-widest text-strong">{run.draftId ? "Draft ready" : "Report ready"}</div>
                <div className="mt-1 truncate text-sm">{run.input.topic}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {run.draftId && (
                  <Button asChild size="sm">
                    <Link to="/org/drafts/$draftId" params={{ draftId: run.draftId }}>Open draft <ArrowRight /></Link>
                  </Button>
                )}
                <Button asChild size="sm" variant={run.draftId ? "outline" : "default"}>
                  <Link to="/reports/$id" params={{ id: run.reportId }}>
                    View report {!run.draftId && <ArrowRight />}
                  </Link>
                </Button>
              </div>
            </div>
          )}
          {run.status === "paused" && (
            <div className="mt-8 border border-moderate/50 bg-moderate/10 p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Research paused</div>
              <div className="mt-2 font-serif text-2xl leading-snug">{run.input.topic}</div>
              <p className="mt-2 text-sm text-muted-foreground">
                The AI provider didn't respond after {MAX_AUTO_RETRIES} retries, so Parallax stopped trying. Your{" "}
                {run.sources.length} {run.sources.length === 1 ? "source is" : "sources are"} still saved — retrying picks up from the
                writing step without searching again.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void resume(true)}>Retry now</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => void dismiss()}>Discard</Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Last response: {run.reason} Starting a new research below discards this one.
              </p>
            </div>
          )}
          {run.status === "error" && (
            <div role="alert" className="mt-8 flex items-start justify-between gap-3 border border-weak/40 bg-weak/5 p-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <div className="font-mono text-xs uppercase tracking-widest text-weak">Research didn't finish</div>
                <div className="mt-1 text-sm">{run.error}</div>
                <div className="mt-1 text-xs text-muted-foreground">Your inputs are still below — adjust them or run it again.</div>
              </div>
              <Button type="button" variant="ghost" size="icon" aria-label="Dismiss" onClick={() => void dismiss()}>
                <X />
              </Button>
            </div>
          )}

          <form
            onSubmit={submit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.requestSubmit();
            }}
            className={`${run.status === "paused" ? "mt-6" : "mt-8"} grid items-start gap-6 pb-24 lg:grid-cols-[minmax(0,1fr)_19rem] lg:pb-0`}
          >
            <div className="space-y-6">
              <section className="border border-border bg-card">
                <header className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Question
                </header>
                <div className="space-y-5 p-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="topic">Topic or question</Label>
                    <Textarea id="topic" required minLength={3} maxLength={1000} rows={3} value={topic} onChange={(e) => setTopic(e.target.value)}
                      placeholder="What do you want to understand?" className="text-base" />
                    {!topic && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {EXAMPLES.map((example) => (
                          <button key={example} type="button" onClick={() => setTopic(example)}
                            className="border border-border px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground">
                            {example}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="ctx">Context <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Textarea id="ctx" rows={2} maxLength={4000} value={context} onChange={(e) => setContext(e.target.value)}
                      placeholder="Audience, geography, timeframe, the decision you're facing…" />
                    <p className="text-xs text-muted-foreground">Narrows the scope and shapes the implications to your goal.</p>
                  </div>
                </div>
              </section>

              <section className="border border-border bg-card">
                <header className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Sources
                </header>
                <div className="divide-y divide-border">
                  <div className="flex items-center justify-between gap-4 p-5">
                    <div className="flex items-start gap-3">
                      <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div>
                        <Label htmlFor="web" className="text-sm font-medium">Search the web</Label>
                        <div className="text-xs text-muted-foreground">
                          {useWeb ? "Find and read sources automatically." : "Off — the report will use only your own sources."}
                        </div>
                      </div>
                    </div>
                    <Switch id="web" checked={useWeb} onCheckedChange={setUseWeb} />
                  </div>
                  <div className="space-y-4 p-5">
                    <div>
                      <div className="text-sm font-medium">
                        Your own sources{" "}
                        <span className="font-normal tabular-nums text-muted-foreground">({manual.length} of {MAX_MANUAL_SOURCES})</span>
                      </div>
                      <div className="text-xs text-muted-foreground">Add documents, notes or pages the web search can't reach.</div>
                    </div>

                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={(e) => { e.preventDefault(); setDragging(false); void addFiles(Array.from(e.dataTransfer.files)); }}
                      className={`border border-dashed p-5 text-center transition-colors ${dragging ? "border-foreground bg-muted" : "border-border"}`}
                    >
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
                      <Upload className="mx-auto size-5 text-muted-foreground" />
                      {/* Nobody drags files on a phone. */}
                      <p className="mt-2 hidden text-sm md:block">Drop documents here</p>
                      <p className="mt-2 text-sm md:hidden">Add your documents</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {UPLOAD_FORMATS_LABEL} · up to {MAX_UPLOAD_BYTES / 1024 / 1024} MB each
                      </p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <Button type="button" variant="outline" size="sm" disabled={manual.length >= MAX_MANUAL_SOURCES}
                          onClick={() => fileInput.current?.click()}>
                          <Upload /> Upload documents
                        </Button>
                        <Button type="button" variant="ghost" size="sm" disabled={manual.length >= MAX_MANUAL_SOURCES}
                          onClick={() => setManual([...manual, { title: "", url: "", text: "" }])}>
                          <Plus /> Paste text instead
                        </Button>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Up to {MAX_MANUAL_SOURCES} sources per run. The first {MAX_MANUAL_SOURCE_CHARS.toLocaleString()} characters of each are
                      read, and {MAX_MANUAL_TOTAL_CHARS.toLocaleString()} characters across all of them. Documents are read on your device;
                      the files themselves are not stored.
                    </p>

                    {reading > 0 && (
                      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Reading {reading} {reading === 1 ? "document" : "documents"}…
                      </div>
                    )}

                    {manual.map((m, i) =>
                      m.fileName ? (
                        <div key={i} className="flex items-start gap-3 border border-border p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                          <FileText className="mt-2 size-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <Input aria-label="Source title" placeholder="Title" maxLength={300} value={m.title}
                              onChange={(e) => updateSource(i, { title: e.target.value })} />
                            <div className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground">
                              {m.fileName}
                              {m.fileSize !== undefined && ` · ${formatBytes(m.fileSize)}`}
                              {` · ${m.text.length.toLocaleString()} characters`}
                            </div>
                            {m.originalChars !== undefined && m.originalChars > MAX_MANUAL_SOURCE_CHARS && (
                              <div className="mt-1 text-xs text-weak">
                                Only the first {MAX_MANUAL_SOURCE_CHARS.toLocaleString()} of its {m.originalChars.toLocaleString()} characters will be read.
                              </div>
                            )}
                          </div>
                          <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${m.fileName}`} onClick={() => setManual(manual.filter((_, j) => j !== i))}>
                            <X />
                          </Button>
                        </div>
                      ) : (
                        <div key={i} className="space-y-2 border border-dashed border-border p-3 animate-in fade-in slide-in-from-top-1 duration-200">
                          <div className="flex gap-2">
                            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                              <Input placeholder="Title" maxLength={300} value={m.title} onChange={(e) => updateSource(i, { title: e.target.value })} />
                              <Input placeholder="URL (optional)" inputMode="url" maxLength={2000} value={m.url} onChange={(e) => updateSource(i, { url: e.target.value })} />
                            </div>
                            <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Remove source" onClick={() => setManual(manual.filter((_, j) => j !== i))}>
                              <X />
                            </Button>
                          </div>
                          <Textarea rows={4} maxLength={MAX_MANUAL_SOURCE_CHARS} placeholder="Paste the text excerpt…" value={m.text}
                            onChange={(e) => updateSource(i, { text: e.target.value })} />
                          <div className={`text-right font-mono text-[10px] tabular-nums ${m.text.length >= MAX_MANUAL_SOURCE_CHARS ? "text-weak" : "text-muted-foreground"}`}>
                            {m.text.length.toLocaleString()} / {MAX_MANUAL_SOURCE_CHARS.toLocaleString()}
                            {m.text.length >= MAX_MANUAL_SOURCE_CHARS && " — limit reached, extra text was cut off"}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </section>
            </div>

            <aside className="space-y-6 lg:sticky lg:top-20">
              <section className="border border-border bg-card">
                <header className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Depth
                </header>
                <div role="radiogroup" aria-label="Depth" className="divide-y divide-border">
                  {MODES.map((m) => (
                    <button type="button" role="radio" aria-checked={mode === m.id} key={m.id} onClick={() => setMode(m.id)}
                      className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${mode === m.id ? "bg-muted" : "hover:bg-muted/50"}`}>
                      <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${mode === m.id ? "border-foreground" : "border-input"}`}>
                        <span className={`size-2 rounded-full bg-foreground transition-transform duration-200 ${mode === m.id ? "scale-100" : "scale-0"}`} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{m.label}</span>
                        <span className="block text-xs text-muted-foreground">{m.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              {workspace.org && projects.data && projects.data.length > 0 && (
                <section className="border border-border bg-card">
                  <header className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    Draft it in a project
                  </header>
                  <div className="space-y-3 p-5">
                    <select aria-label="Project to draft in" value={draftProject} onChange={(e) => setDraftProject(e.target.value)} className="h-11 w-full border border-input bg-background px-2 text-sm md:h-9">
                      <option value="">No — just the report</option>
                      {projects.data.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {targetProject && (
                      <>
                        <select aria-label="Kind of document" value={draftKind} onChange={(e) => setDraftKind(e.target.value as (typeof DRAFT_KINDS)[number])} className="h-11 w-full border border-input bg-background px-2 text-sm md:h-9">
                          {DRAFT_KINDS.map((k) => <option key={k}>{k}</option>)}
                        </select>
                        <p className="text-xs text-muted-foreground">
                          When the research finishes, Parallax turns the report into a draft in {targetProject.name} for you to edit and submit for review.
                        </p>
                      </>
                    )}
                  </div>
                </section>
              )}

              <section className="border border-border bg-card p-5">
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Saves to</dt>
                    <dd className="truncate">{targetProject ? `${targetProject.name}, as a draft` : workspace.org ? workspace.name : "Personal"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Web sources</dt>
                    <dd>{useWeb ? `Up to ${selected.sources}` : "Off"}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-muted-foreground">Your sources</dt>
                    <dd className="tabular-nums">{usableSources.length} of {MAX_MANUAL_SOURCES}</dd>
                  </div>
                  {usableSources.length > 0 && (
                    <div className="flex justify-between gap-4">
                      <dt className="text-muted-foreground">Source text</dt>
                      <dd className={`tabular-nums ${overTotal ? "text-weak" : ""}`}>
                        {totalChars.toLocaleString()} / {MAX_MANUAL_TOTAL_CHARS.toLocaleString()}
                      </dd>
                    </div>
                  )}
                </dl>
                <Button type="submit" size="lg" className="mt-5 hidden w-full lg:inline-flex">
                  Run research <ArrowRight />
                </Button>
                <p className="mt-3 hidden text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground lg:block">⌘ Enter to run</p>
              </section>
            </aside>

            {/* On a phone the form is long; the run button stays pinned within reach. */}
            <div className="pb-safe fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-border bg-background/95 px-4 pt-3 backdrop-blur-md lg:hidden">
              <div className="min-w-0 flex-1 text-xs text-muted-foreground">
                <div className="truncate font-medium text-foreground">{selected.label} depth{targetProject ? ` · draft in ${targetProject.name}` : workspace.org ? ` · ${workspace.name}` : ""}</div>
                <div className="truncate">
                  {useWeb ? "Web search on" : "Web search off"}
                  {usableSources.length > 0 && ` · ${usableSources.length} of your own`}
                </div>
              </div>
              <Button type="submit" size="lg" className="shrink-0 px-6">
                Run research <ArrowRight />
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
