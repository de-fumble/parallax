import { createContext, useCallback, useContext, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Organization, OrgMember, OrgRole } from "@/lib/organizations";
import { collabKey, REVIEW_STATUS, type ReviewStatus } from "@/lib/collab/db";

// Shared pieces for the collaboration pages.

// ---------------------------------------------------------------------------
// Context: the organization, the signed-in person and everyone in it.
// ---------------------------------------------------------------------------

export type Collab = {
  org: Organization;
  orgId: string;
  role: OrgRole;
  me: string;
  members: OrgMember[];
};

const CollabContext = createContext<Collab | null>(null);

export function CollabProvider({ value, children }: { value: Collab; children: ReactNode }) {
  return <CollabContext.Provider value={value}>{children}</CollabContext.Provider>;
}

export function useCollab(): Collab {
  const value = useContext(CollabContext);
  if (!value) throw new Error("useCollab must be used inside the collaboration layout");
  return value;
}

export type PersonInfo = { id: string; name: string; initials: string; role: OrgRole | null };

/** A member's name and initials; someone who has left is still named, as a former member. */
export function usePeople() {
  const { members } = useCollab();
  return useCallback(
    (id: string | null | undefined): PersonInfo => {
      const m = members.find((x) => x.user_id === id);
      const name = m ? m.full_name || m.email || "Unknown member" : id ? "A former member" : "Parallax";
      const initials = name
        .replace(/^Dr\.?\s+/i, "")
        .split(/[\s@.]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]!.toUpperCase())
        .join("");
      return { id: id ?? "", name, initials: initials || "?", role: m?.role ?? null };
    },
    [members],
  );
}

/** Run a change, report a failure in plain words, and refresh every collaboration view. */
export function useAction() {
  const queryClient = useQueryClient();
  const { orgId } = useCollab();
  return useCallback(
    async <T,>(work: () => Promise<T>, done?: string): Promise<T | undefined> => {
      try {
        const result = await work();
        await queryClient.invalidateQueries({ queryKey: collabKey(orgId) });
        if (done) toast.success(done);
        return result;
      } catch (err) {
        toast.error("That didn't work", { description: err instanceof Error ? err.message : undefined });
        return undefined;
      }
    },
    [queryClient, orgId],
  );
}

// ---------------------------------------------------------------------------
// Small building blocks
// ---------------------------------------------------------------------------

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const diff = Date.parse(iso) - Date.now();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60_000);
  const text =
    minutes < 1 ? "just now" : minutes < 60 ? `${minutes}m` : minutes < 60 * 24 ? `${Math.round(minutes / 60)}h` : `${Math.round(minutes / 1440)}d`;
  if (text === "just now") return text;
  return diff > 0 ? `in ${text}` : `${text} ago`;
}

/** "5h", "2d": how long something has been waiting. */
export function waited(iso: string | null | undefined) {
  return timeAgo(iso).replace(" ago", "");
}

export function Avatar({ id, size = "md" }: { id: string | null | undefined; size?: "sm" | "md" | "lg" }) {
  const person = usePeople()(id);
  const dims = size === "sm" ? "size-5 text-[9px]" : size === "lg" ? "size-10 text-sm" : "size-7 text-[11px]";
  return (
    <span title={person.name} className={`inline-flex shrink-0 items-center justify-center rounded-full border border-background bg-foreground font-mono text-background ${dims}`}>
      {person.initials}
    </span>
  );
}

export function AvatarStack({ ids, size = "sm" }: { ids: (string | null)[]; size?: "sm" | "md" }) {
  return (
    <span className="flex -space-x-1.5">
      {ids.map((id, i) => (
        <Avatar key={`${id}-${i}`} id={id} size={size} />
      ))}
    </span>
  );
}

const STATUS_STYLE: Record<ReviewStatus | "draft", string> = {
  draft: "border-border bg-muted text-muted-foreground",
  in_review: "border-strong/40 bg-strong/10 text-strong",
  changes_requested: "border-weak/40 bg-weak/10 text-weak",
  filed: "border-foreground bg-foreground text-background",
  closed: "border-border bg-background text-muted-foreground line-through",
};

export function StatusPill({ status }: { status: ReviewStatus | "draft" }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status]}`}>
      {status === "draft" ? "Draft" : REVIEW_STATUS[status]}
    </span>
  );
}

export function LabelChip({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{children}</span>;
}

export function UrgencyChip({ urgency }: { urgency: string }) {
  if (urgency === "Normal" || urgency === "Low") return null;
  const tone = urgency === "Urgent" ? "border-weak/50 text-weak" : "border-moderate/60 text-foreground";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>{urgency}</span>;
}

export function Panel({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="border border-border bg-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function PageTitle({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex flex-wrap items-center gap-2 text-3xl leading-tight [overflow-wrap:anywhere] sm:text-4xl">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}

export function LoadError({ error }: { error: Error }) {
  return <p className="border border-weak/40 bg-weak/5 p-4 text-sm">{error.message}</p>;
}

export const selectClass = "h-11 border border-input bg-background px-2 text-sm md:h-9";
