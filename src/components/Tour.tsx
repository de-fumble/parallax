import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { canManage, isManager, type OrgRole } from "@/lib/organizations";
import { reportListQuery } from "@/lib/reports.queries";
import { projectsQuery } from "@/lib/collab/db";
import { Button } from "@/components/ui/button";

// A guided tour of Parallax: it moves from page to page, lights up the part
// of the screen each step is about, and explains it. The steps adapt to the
// workspace (personal or an organization) and to the person's role.

type Step = {
  id: string;
  /** The page the step is on. */
  path: string;
  /** What to light up. Without one, or when it isn't on screen, the step is a card in the middle. */
  target?: string;
  /** Leave the step out when its target isn't there (for parts only some people see). */
  optional?: boolean;
  title: string;
  body: ReactNode;
};

type Context = { orgName: string | null; role: OrgRole | undefined; latestReport: string | null; hasProjects: boolean };

function buildSteps({ orgName, role, latestReport, hasProjects }: Context): Step[] {
  const inOrg = !!orgName;
  const steps: Step[] = [
    {
      id: "welcome",
      path: "/research",
      title: "Welcome to Parallax",
      body: (
        <>
          Parallax researches a question across the web and your own documents, then writes a report in which every claim points to its
          source. This tour shows you around in about two minutes{inOrg ? `, including how ${orgName} works together` : ""}. Use the
          buttons below or your arrow keys.
        </>
      ),
    },
    {
      id: "workspace",
      path: "/research",
      target: '[data-tour="workspace"]',
      title: "Your workspaces",
      body: (
        <>
          Everyone has a personal workspace, and can create or join organizations as well. Switch between them here. A report belongs to
          the workspace that was open when you researched it{inOrg ? ", and the organization's colours and logo follow you while you're in it" : ""}.
        </>
      ),
    },
    {
      id: "question",
      path: "/research",
      target: '[data-tour="question"]',
      title: "1. Ask a question",
      body: (
        <>
          Type your question here. Use Context in the toolbar to say who it's for, a place, a timeframe or a goal. Press
          <kbd className="rounded-md mx-1 border border-border px-1 font-mono text-[11px]">⌘ Enter</kbd> to run it.
        </>
      ),
    },
    {
      id: "sources",
      path: "/research",
      target: '[data-tour="sources"]',
      title: "2. Choose the sources",
      body: (
        <>
          Web search is on by default. Add your own documents with Files (PDF, Word, Markdown or text, up to 20), or Paste text. Switch Web
          off to research only what you provide; you can also drop files straight onto the box.
        </>
      ),
    },
    {
      id: "depth",
      path: "/research",
      target: '[data-tour="depth"]',
      title: "3. Pick a depth",
      body: <>Light is a quick scan. Medium is the everyday choice. Deep reads the most sources and writes the fullest report, so it takes longer.</>,
    },
    // The research page only offers this inside an organization that has projects.
    ...(!inOrg || !hasProjects ? [] : [{
      id: "draft-target",
      path: "/research",
      target: '[data-tour="draft-target"]',
      optional: true,
      title: "Research straight into a project",
      body: <>Pick a project under Options and the finished report arrives as a draft there, ready to edit and send for review.</>,
    }]),
    {
      id: "run",
      path: "/research",
      target: '[data-tour="run"]',
      title: "4. Run it",
      body: (
        <>
          Once it's running you can leave the page: progress shows in the sidebar, and if the AI provider has a hiccup Parallax keeps your
          progress and retries on its own.
        </>
      ),
    },
    {
      id: "search",
      path: "/research",
      target: '[data-tour="search"]',
      title: "Find anything",
      body: (
        <>
          Search reports and jump between pages. Press <kbd className="rounded-md mx-1 border border-border px-1 font-mono text-[11px]">⌘ K</kbd> from
          anywhere.
        </>
      ),
    },
    {
      id: "history",
      path: "/history",
      target: "h1",
      title: "History",
      body: <>Every report in this workspace, newest first. Open one to read it, or delete what you no longer need.</>,
    },
    latestReport
      ? {
          id: "report",
          path: `/reports/${latestReport}`,
          target: '[data-tour="report-toolbar"]',
          title: "Reading and sharing a report",
          body: (
            <>
              Bracketed IDs such as [S1] link each claim to its source. Click a section to edit it, then reorder or hide sections and save:
              that's the version that gets printed. From here you can export a PDF, Word, Markdown or raw data, or print.
            </>
          ),
        }
      : {
          id: "report",
          path: "/history",
          title: "Reading and sharing a report",
          body: (
            <>
              When your first report is ready, bracketed IDs such as [S1] link each claim to its source. You can click a section to edit it,
              reorder or hide sections, and export a PDF, Word, Markdown or raw data, or print.
            </>
          ),
        },
  ];

  if (!inOrg) {
    steps.push({
      id: "team",
      path: "/research",
      target: '[data-tour="workspace"]',
      title: "Working with a team",
      body: (
        <>
          Create an organization, or join one with an invite link, from this menu. Inside an organization you get Collaboration: projects,
          drafts, reviews and a shared library. Take this tour again from there to see it.
        </>
      ),
    });
  } else {
    steps.push(
      {
        id: "collab",
        path: "/org",
        target: '[data-tour="org-tabs"]',
        title: "Team",
        body: (
          <>
            {orgName} handles research the way software teams handle code: projects hold drafts, drafts go to review, and approved work is
            filed into the library. Board, Insights and the audit log are under More; Inbox, Members and Settings are the icons on the right.
          </>
        ),
      },
      {
        id: "projects",
        path: "/org/projects",
        target: "[data-page-title]",
        title: "Projects",
        body: (
          <>
            A project holds a line of research: its documents, drafts and reviews. Anyone can start one. A project can be open to the whole
            organization or restricted to the people added to it.
          </>
        ),
      },
      {
        id: "drafts",
        path: "/org/drafts",
        target: "[data-page-title]",
        title: "Drafts",
        body: (
          <>
            A draft is your working copy of a document. Save revisions as you go, compare with the filed version, and pull in sections from
            any report. Drafts sit under Open, In review, Closed or Filed.{" "}
            {isManager(role)
              ? "You can close drafts by people below your role, and your own; a closed draft can be reopened."
              : "To close one of your drafts, ask a manager, head of department or owner from the draft's page."}
          </>
        ),
      },
      {
        id: "reviews",
        path: "/org/reviews",
        target: "[data-page-title]",
        title: "Review requests",
        body: (
          <>
            When a draft is ready, ask for review. Work by interns and assistants goes to a Research Manager first, then a head of department
            gives final approval and files it. Reviewers comment on sections, suggest wording and mention people. Changing a draft after
            approval sends it back to the first stage.
          </>
        ),
      },
      {
        id: "board",
        path: "/org/board",
        target: "[data-page-title]",
        title: "Research board",
        body: <>Every piece of work from draft to filed, in columns. Cards move on their own as work is submitted, reviewed and filed.</>,
      },
      {
        id: "library",
        path: "/org/library",
        target: "[data-page-title]",
        title: "Library",
        body: <>Approved research, filed and searchable by everyone. Each document keeps every version it has had, and who filed it.</>,
      },
      {
        id: "inbox",
        path: "/org/inbox",
        target: "[data-page-title]",
        title: "Inbox",
        body: <>Review requests, mentions, comments, requests to close a draft and status changes land here. Reviewers are reminded once a day about work waiting on them.</>,
      },
      {
        id: "settings",
        path: "/org/settings",
        target: "[data-page-title]",
        title: "Settings",
        body: isManager(role) ? (
          <>Set the organization's two-toned theme, logo, favicon and the logo on printed documents. Below that is what each role can do, and how a request is approved.</>
        ) : (
          <>What each role can do, and how a request is approved. The database enforces these rules.</>
        ),
      },
      {
        id: "members",
        path: "/organization",
        target: '[data-tour="members"]',
        title: "Members and roles",
        body: canManage(role) ? (
          <>Invite people with a link, choose their role (Intern, Assistant, Research Manager, head of department) and change roles later.</>
        ) : (
          <>Who's in the organization and their roles. Owners and heads of department invite people and change roles.</>
        ),
      },
    );
  }

  steps.push({
    id: "done",
    path: "/research",
    title: "You're ready",
    body: <>That's the tour. Start with a question on this page. You can take it again any time from your account menu at the bottom of the sidebar.</>,
  });
  return steps;
}

// ---------------------------------------------------------------------------
// State: whether the tour is running, and which step it's on.
// ---------------------------------------------------------------------------

type TourState = { start: () => void; active: boolean };
const TourContext = createContext<TourState>({ start: () => {}, active: false });
export const useTour = () => useContext(TourContext);

const seenKey = (userId: string) => `parallax:tour-seen:${userId}`;

export function TourProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { org, orgId } = useWorkspace();
  const reports = useQuery({ ...reportListQuery(user?.id ?? "", orgId), enabled: !!user });
  const projects = useQuery({ ...projectsQuery(orgId ?? ""), enabled: !!orgId });
  const [index, setIndex] = useState<number | null>(null);

  // The steps are fixed when the tour starts, so they don't shift under the person mid-tour.
  const [steps, setSteps] = useState<Step[]>([]);
  const context: Context = { orgName: org?.name ?? null, role: org?.role, latestReport: reports.data?.[0]?.id ?? null, hasProjects: (projects.data?.length ?? 0) > 0 };
  const contextRef = useRef(context);
  contextRef.current = context;

  const start = useCallback(() => {
    setSteps(buildSteps(contextRef.current));
    setIndex(0);
  }, []);

  const finish = useCallback(() => {
    setIndex(null);
    if (user) {
      try {
        window.localStorage.setItem(seenKey(user.id), "1");
      } catch {
        // Private browsing: the offer may simply come back next time.
      }
    }
  }, [user]);

  // Offer the tour once, on someone's first visit to the workspace.
  useEffect(() => {
    if (!user) return;
    let seen = true;
    try {
      seen = !!window.localStorage.getItem(seenKey(user.id));
    } catch {
      return;
    }
    if (seen) return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(seenKey(user.id), "1");
      } catch {
        // Shown anyway; it may be offered again next time.
      }
      toast("New to Parallax?", {
        description: "Take a two-minute tour of research, reports and collaboration.",
        action: { label: "Take the tour", onClick: () => start() },
        duration: 15_000,
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [user, start]);

  const value = useMemo(() => ({ start, active: index !== null }), [start, index]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {index !== null && steps[index] && (
        <TourStep
          step={steps[index]}
          index={index}
          total={steps.length}
          nextPath={steps[index + 1]?.path ?? null}
          onBack={() => setIndex((i) => Math.max(0, (i ?? 0) - 1))}
          onNext={() => (index + 1 >= steps.length ? finish() : setIndex(index + 1))}
          // An optional step whose part isn't on screen is left out, so the count stays continuous,
          // and the tour carries on in the direction it was going.
          onMissing={(forward) => {
            const rest = steps.filter((_, i) => i !== index);
            setSteps(rest);
            setIndex(forward ? (index < rest.length ? index : null) : Math.max(0, index - 1));
          }}
          onClose={finish}
        />
      )}
    </TourContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// One step: go to its page, find its target, light it up and explain it.
// ---------------------------------------------------------------------------

type Rect = { top: number; left: number; width: number; height: number };
const PAD = 8;
const CARD_WIDTH = 360;

let lastDirection = true;

function visibleRect(el: Element): Rect | null {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  // Off the side of the screen: the sidebar drawer on a phone, for one.
  if (r.right <= 0 || r.left >= window.innerWidth) return null;
  const style = window.getComputedStyle(el);
  if (style.visibility === "hidden" || style.display === "none") return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function TourStep({ step, index, total, nextPath, onBack, onNext, onMissing, onClose }: {
  step: Step;
  index: number;
  total: number;
  /** The next step's page, loaded ahead so moving to it is instant. */
  nextPath: string | null;
  onBack: () => void;
  onNext: () => void;
  onMissing: (forward: boolean) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // Where the spotlight is, and which step it belongs to. The card's words change the moment
  // Next is pressed; the spotlight and the card then glide to the new spot once it's on screen.
  const [spotFor, setSpotFor] = useState<{ id: string; path: string; rect: Rect | null } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [cardHeight, setCardHeight] = useState(240);
  // The parent hands a new callback each render; the search below shouldn't restart for it.
  const missing = useRef(onMissing);
  missing.current = onMissing;
  const [viewport, setViewport] = useState({ w: 0, h: 0 });

  // Go to the step's page. No cross-fade: the browser would fade the tour out and back in with the page.
  useEffect(() => {
    if (pathname !== step.path) void router.navigate({ href: step.path, viewTransition: false });
  }, [step.path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load the next step's page in the background, so Next doesn't wait on it.
  useEffect(() => {
    if (nextPath && nextPath !== step.path) void router.preloadRoute({ to: nextPath } as Parameters<typeof router.preloadRoute>[0]).catch(() => undefined);
  }, [nextPath, step.path, router]);

  // Find the target as soon as the page has drawn it, bring it into view, and follow it as the page moves.
  useEffect(() => {
    if (pathname !== step.path) return;
    let found: Element | null = null;
    let raf = 0;
    let frame = 0;
    let cancelled = false;
    const place = (rect: Rect | null) => setSpotFor({ id: step.id, path: step.path, rect });
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (found && !cancelled) place(visibleRect(found));
      });
    };
    if (!step.target) {
      place(null);
      return;
    }
    const started = performance.now();
    const observer = new ResizeObserver(measure);
    const look = () => {
      if (cancelled) return;
      const el = document.querySelector(step.target!);
      const r = el ? visibleRect(el) : null;
      if (el && r) {
        found = el;
        const inView = r.top >= 0 && r.top + r.height <= window.innerHeight;
        // "instant": the page's own smooth scrolling would make the spotlight chase the target.
        if (!inView) el.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior });
        place(visibleRect(el));
        // Content that loads in after the target shifts it: follow along.
        observer.observe(el);
        observer.observe(document.body);
      } else if (performance.now() - started > 3000) {
        if (step.optional) missing.current(lastDirection);
        else place(null);
      } else {
        raf = requestAnimationFrame(look);
      }
    };
    look();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step.id, step.target, step.path, pathname, step.optional]);

  useLayoutEffect(() => {
    const update = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // The card's height decides where it fits; measured after each change of words.
  useLayoutEffect(() => {
    if (card.current) setCardHeight(card.current.offsetHeight);
  }, [step.id, viewport.w]);

  // Keyboard: arrows move, Escape ends.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") {
        lastDirection = true;
        onNext();
      } else if (e.key === "ArrowLeft" && index > 0) {
        lastDirection = false;
        onBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, onBack, onNext, onClose]);
  // Focus follows the step, so screen readers announce each one.
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
  }, [step.id]);

  const current = spotFor?.id === step.id;
  const rect = spotFor?.rect ?? null;
  const spot = rect ? { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 } : null;
  // Waiting for another page: the window closes to its centre, so it never frames the wrong thing.
  const leaving = !current && spotFor !== null && spotFor.path !== step.path;
  const hole = spot && leaving ? { top: spot.top + spot.height / 2, left: spot.left + spot.width / 2, width: 0, height: 0 } : spot;

  // The card's place, always as top and left so a move between steps can glide.
  // Beside the lit-up part where there's room, below or above it otherwise, centred without one;
  // a sheet along the bottom on phones. Until the new spot is known, it stays where it was.
  const phone = viewport.w > 0 && viewport.w < 640;
  const lastPlace = useRef<{ top: number; left: number; width: number } | null>(null);
  let place: { top: number; left: number; width: number };
  const centred = () => {
    const width = Math.min(CARD_WIDTH + 80, viewport.w - 32);
    return { top: Math.max(16, (viewport.h - cardHeight) / 2), left: (viewport.w - width) / 2, width };
  };
  if (!current && lastPlace.current) {
    place = lastPlace.current;
  } else if (!spot) {
    place = centred();
  } else {
    const width = CARD_WIDTH;
    const clampLeft = (x: number) => Math.min(Math.max(16, x), viewport.w - width - 16);
    const clampTop = (y: number) => Math.min(Math.max(16, y), viewport.h - cardHeight - 16);
    if (spot.left + spot.width + 16 + width <= viewport.w - 16 && spot.width < viewport.w * 0.5) {
      place = { top: clampTop(spot.top), left: spot.left + spot.width + 16, width };
    } else if (viewport.h - (spot.top + spot.height) > cardHeight + 28) {
      place = { top: spot.top + spot.height + 12, left: clampLeft(spot.left), width };
    } else if (spot.top > cardHeight + 28) {
      place = { top: spot.top - cardHeight - 12, left: clampLeft(spot.left), width };
    } else {
      place = { top: viewport.h - cardHeight - 16, left: viewport.w - width - 16, width };
    }
  }
  if (current) lastPlace.current = place;
  const position: React.CSSProperties = phone
    ? { left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom))" }
    : { top: place.top, left: place.left, width: place.width };

  const last = index === total - 1;
  const glide = "transition-[top,left,width,height] duration-[260ms] ease-out motion-reduce:transition-none";

  return createPortal(
    // Its own view-transition layer, so no page cross-fade ever carries the tour with it.
    <div className="fixed inset-0 z-[100]" style={{ viewTransitionName: "tour" }}>
      {/* The dimmed page, with a window cut out around the part being explained. */}
      {hole ? (
        <div
          className={`rounded-xl pointer-events-none fixed border-2 border-white/90 ${glide}`}
          style={{ ...hole, boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)", borderColor: hole.width ? undefined : "transparent" }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/55" />
      )}
      {/* Clicks outside the card don't reach the page while the tour is open. */}
      <div className="fixed inset-0" onClick={(e) => e.stopPropagation()} />

      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        className={`rounded-xl fixed border border-border bg-popover text-popover-foreground shadow-2xl outline-none ${phone ? "" : glide}`}
        style={position}
      >
        <div key={step.id} className="animate-in fade-in-0 duration-150">
          <div className="flex items-start justify-between gap-3 px-5 pt-4">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {index + 1} of {total} · <span className="normal-case tracking-normal">{step.path.startsWith("/reports/") ? "/reports/…" : step.path}</span>
              </p>
              <h2 id="tour-title" className="mt-1 text-2xl leading-tight">{step.title}</h2>
            </div>
            <Button variant="ghost" size="icon" className="-mr-2 size-9 shrink-0" aria-label="End the tour" onClick={onClose}><X /></Button>
          </div>
          <div id="tour-body" className="px-5 pt-2 text-sm leading-relaxed text-muted-foreground">
            {step.body}
          </div>
        </div>
        <div className="mt-4 h-0.5 bg-muted">
          <div className="h-full bg-primary transition-all duration-300" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-muted-foreground">
            {last ? "Close" : "Skip tour"}
          </Button>
          <div className="flex gap-2">
            {index > 0 && (
              <Button variant="outline" size="sm" onClick={() => { lastDirection = false; onBack(); }}>
                <ArrowLeft /> Back
              </Button>
            )}
            <Button size="sm" onClick={() => { lastDirection = true; onNext(); }}>
              {last ? "Finish" : "Next"} {!last && <ArrowRight />}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
