import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import type { Project, ReviewWithApprovals } from "@/lib/collab/db";
import { pendingStage, STAGE_NAMES } from "@/lib/collab/rules";
import { Avatar, LabelChip, StatusPill, UrgencyChip, timeAgo, usePeople, waited } from "@/components/collab/kit";

/** Waiting longer than this is flagged in lists. */
const SLOW_HOURS = 24;

/** One review request in a list, GitHub pull-request style. */
export function ReviewRow({ r, projects }: { r: ReviewWithApprovals; projects: Project[] | undefined }) {
  const person = usePeople();
  const stage = pendingStage(r.approvals);
  const since = stage?.pending_since;
  const slow = since && Date.now() - Date.parse(since) > SLOW_HOURS * 3_600_000;
  return (
    <li>
      <Link to="/org/reviews/$number" params={{ number: String(r.number) }} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
        <Avatar id={r.author_id} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium leading-snug">{r.title}</span>
            <UrgencyChip urgency={r.urgency} />
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            #{r.number} · {projects?.find((p) => p.id === r.project_id)?.name ?? "Project"} · opened {timeAgo(r.created_at)} by {person(r.author_id).name}
          </div>
          {r.labels.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{r.labels.map((l) => <LabelChip key={l}>{l}</LabelChip>)}</div>}
          {r.status === "in_review" && stage && (
            <div className={`mt-1 flex items-center gap-1 text-xs ${slow ? "text-weak" : "text-muted-foreground"}`}>
              <Clock className="size-3" /> Waiting {waited(since)} for the {STAGE_NAMES[stage.stage]}
            </div>
          )}
        </div>
        <StatusPill status={r.status} />
      </Link>
    </li>
  );
}
