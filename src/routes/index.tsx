import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { ParallaxMark } from "@/components/ParallaxMark";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Parallax — Research that shows its work" },
      {
        name: "description",
        content:
          "Parallax is an AI research engine. It gathers sources, reads them, and writes a report where every claim is cited and every gap is named.",
      },
      { property: "og:title", content: "Parallax — Research that shows its work" },
      {
        property: "og:description",
        content: "An AI research engine where every claim is cited and every gap is named.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const PRINCIPLES = [
  {
    title: "Closed book",
    body: "Parallax writes only from the sources it retrieved for your question. It does not fill gaps from memory, however confident it might be.",
  },
  {
    title: "Cited inline",
    body: "Each claim carries its source right where it is made. Click a citation and you land on the source it came from.",
  },
  {
    title: "Gaps named",
    body: "Thin evidence, a lone source, an outdated figure, two sources that disagree — each one is flagged instead of smoothed over.",
  },
];

const STEPS = [
  {
    title: "Ask",
    body: "Pose a topic or a question. Add context — audience, geography, timeframe, the decision you're facing — to narrow the scope.",
  },
  {
    title: "Gather",
    body: "Parallax searches the web for sources. You can also paste in your own material, or switch the web off and use only that.",
  },
  {
    title: "Read",
    body: "You get a structured report with a bottom line, the findings behind it, and an honest account of what the evidence can't tell you.",
  },
];

const ANATOMY = [
  { title: "Bottom line", body: "A short answer up front, with a stated confidence level and the reason for it." },
  { title: "Key findings", body: "Each finding rated strong, moderate or weak by the evidence that supports it." },
  { title: "Contradictions", body: "Where sources disagree, both positions side by side with the likeliest explanation." },
  { title: "Comparison", body: "For either-or questions: options weighed against the same criteria, then decision guidance." },
  { title: "Gaps and open questions", body: "What the sources didn't cover, and the searches worth running next." },
  { title: "Source credibility", body: "Every source used, ranked into tiers from primary research down to blogs and forums." },
];

const DEPTHS = [
  { name: "Light", body: "A quick scan from a handful of sources." },
  { name: "Medium", body: "A balanced report. The default." },
  { name: "Deep", body: "The widest search and the fullest report." },
];

function Eyebrow({ children, inverse }: { children: React.ReactNode; inverse?: boolean }) {
  return (
    <p className={`font-mono text-xs uppercase tracking-[0.2em] ${inverse ? "text-background/60" : "text-muted-foreground"}`}>
      {children}
    </p>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="cite-chip">{children}</span>;
}

// A hand-written illustration of the report layout, not output from a real run.
function SampleReport() {
  return (
    <figure className="reveal">
      <div className="border border-border bg-card shadow-[0_30px_80px_-40px_rgb(0_0_0/0.35)]">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </div>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Report</span>
        </div>
        <div className="grid gap-8 p-5 md:grid-cols-[1.25fr_1fr] md:gap-10 md:p-10">
          <div>
            <div className="flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wider">
              <span className="bg-muted px-1.5 py-0.5 text-muted-foreground">Medium</span>
              <span className="bg-moderate/20 px-1.5 py-0.5">Partial</span>
              <span className="bg-moderate/20 px-1.5 py-0.5">Medium confidence</span>
            </div>
            <h3 className="mt-4 text-3xl leading-tight md:text-4xl">Is sodium-ion storage ready for the grid?</h3>
            <div className="mt-6 border-l-2 border-foreground pl-5">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Bottom line</div>
              <p className="mt-2 leading-relaxed">
                Sodium-ion storage is operating at utility scale in pilot plants<Chip>S1</Chip>, but cell costs have not
                yet fallen below the incumbent chemistry<Chip>S2</Chip>
                <Chip>S4</Chip>. <em className="text-muted-foreground">Interpretation:</em> technically proven, not yet
                economically settled.
              </p>
            </div>
          </div>
          <div className="space-y-5 text-sm">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Key findings</div>
              <ol className="mt-3 space-y-4">
                <li className="grid grid-cols-[1.75rem_1fr] gap-1">
                  <span className="font-mono text-xs text-muted-foreground">01</span>
                  <div>
                    <p className="leading-relaxed">
                      A grid-connected plant has reported round-trip efficiency above 90%<Chip>S1</Chip>.
                    </p>
                    <div className="mt-1.5 flex gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                      <span className="bg-strong/15 px-1.5 py-0.5 text-strong">Strong</span>
                    </div>
                  </div>
                </li>
                <li className="grid grid-cols-[1.75rem_1fr] gap-1">
                  <span className="font-mono text-xs text-muted-foreground">02</span>
                  <div>
                    <p className="leading-relaxed">
                      Analysts dispute how soon costs reach parity<Chip>S2</Chip>
                      <Chip>S5</Chip>.
                    </p>
                    <div className="mt-1.5 flex gap-1.5 font-mono text-[10px] uppercase tracking-wider">
                      <span className="bg-weak/15 px-1.5 py-0.5 text-weak">Weak</span>
                      <span className="bg-muted px-1.5 py-0.5 text-muted-foreground">Contested</span>
                    </div>
                  </div>
                </li>
              </ol>
            </div>
            <div className="border-t border-border pt-4">
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Evidence gaps</div>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                No retrieved source reports long-term degradation data beyond pilot scale.
              </p>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        Illustrative layout — sample content, not a real report
      </figcaption>
    </figure>
  );
}

function Landing() {
  return (
    <main className="landing-uniform">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-12 sm:gap-12 sm:px-6 sm:pb-24 sm:pt-16 md:pt-24 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="rise-in" style={{ "--i": 0 } as React.CSSProperties}>
              <Eyebrow>AI research engine</Eyebrow>
            </div>
            <h1
              className="rise-in mt-5 text-[3.25rem] leading-[0.98] tracking-tight sm:text-6xl md:text-7xl lg:text-[5.5rem]"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              Research that
              <br />
              <em className="text-muted-foreground">shows its work.</em>
            </h1>
            <p
              className="rise-in mt-7 max-w-xl text-lg leading-relaxed text-muted-foreground"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              Parallax gathers sources on any question, reads them, and writes a report where every claim is cited and
              every gap is named. So you can check the answer, not just trust it.
            </p>
            <div className="rise-in mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" style={{ "--i": 3 } as React.CSSProperties}>
              <Button asChild size="lg" className="group h-12 px-7 text-base">
                <Link to="/research">
                  Start researching
                  <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </Link>
              </Button>
              <Button asChild variant="ghost" size="lg" className="h-12 px-5 text-base">
                <a href="#how-it-works">How it works</a>
              </Button>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <ParallaxMark interactive className="w-full max-w-[16rem] text-foreground sm:max-w-sm lg:max-w-md" />
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-24">
        <div className="reveal max-w-2xl">
          <Eyebrow>The standard</Eyebrow>
          <h2 className="mt-4 text-4xl leading-tight md:text-5xl">An answer is only as good as what stands behind it.</h2>
        </div>
        <div className="mt-14 grid border-l border-t border-border md:grid-cols-3">
          {PRINCIPLES.map((p, i) => (
            <div key={p.title} className="reveal border-b border-r border-border p-6 sm:p-8 transition-colors duration-300 hover:bg-muted/60">
              <div className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</div>
              <h3 className="mt-6 text-3xl">{p.title}</h3>
              <p className="mt-3 leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sample report */}
      <section className="border-y border-border bg-muted/50">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-24">
          <div className="reveal mx-auto max-w-2xl text-center">
            <Eyebrow>The report</Eyebrow>
            <h2 className="mt-4 text-4xl leading-tight md:text-5xl">Built to be checked.</h2>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Findings are rated by the strength of their evidence. Inferences are labelled as interpretation. What the
              sources couldn't answer is listed, not hidden.
            </p>
          </div>
          <div className="mt-14">
            <SampleReport />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-20 bg-foreground text-background">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-24">
          <div className="reveal max-w-2xl">
            <Eyebrow inverse>How it works</Eyebrow>
            <h2 className="mt-4 text-4xl leading-tight md:text-5xl">From question to cited report in three steps.</h2>
          </div>
          <ol className="mt-14 grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((s, i) => (
              <li key={s.title} className="reveal border-t border-background/25 pt-6">
                <div className="font-mono text-xs text-background/60">{String(i + 1).padStart(2, "0")}</div>
                <h3 className="mt-4 text-3xl">{s.title}</h3>
                <p className="mt-3 leading-relaxed text-background/70">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="reveal mt-16 grid gap-px border border-background/25 bg-background/25 md:grid-cols-3">
            {DEPTHS.map((d) => (
              <div key={d.name} className="bg-foreground p-6">
                <div className="font-mono text-xs uppercase tracking-widest text-background/60">Depth</div>
                <div className="mt-2 font-serif text-2xl">{d.name}</div>
                <p className="mt-1 text-sm text-background/70">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Anatomy */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:px-6 sm:py-24">
        <div className="reveal max-w-2xl">
          <Eyebrow>Inside every report</Eyebrow>
          <h2 className="mt-4 text-4xl leading-tight md:text-5xl">More than a summary.</h2>
        </div>
        <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {ANATOMY.map((a) => (
            <div key={a.title} className="reveal border-t border-foreground pt-5">
              <h3 className="text-2xl">{a.title}</h3>
              <p className="mt-2 leading-relaxed text-muted-foreground">{a.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section className="border-t border-border">
        <div className="reveal mx-auto flex max-w-3xl flex-col items-center px-5 py-20 sm:px-6 sm:py-28 text-center">
          <ParallaxMark className="h-14 w-auto" />
          <h2 className="mt-8 text-5xl leading-[1.02] md:text-6xl">
            Ask a harder question.
            <br />
            <em className="text-muted-foreground">See the evidence.</em>
          </h2>
          <Button asChild size="lg" className="group mt-10 h-12 px-7 text-base">
            <Link to="/research">
              Start researching
              <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-6 sm:py-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2.5 text-foreground">
            <ParallaxMark className="h-5 w-auto" />
            <span className="landing-uniform font-serif text-xl font-semibold leading-none">Parallax</span>
          </div>
          <nav className="flex gap-2">
            <Link to="/research" className="px-2 py-2 transition-colors hover:text-foreground">Workspace</Link>
            <Link to="/auth" className="px-2 py-2 transition-colors hover:text-foreground">Sign in</Link>
            <Link to="/privacy" className="px-2 py-2 transition-colors hover:text-foreground">Privacy Policy</Link>
            <Link to="/terms" className="px-2 py-2 transition-colors hover:text-foreground">Terms of Service</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
