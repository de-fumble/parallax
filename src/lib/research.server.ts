import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { PARALLAX_SYSTEM_PROMPT } from "./research.prompt";
import { MAX_MANUAL_SOURCE_CHARS, type ManualSource, type Mode, type Report, type RetrievedSource } from "./research.types";

// Any OpenAI-compatible chat completions API works. These apply only when a
// provider is configured without a base URL or model of its own.
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-pro";
// How long the model may go without sending anything before the run is abandoned.
const AI_STALL_MS = 120_000;
const SEARCH_TIMEOUT_MS = 45_000;
const MAX_QUERY_LENGTH = 400;
const RESULTS_BY_MODE: Record<Mode, number> = { LIGHT: 6, MEDIUM: 12, DEEP: 20 };

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

function guessType(domain: string): string {
  if (/\.gov(\.|$)|\.gouv\.|europa\.eu|\.int$/.test(domain)) return "government";
  if (/arxiv|doi\.org|nature\.com|sciencedirect|springer|wiley|pubmed|nih\.gov|\.edu|acm\.org|ieee/.test(domain)) return "academic";
  if (/reddit|stackexchange|stackoverflow|quora|news\.ycombinator/.test(domain)) return "forum";
  if (/docs\.|developer\.|readthedocs/.test(domain)) return "documentation";
  if (/medium\.com|substack|blogspot|wordpress/.test(domain)) return "blog";
  if (/reuters|apnews|bbc|nytimes|ft\.com|bloomberg|theguardian|wsj|economist|cnbc|techcrunch|theverge/.test(domain)) return "news";
  return "other";
}

function normDate(d?: string | null): string | null {
  if (!d) return null;
  const m = String(d).match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

/** One web result, whichever search service found it. */
export type WebResult = { title?: string | undefined; url: string; content: string; published_date?: string | null };

type SearchProvider = { name: string; key: string | undefined; search: (key: string, query: string, mode: Mode) => Promise<WebResult[]> };

// Exa: the recommended request from Exa's integration guide (query, type
// "auto", highlights) plus a result count, which here is a deliberate choice:
// the depth the user picked decides how many sources the report is built on.
async function exaSearch(key: string, query: string, mode: Mode): Promise<WebResult[]> {
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: query.slice(0, MAX_QUERY_LENGTH),
      type: "auto",
      numResults: RESULTS_BY_MODE[mode],
      contents: { highlights: true },
    }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error("Exa rejected the API key. Check EXA_API_KEY.");
    if (res.status === 402) throw new Error("The Exa account is out of credits.");
    if (res.status === 429) throw new Error("Exa is rate limiting searches right now.");
    throw new Error(`Exa search failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    results?: { title?: string | null; url?: string; publishedDate?: string | null; highlights?: string[] | null }[];
  };
  return (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title ?? undefined, url: r.url!, content: (r.highlights ?? []).join("\n\n"), published_date: r.publishedDate ?? null }));
}

// Tavily: "advanced" returns the passages of each page most relevant to the
// query, rather than a one-line snippet, so the report has real text to cite.
async function tavilySearch(key: string, query: string, mode: Mode): Promise<WebResult[]> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: query.slice(0, MAX_QUERY_LENGTH),
      max_results: RESULTS_BY_MODE[mode],
      search_depth: "advanced",
    }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new Error("Tavily rejected the API key. Check TAVILY_API_KEY.");
    if (res.status === 429) throw new Error("Tavily is rate limiting searches right now.");
    if (res.status === 432 || res.status === 433) throw new Error("The Tavily plan's search credits are used up.");
    throw new Error(`Tavily search failed [${res.status}]: ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string; published_date?: string | null }[];
  };
  return (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({ title: r.title, url: r.url!, content: r.content ?? "", published_date: r.published_date ?? null }));
}

/** Search services in the order to try them: SEARCH_ORDER, else Exa then Tavily. */
function searchProviders(): SearchProvider[] {
  const all: Record<string, SearchProvider> = {
    exa: { name: "Exa", key: process.env['EXA_API_KEY'], search: exaSearch },
    tavily: { name: "Tavily", key: process.env['TAVILY_API_KEY'], search: tavilySearch },
  };
  const order = (process.env['SEARCH_ORDER'] || "exa,tavily").split(",").map((s) => s.trim().toLowerCase());
  return order.map((id) => all[id]).filter((p): p is SearchProvider => !!p && !!p.key);
}

const ARXIV_RESULTS_BY_MODE: Partial<Record<Mode, number>> = { MEDIUM: 4, DEEP: 8 };
const ARXIV_STOPWORDS = new Set(["the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "is", "are", "with", "what", "how", "why", "does", "do", "vs"]);

const decodeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const xmlTag = (xml: string, tag: string) => {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1]!).replace(/\s+/g, " ").trim() : "";
};

// arXiv's public Atom API: free, no key. Returns paper abstracts as sources.
async function arxivSearch(query: string, mode: Mode): Promise<WebResult[]> {
  const max = ARXIV_RESULTS_BY_MODE[mode];
  if (!max) return [];
  const terms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !ARXIV_STOPWORDS.has(w))
    .slice(0, 8);
  if (terms.length === 0) return [];
  const params = new URLSearchParams({
    search_query: `all:(${terms.join(" OR ")})`,
    start: "0",
    max_results: String(max),
    sortBy: "relevance",
    sortOrder: "descending",
  });
  const res = await fetch(`https://export.arxiv.org/api/query?${params}`, { signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`arXiv search failed [${res.status}]`);
  const xml = await res.text();
  const out: WebResult[] = [];
  for (const entry of xml.split("<entry>").slice(1)) {
    const id = xmlTag(entry, "id");
    const summary = xmlTag(entry, "summary");
    if (!id || !summary) continue;
    out.push({
      title: xmlTag(entry, "title") || undefined,
      url: id.replace(/^http:/, "https:"),
      content: summary,
      published_date: xmlTag(entry, "published") || null,
    });
  }
  return out;
}

/** Web results plus, for Medium and Deep research, relevant arXiv papers. */
export async function webSearch(query: string, mode: Mode): Promise<WebResult[]> {
  const [web, papers] = await Promise.all([
    webSearchProviders(query, mode),
    arxivSearch(query, mode).catch((err) => {
      console.warn(`[search] arXiv failed: ${err instanceof Error ? err.message : String(err)}`);
      return [] as WebResult[];
    }),
  ]);
  const seen = new Set(web.map((r) => r.url));
  return [...web, ...papers.filter((p) => !seen.has(p.url))];
}

// Try each configured search service until one returns results. A service
// that fails (bad key, no credit, rate limit, timeout) hands over to the next.
async function webSearchProviders(query: string, mode: Mode): Promise<WebResult[]> {
  const providers = searchProviders();
  if (providers.length === 0) throw new Error("Web search is not configured. Set EXA_API_KEY or TAVILY_API_KEY.");
  let lastError: Error | null = null;
  for (const [i, p] of providers.entries()) {
    try {
      const results = await p.search(p.key!, query, mode);
      if (results.length > 0 || i === providers.length - 1) {
        if (i > 0) console.log(`[search] results from fallback ${p.name}`);
        return results;
      }
      console.warn(`[search] ${p.name} found nothing. Trying ${providers[i + 1]!.name}.`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const next = providers[i + 1];
      console.warn(`[search] ${p.name} failed: ${lastError.message}${next ? ` Trying ${next.name}.` : ""}`);
    }
  }
  throw lastError ?? new Error("Web search failed.");
}

export function buildSources(
  web: Awaited<ReturnType<typeof webSearch>>,
  manual: ManualSource[],
): RetrievedSource[] {
  const out: RetrievedSource[] = [];
  let i = 1;
  for (const m of manual) {
    if (!m.text.trim()) continue;
    const domain = m.url ? domainOf(m.url) : "user-provided";
    out.push({
      source_id: `S${i++}`,
      title: m.title || m.fileName || "User-provided source",
      url: m.url || "",
      publisher_or_domain: domain,
      published_date: null,
      source_type: m.url ? guessType(domain) : "other",
      extracted_text: m.text.slice(0, MAX_MANUAL_SOURCE_CHARS),
    });
  }
  for (const r of web) {
    // A page that came back with no text gives the report nothing to cite.
    if (!r.content.trim()) continue;
    const domain = domainOf(r.url);
    out.push({
      source_id: `S${i++}`,
      title: r.title || domain,
      url: r.url,
      publisher_or_domain: domain,
      published_date: normDate(r.published_date),
      source_type: guessType(domain),
      extracted_text: r.content.slice(0, 6000),
    });
  }
  return out;
}

function extractJson(text: string): Report {
  let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t) as Report;
}

// Some providers leave the error message empty and put the reason in the response body,
// shaped as { error: { message } } or the same wrapped in an array.
function providerMessage(body?: string): string {
  if (!body) return "";
  try {
    const parsed = JSON.parse(body) as unknown;
    const first = (Array.isArray(parsed) ? parsed[0] : parsed) as { error?: { message?: unknown } | string } | undefined;
    const error = first?.error;
    if (typeof error === "string") return error;
    return typeof error?.message === "string" ? error.message : "";
  } catch {
    return "";
  }
}

type ReportRequest = { topic: string; mode: Mode; context: string; sources: RetrievedSource[] };

/** The model answered, but not with a report that can be parsed. */
class UnreadableReport extends Error {}

/**
 * The AI provider failed in a way that waiting may fix: it went quiet, is
 * overloaded or rate limiting, or the network dropped. The caller keeps the
 * run's progress and tries again later. A bad key or an empty balance is not
 * one of these; retrying those would never help.
 */
export class TemporaryAiFailure extends Error {}

type AiRoute = { label: string; apiKey: string; baseURL: string; model: string };

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^(api|www)\./, "");
  } catch {
    return url;
  }
};

/**
 * Every provider and model to try, in order. The primary comes from AI_*,
 * then optional fallbacks from AI_FALLBACK_*, AI_FALLBACK_2_* and
 * AI_FALLBACK_3_*. Each model setting may list several models separated by
 * commas, tried left to right.
 */
function aiRoutes(): AiRoute[] {
  const routes: AiRoute[] = [];
  const add = (apiKey: string | undefined, baseURL: string, models: string) => {
    if (!apiKey) return;
    for (const model of models.split(",").map((m) => m.trim()).filter(Boolean)) {
      routes.push({ label: `${hostOf(baseURL)} (${model})`, apiKey, baseURL, model });
    }
  };
  add(process.env['AI_API_KEY'], process.env['AI_BASE_URL'] || DEFAULT_BASE_URL, process.env['AI_MODEL'] || DEFAULT_MODEL);
  for (const prefix of ["AI_FALLBACK_", "AI_FALLBACK_2_", "AI_FALLBACK_3_"]) {
    add(process.env[`${prefix}API_KEY`], process.env[`${prefix}BASE_URL`] || DEFAULT_BASE_URL, process.env[`${prefix}MODEL`] || DEFAULT_MODEL);
  }
  return routes;
}

// Ask each configured provider in turn until one returns a usable report. A
// failure of any kind (overloaded, rate limited, a rejected key, a reply that
// doesn't parse) moves straight on to the next, so one provider having a bad
// moment doesn't stop the run.
export async function generateReport(input: ReportRequest): Promise<Report> {
  const routes = aiRoutes();
  if (routes.length === 0) throw new Error("AI is not configured. Set AI_API_KEY.");

  let lastError: Error = new Error("The AI request failed.");
  let worthRetrying = false;
  for (const [i, route] of routes.entries()) {
    try {
      const report = await requestReport(input, route);
      if (i > 0) console.log(`[ai] report written by fallback ${route.label}`);
      return report;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // An unreadable reply is a fluke of that attempt, so it counts as temporary too.
      worthRetrying ||= err instanceof TemporaryAiFailure || err instanceof UnreadableReport;
      const next = routes[i + 1];
      console.warn(`[ai] ${route.label} failed: ${lastError.message}${next ? ` Trying ${next.label}.` : " No providers left."}`);
    }
  }
  // Everything failed. If any of it was temporary, the run is held and retried
  // later; if every provider refused outright, waiting won't help.
  if (worthRetrying) {
    throw new TemporaryAiFailure(routes.length > 1 ? "None of the AI providers could write the report just now." : lastError.message);
  }
  throw lastError;
}

async function requestReport(input: ReportRequest, route: AiRoute): Promise<Report> {
  const provider = createOpenAI({ apiKey: route.apiKey, baseURL: route.baseURL });

  const userMessage = [
    `CURRENT_DATE: ${new Date().toISOString().slice(0, 10)}`,
    `USER_TOPIC: ${input.topic}`,
    `RESEARCH_MODE: ${input.mode}`,
    `USER_CONTEXT: ${input.context || "(none)"}`,
    `RETRIEVED_SOURCES: ${JSON.stringify(input.sources)}`,
  ].join("\n\n");

  // A provider that accepts the request and then goes quiet would otherwise hold
  // the run open indefinitely, so give up once nothing has arrived for a while.
  const stall = new AbortController();
  let watchdog = setTimeout(() => stall.abort(), AI_STALL_MS);

  let streamError: unknown;
  const result = streamText({
    model: provider.chat(route.model),
    instructions: PARALLAX_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    abortSignal: stall.signal,
    onError: ({ error }) => {
      streamError = error;
    },
  });

  // A failed request ends the stream with a generic error; the real cause is in onError.
  let text = "";
  try {
    for await (const chunk of result.textStream) {
      text += chunk;
      clearTimeout(watchdog);
      watchdog = setTimeout(() => stall.abort(), AI_STALL_MS);
    }
  } catch (error) {
    streamError ??= error;
  } finally {
    clearTimeout(watchdog);
  }
  if (stall.signal.aborted) throw new TemporaryAiFailure("The AI provider stopped responding.");
  if (streamError) {
    // After its own retries the SDK wraps the failure ("Failed after 3 attempts.
    // Last error: AI_APICallError"); the status and the provider's reason are on
    // the underlying error.
    type ApiError = { statusCode?: number; message?: string; responseBody?: string; lastError?: ApiError };
    const outer = streamError as ApiError;
    const e = outer.lastError ?? outer;
    const detail = providerMessage(e.responseBody) || e.message || "";
    if (e.statusCode === 401 || /api key/i.test(detail)) throw new Error("The AI provider rejected its API key.");
    if (e.statusCode === 402) throw new Error("AI credits are exhausted. Add credits to keep researching.");
    if (e.statusCode === 429) {
      throw new TemporaryAiFailure(
        /quota/i.test(detail)
          ? "The AI provider's usage quota is used up for now."
          : "The AI provider is rate limiting requests.",
      );
    }
    if (e.statusCode === 503) throw new TemporaryAiFailure("The AI provider is overloaded right now.");
    // Other server-side errors, and failures with no HTTP status at all (the
    // connection never completed), are the provider's problem, not the request's.
    if (e.statusCode === undefined || e.statusCode >= 500) {
      throw new TemporaryAiFailure(detail || "The AI provider couldn't be reached.");
    }
    throw new Error(detail || `The AI request failed (status ${e.statusCode}).`);
  }
  if (!text.trim()) throw new UnreadableReport("The AI returned an empty report. Please try again.");
  try {
    return extractJson(text);
  } catch {
    throw new UnreadableReport("The AI returned a report that couldn't be read. Please try again.");
  }
}
