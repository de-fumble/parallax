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
      <nav aria-label="On this page" className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto pb-8 xl:block print:hidden">
        <div className="border-l border-border pl-4">
          <div className="pb-2 text-xs font-medium text-foreground">On this page</div>
          <ul className="space-y-0.5">
            {entries.map((e) => {
              const isActive = active === e.id;
              return (
                <li key={e.id} className="relative">
                  {isActive && <span aria-hidden className="absolute -left-[17px] top-1.5 bottom-1.5 w-px bg-foreground" />}
                  <a
                    href={`#${e.id}`}
                    aria-current={isActive ? "location" : undefined}
                    className={`block truncate py-1 text-[13px] transition-colors duration-150 ${
                      isActive ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {e.title}
                  </a>
                </li>
              );
            })}
          </ul>
          <a href="#section-summary" className="mt-4 block text-xs text-muted-foreground transition-colors hover:text-foreground">
            Back to top
          </a>
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
