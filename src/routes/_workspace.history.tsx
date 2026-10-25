import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { reportListQuery, reportQuery, type ReportSummary } from "@/lib/reports.queries";
import { canManage, orgMembersQuery } from "@/lib/organizations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_workspace/history")({
  head: () => ({
    meta: [
      { title: "Report history — Parallax" },
      { name: "description", content: "Your saved Parallax research reports." },
    ],
  }),
  component: History,
});

const DEPTHS = ["ALL", "LIGHT", "MEDIUM", "DEEP"] as const;

function History() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { org, orgId } = useWorkspace();
  const list = useQuery({ ...reportListQuery(user?.id ?? "", orgId), enabled: !!user });
  const members = useQuery({ ...orgMembersQuery(orgId ?? ""), enabled: !!orgId });
  const authorOf = (userId: string) => {
    if (userId === user?.id) return "You";
    const m = members.data?.find((x) => x.user_id === userId);
    return m?.full_name || m?.email || "A former member";
  };
  // In an organization, only a report's author and the people who run the organization may delete it.
  const canDelete = (userId: string) => !org || userId === user?.id || canManage(org.role);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [depth, setDepth] = useState<(typeof DEPTHS)[number]>("ALL");

  // Remove the row straight away; put it back if the delete fails.
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onMutate: async (id) => {
      const key = reportListQuery(user?.id ?? "", orgId).queryKey;
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (rows: ReportSummary[] | undefined) => rows?.filter((r) => r.id !== id));
      return { key, previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.key, ctx.previous);
      toast.error("Couldn't delete the report", { description: err.message });
    },
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: reportQuery(id).queryKey });
      toast.success("Report deleted");
    },
  });

  const rows = list.data;
  const visible = useMemo(() => {
    const needle = text.trim().toLowerCase();
    return rows?.filter(
      (r) =>
        (depth === "ALL" || r.mode === depth) &&
        (!needle || `${r.title ?? ""} ${r.topic}`.toLowerCase().includes(needle)),
    );
  }, [rows, text, depth]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="hidden text-3xl leading-tight sm:text-4xl md:block">History</h1>
          <p className="text-sm text-muted-foreground md:mt-2 md:text-base">
            {rows ? `${rows.length} ${rows.length === 1 ? "report" : "reports"} in ${org ? org.name : "your personal workspace"}` : "Saved reports"}
          </p>
        </div>
        <Button asChild className="hidden md:inline-flex">
          <Link to="/research"><Plus /> New research</Link>
        </Button>
      </div>

      {rows && rows.length > 0 && (
        <div className="mt-4 space-y-3 md:mt-8 md:flex md:flex-wrap md:items-center md:gap-3 md:space-y-0">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground md:left-3" />
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search" className="pl-10 max-md:rounded-2xl md:pl-9" aria-label="Filter reports" />
          </div>
          <div role="radiogroup" aria-label="Depth" className="flex rounded-full bg-muted/70 p-1 md:rounded-none md:border md:border-border md:bg-transparent md:p-0">
            {DEPTHS.map((d) => (
              <button key={d} type="button" role="radio" aria-checked={depth === d} onClick={() => setDepth(d)}
                className={`flex-1 rounded-full px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-all duration-200 md:flex-none md:rounded-none md:py-2 md:text-[10px] ${depth === d ? "bg-background text-foreground shadow-sm md:bg-foreground md:text-background md:shadow-none" : "text-muted-foreground hover:text-foreground"}`}>
                {d === "ALL" ? "All" : d}
              </button>
            ))}
          </div>
        </div>
      )}

      {list.isPending && (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-2xl bg-card md:rounded-none md:border-y md:border-border md:bg-transparent" aria-label="Loading reports">
          {[0, 1, 2, 3, 4].map((i) => (
            <li key={i} className="flex items-center gap-3 p-4 md:px-0">
              <Skeleton className="size-11 shrink-0 rounded-xl md:hidden" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5" style={{ width: `${80 - i * 9}%` }} />
                <Skeleton className="h-3 w-40" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.isError && (
        <div role="alert" className="mt-6 border border-weak/40 bg-weak/5 p-4 text-sm">
          <p>Couldn't load your reports: {list.error.message}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => list.refetch()}>Try again</Button>
        </div>
      )}

      {rows?.length === 0 && (
        <div className="mt-8 border border-dashed border-border p-10 text-center animate-in fade-in duration-300">
          <p className="font-serif text-2xl">No reports yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {org ? `Research run in ${org.name} is saved here for every member.` : "Every report you run is saved here."}
          </p>
          <Button asChild className="mt-5"><Link to="/research">Run your first one</Link></Button>
        </div>
      )}

      {rows && rows.length > 0 && visible?.length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">
          No reports match.{" "}
          <button type="button" className="underline" onClick={() => { setText(""); setDepth("ALL"); }}>Clear filters</button>
        </p>
      )}

      {visible && visible.length > 0 && (
        <ul className="mt-5 divide-y divide-border/60 overflow-hidden rounded-2xl bg-card shadow-sm animate-in fade-in duration-300 md:mt-6 md:divide-border md:rounded-none md:border-y md:border-border md:bg-transparent md:shadow-none">
          {visible.map((r) => (
            <li key={r.id} className="group flex items-center gap-1 pr-2 md:gap-4 md:py-4 md:pr-0">
              <Link
                to="/reports/$id"
                params={{ id: r.id }}
                className="press flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 active:bg-muted/60 md:block md:px-0 md:py-0 md:active:bg-transparent"
                onMouseEnter={() => queryClient.prefetchQuery(reportQuery(r.id))}
                onFocus={() => queryClient.prefetchQuery(reportQuery(r.id))}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground md:hidden">
                  <FileText className="size-5" strokeWidth={1.75} />
                </span>
                <span className="block min-w-0 flex-1">
                  {/* Two lines of title on a phone, where one line shows too little of it. */}
                  <span className="line-clamp-2 block text-[17px] font-medium leading-snug tracking-tight md:font-serif md:text-xl md:font-normal md:decoration-1 md:underline-offset-4 md:group-hover:underline md:line-clamp-1">{r.title || r.topic}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-muted-foreground md:mt-1 md:font-mono md:text-xs">
                    <span className="md:hidden">{new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                    <span className="hidden md:inline">{new Date(r.created_at).toLocaleString()}</span>
                    {" · "}<span className="capitalize md:normal-case">{r.mode.toLowerCase()}</span>
                    {org && ` · ${authorOf(r.user_id)}`}
                    <span className="hidden md:inline">
                      {r.status && ` · ${r.status.replace("_", " ")}`}
                      {r.confidence && ` · ${r.confidence} confidence`}
                    </span>
                  </span>
                </span>
              </Link>
              {!canDelete(r.user_id) ? null : confirming === r.id ? (
                <div className="flex shrink-0 items-center gap-1 animate-in fade-in slide-in-from-right-1 duration-200">
                  <Button variant="destructive" size="sm" onClick={() => { setConfirming(null); remove.mutate(r.id); }}>Delete</Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>Cancel</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" className="shrink-0 text-muted-foreground max-md:size-10 max-md:px-0" aria-label={`Delete ${r.title || r.topic}`} onClick={() => setConfirming(r.id)}>
                  <Trash2 className="md:hidden" />
                  <span className="hidden md:inline">Delete</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
