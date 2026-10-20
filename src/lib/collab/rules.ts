import type { OrgMember, OrgRole } from "@/lib/organizations";
import type { Approval, ReviewRequest } from "./db";

// The approval rules, as the browser needs them to decide which buttons to
// show. The database applies the same rules, so this is about clarity, not
// security.

export const STAGE_NAMES: Record<Approval["stage"], string> = {
  manager: "Research Manager",
  hod: "Head of Department",
};

/** Roles that may act at each stage. */
export const STAGE_ROLES: Record<Approval["stage"], OrgRole[]> = {
  manager: ["manager", "hod", "owner"],
  hod: ["hod", "owner"],
};

export const pendingStage = (approvals: Approval[]) => approvals.find((a) => a.state === "pending");

/** May this person approve, request changes or reject at the stage now waiting? */
export function canDecide(r: ReviewRequest, approvals: Approval[], role: OrgRole, me: string, members: OrgMember[]) {
  const stage = pendingStage(approvals);
  if (r.status !== "in_review" || !stage) return false;
  if (!STAGE_ROLES[stage.stage].includes(role)) return false;
  // Not your own work, unless nobody else could review it.
  if (r.author_id === me) {
    return !members.some((m) => m.user_id !== me && STAGE_ROLES[stage.stage].includes(m.role));
  }
  return true;
}

/** Is a request waiting on this person, given their role? */
export function waitingOnMe(r: ReviewRequest, approvals: Approval[], role: OrgRole, me: string, members: OrgMember[]) {
  return canDecide(r, approvals, role, me, members);
}

const RANK: Record<OrgRole, number> = { intern: 1, assistant: 2, manager: 3, hod: 4, owner: 5 };

/**
 * May this person close a draft? Managers and above close their own drafts
 * and those of lower roles; owners close any. Someone who has left counts as
 * the lowest rank.
 */
export function canCloseDraft(role: OrgRole, me: string, authorId: string, authorRole: OrgRole | null) {
  const mine = RANK[role];
  if (mine < RANK.manager) return false;
  if (role === "owner" || authorId === me) return true;
  return (authorRole ? RANK[authorRole] : 0) < mine;
}

/** What each role may do. Shown in Settings and enforced by the database. */
export const PERMISSIONS: { action: string; who: OrgRole[] }[] = [
  { action: "Read the library and the projects they can see", who: ["intern", "assistant", "manager", "hod", "owner"] },
  { action: "Start drafts and submit research for review", who: ["intern", "assistant", "manager", "hod", "owner"] },
  { action: "Comment, suggest wording, mention and react", who: ["intern", "assistant", "manager", "hod", "owner"] },
  { action: "Create projects", who: ["intern", "assistant", "manager", "hod", "owner"] },
  { action: "Create milestones", who: ["manager", "hod", "owner"] },
  { action: "See restricted projects without being added", who: ["manager", "hod", "owner"] },
  { action: "Set section owners", who: ["manager", "hod", "owner"] },
  { action: "Ask to close their own draft: one person, one role, or everyone above", who: ["intern", "assistant"] },
  { action: "Ask to close a draft above their rank", who: ["manager", "hod"] },
  { action: "Close their own drafts and those of assistants and interns", who: ["manager", "hod", "owner"] },
  { action: "Close Research Managers' drafts", who: ["hod", "owner"] },
  { action: "Close anyone's draft, including a head of department's or another owner's", who: ["owner"] },
  { action: "Approve or decline requests to close a draft sent to them", who: ["manager", "hod", "owner"] },
  { action: "Reopen a closed draft they could close", who: ["manager", "hod", "owner"] },
  { action: "Approve, request changes or reject at stage 1", who: ["manager", "hod", "owner"] },
  { action: "Give final approval and file into the library", who: ["hod", "owner"] },
  { action: "Invite people and change roles", who: ["hod", "owner"] },
  { action: "Change the theme colours, logo, favicon and print logo", who: ["manager", "hod", "owner"] },
  { action: "Make someone an owner, remove members, delete the organization", who: ["owner"] },
];
