import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { markRead, notificationsQuery, type Notification } from "@/lib/collab/db";
import { Empty, PageTitle, timeAgo, useAction, useCollab } from "@/components/collab/kit";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_workspace/org/inbox")({
  component: Inbox,
});

const KINDS: { id: Notification["kind"] | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "review_requested", label: "Review requested" },
  { id: "mentioned", label: "Mentioned" },
  { id: "comment", label: "Comments" },
  { id: "assigned", label: "Assigned" },
  { id: "status_changed", label: "Status changed" },
  { id: "reminder", label: "Reminders" },
];

function Inbox() {
  const { orgId, me } = useCollab();
  const act = useAction();
  const navigate = useNavigate();
  const notifications = useQuery(notificationsQuery(orgId, me));
  const [kind, setKind] = useState<(typeof KINDS)[number]["id"]>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const all = notifications.data ?? [];
  const shown = all.filter((n) => (kind === "all" || n.kind === kind) && (!unreadOnly || !n.read_at));
  const unread = all.filter((n) => !n.read_at).map((n) => n.id);

  return (
    <div className="space-y-5">
      <PageTitle
        title="Inbox"
        sub="Review requests, mentions, comments, tasks and reminders for you."
        actions={<Button variant="outline" disabled={!unread.length} onClick={() => void act(() => markRead(unread), "All marked as read")}><Check /> Mark all as read</Button>}
      />
      <div className="flex flex-wrap items-center gap-2">
        {KINDS.map((k) => (
          <button key={k.id} type="button" onClick={() => setKind(k.id)}
            className={`rounded-full border px-3 py-1.5 text-sm ${kind === k.id ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground hover:text-foreground"}`}>
            {k.label}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} className="size-4" /> Unread only
        </label>
      </div>
      <ul className="divide-y divide-border border border-border bg-card">
        {shown.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              onClick={async () => {
                if (!n.read_at) await act(() => markRead([n.id]));
                if (n.link) navigate({ to: n.link });
              }}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-foreground"}`} aria-label={n.read_at ? undefined : "Unread"} />
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${n.read_at ? "" : "font-medium"}`}>{n.title}</div>
                <div className="text-xs text-muted-foreground">{KINDS.find((k) => k.id === n.kind)?.label} · {timeAgo(n.created_at)}</div>
              </div>
            </button>
          </li>
        ))}
        {shown.length === 0 && <li><Empty>{all.length ? "Nothing matches." : "You're all caught up."}</Empty></li>}
      </ul>
    </div>
  );
}
