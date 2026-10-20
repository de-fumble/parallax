import type { OrgEvent } from "./db";

// Turn a recorded event into words, for the activity feed and the audit log.

const VERBS: Record<string, string> = {
  "project.created": "created the project",
  "project.members_changed": "changed who can see",
  "draft.started": "started a draft of",
  "revision.added": "saved a revision of",
  "draft.closed": "closed the draft",
  "draft.close_requested": "asked to close the draft",
  "draft.close_declined": "kept open the draft",
  "draft.reopened": "reopened the draft",
  "review.closed": "closed",
  "review.opened": "opened",
  "review.approved": "approved",
  "review.changes_requested": "requested changes on",
  "review.rejected": "rejected",
  "review.resubmitted": "resubmitted",
  "review.approvals_dismissed": "changed, which reset approvals on",
  "review.reminder_sent": "sent a reminder about",
  "comment.added": "commented on",
  "document.filed": "filed",
  "document.owners_changed": "changed section owners of",
  "milestone.created": "created the milestone",
  "task.completed": "completed the task",
  "task.reopened": "reopened the task",
  "member.role_changed": "changed the role of",
  "org.branding_changed": "changed the organization's branding",
};

export function describeEvent(e: OrgEvent): string {
  const verb = VERBS[e.action] ?? e.action;
  const detail = e.detail as { stage?: string; version?: number; from?: string; to?: string; section?: string };
  let extra = "";
  if (e.action === "review.approved" && detail.stage) extra = detail.stage === "manager" ? " (stage 1)" : " (final)";
  if (e.action === "document.filed" && detail.version) extra = ` as version ${detail.version}`;
  if (e.action === "member.role_changed" && detail.to) extra = ` to ${detail.to}`;
  if (e.action === "comment.added" && detail.section) extra = ` (${detail.section})`;
  return `${verb} ${e.target_label ?? ""}${extra}`.trim();
}
