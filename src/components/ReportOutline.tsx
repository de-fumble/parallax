import { useEffect, useState, type RefObject } from "react";
import { List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Entry = { id: string; title: string };

type Props = {
  container: RefObject<HTMLElement | null>;
  /** Changes whenever the sections on the page do (another report, a reorder, a section hidden), the cue to read them again. */
  revision: string;
  /** Whether to offer the floating "Contents" button on screens too narrow for the side rail. */
  floating?: boolean;
};

// "On this page": lists the sections the report actually has and tracks which
// one is being read. Sections are found in the page itself, so the outline
// can never drift from what is rendered. Wide screens get a rail beside the
// report; narrower ones a "Contents" button in the corner.
export function ReportOutline({ container, revision, floating = true }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [active, setActive] = useState<string>("");

  useEffect(() => {
    const root = container.current;
    if (!root) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>("section[data-outline]"));
    setEntries(sections.map((s) => ({ id: s.id, title: s.dataset["outline"] ?? "" })));

    // A section counts as current once its top passes the upper third of the screen.
    const observer = new IntersectionObserver(
      (changes) => {
        for (const change of changes) if (change.isIntersecting) setActive(change.target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [container, revision]);

  if (entries.length < 3) return null;

  return (
    <>
      <nav aria-label="Document index" className="sticky top-20 xl:top-24 hidden max-h-[calc(100vh-7rem)] overflow-y-auto editorial-scrollbar xl:block print:hidden pb-8">
        <div className="border border-border/75 bg-card/60 p-4 xl:p-5 backdrop-blur-xs shadow-2xs">
          <div className="flex items-center justify-between border-b border-border/60 pb-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>Index // Outline</span>
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px]">{entries.length} sections</span>
          </div>
          <ul className="mt-3 space-y-1">
            {entries.map((e, index) => {
              const isActive = active === e.id;
              return (
                <li key={e.id}>
                  <a
                    href={`#${e.id}`}
                    className={`group flex items-center justify-between gap-2.5 rounded px-2.5 py-1.5 text-xs xl:text-[13px] transition-all duration-150 ${
                      isActive
                        ? "bg-muted font-medium text-foreground shadow-2xs"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`font-mono text-[10px] tabular-nums shrink-0 transition-colors ${isActive ? "text-foreground font-semibold" : "text-muted-foreground/60"}`}>
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="truncate">{e.title}</span>
                    </div>
                    {isActive && (
                      <span className="size-1.5 shrink-0 rounded-full bg-accent" />
                    )}
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="mt-5 border-t border-border/50 pt-3">
            <a
              href="#section-summary"
              className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-muted-foreground/75 hover:text-foreground transition-colors py-1"
            >
              <span>↑ Return to top</span>
              <span className="text-[10px] opacity-60">Top</span>
            </a>
          </div>
        </div>
      </nav>

      {floating && (
        <div className="bottom-safe fixed right-4 z-20 xl:hidden print:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="shadow-lg">
                <List /> Contents
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="max-h-[60dvh] w-60 overflow-y-auto">
              <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">On this page</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {entries.map((e) => (
                <DropdownMenuItem
                  key={e.id}
                  className={active === e.id ? "font-medium" : ""}
                  // Scroll after the menu has closed and released its scroll lock.
                  onSelect={() => setTimeout(() => document.getElementById(e.id)?.scrollIntoView(), 0)}
                >
                  {e.title}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </>
  );
}
