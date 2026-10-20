import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { isManager } from "@/lib/organizations";
import { eventsQuery, projectsQuery } from "@/lib/collab/db";
import { describeEvent } from "@/lib/collab/events";
import { Empty, PageTitle, selectClass, timeAgo, useCollab, usePeople } from "@/components/collab/kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_workspace/org/audit")({
  component: Audit,
});

function Audit() {
  const { orgId, role, members } = useCollab();
  const person = usePeople();
  const events = useQuery(eventsQuery(orgId, 1000));
  const projects = useQuery(projectsQuery(orgId));
  const [action, setAction] = useState("all");
  const [actor, setActor] = useState("all");

  if (!isManager(role)) return <p className="text-sm text-muted-foreground">The audit log is for Research Managers and heads of department.</p>;

  const all = events.data ?? [];
  const actions = [...new Set(all.map((e) => e.action.split(".")[0]!))].sort();
  const shown = all.filter((e) => (action === "all" || e.action.startsWith(`${action}.`)) && (actor === "all" || e.actor_id === actor));

  function exportCsv() {
    const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      ["When", "Who", "Action", "On", "Project", "Detail"].join(","),
      ...shown.map((e) =>
        [e.created_at, person(e.actor_id).name, e.action, e.target_label, projects.data?.find((p) => p.id === e.project_id)?.name ?? "", JSON.stringify(e.detail)].map(cell).join(","),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `parallax-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Audit log"
        sub="A permanent record of who did what, and when. Entries can't be edited or deleted."
        actions={<Button variant="outline" disabled={!shown.length} onClick={exportCsv}><Download /> Export CSV</Button>}
      />
      <div className="flex flex-wrap gap-2">
        <select aria-label="Action" value={action} onChange={(e) => setAction(e.target.value)} className={selectClass}>
          <option value="all">All actions</option>
          {actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select aria-label="Who" value={actor} onChange={(e) => setActor(e.target.value)} className={selectClass}>
          <option value="all">Everyone</option>
          {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto border border-border bg-card">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="border-b border-border bg-muted/40 text-left font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-normal">When</th>
              <th className="px-4 py-2 font-normal">Who</th>
              <th className="px-4 py-2 font-normal">What</th>
              <th className="px-4 py-2 font-normal">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground" title={new Date(e.created_at).toLocaleString()}>{timeAgo(e.created_at)}</td>
                <td className="whitespace-nowrap px-4 py-2.5">{e.actor_id ? person(e.actor_id).name : "Parallax (automatic)"}</td>
                <td className="px-4 py-2.5">{describeEvent(e)}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{e.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <Empty>No entries yet.</Empty>}
      </div>
    </div>
  );
}
