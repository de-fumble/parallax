import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Data access for collaboration. Reads go straight to the tables, which only
// return what the signed-in person may see. Changes go through the database
// functions in supabase/schema.sql, which check roles and keep related tables
// consistent.

// These tables are newer than the generated types, so they are read through an
// untyped handle and typed here.
const db = supabase as unknown as SupabaseClient;

export type Section = { title: string; body: string };

export type Project = {
  id: string;
  org_id: string;
  name: string;
  description: string;
  topics: string[];
  visibility: "department" | "restricted";
  lead_id: string | null;
  created_at: string;
  updated_at: string;
};

export type DocumentKind = "Report" | "Literature review" | "Procedure" | "Data note" | "Proposal";
export const DOCUMENT_KINDS: DocumentKind[] = ["Report", "Literature review", "Procedure", "Data note", "Proposal"];

export type ResearchDocument = {
  id: string;
  org_id: string;
  project_id: string;
  title: string;
  kind: DocumentKind;
  current_version: number;
  created_by: string | null;
  updated_at: string;
  filed_at: string | null;
};

export type DocumentVersion = { document_id: string; version: number; sections: Section[]; filed_by: string | null; filed_at: string; review_id: string | null };

export type DocumentOwner = { document_id: string; section_title: string; user_id: string };

export type DraftStatus = "open" | "submitted" | "filed" | "closed";

export type Draft = {
  id: string;
  org_id: string;
  project_id: string;
  document_id: string;
  title: string;
  author_id: string;
  base_version: number;
  sections: Section[];
  status: DraftStatus;
  closed_by?: string | null;
  closed_reason?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type CloseRequestStatus = "pending" | "approved" | "declined" | "withdrawn";

/** An intern's or assistant's request to close their draft, decided by a manager or above. */
export type CloseRequest = {
  id: string;
  org_id: string;
  draft_id: string;
  requested_by: string | null;
  reason: string;
  status: CloseRequestStatus;
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
  /** One person, or everyone in one role; neither means everyone who can close the draft. */
  target_user?: string | null;
  target_role?: "manager" | "hod" | "owner" | null;
  created_at: string;
};

export type Revision = { id: string; draft_id: string; author_id: string | null; message: string; sections: Section[]; added: number; removed: number; created_at: string };

export type ReviewStatus = "in_review" | "changes_requested" | "filed" | "closed";
export const REVIEW_STATUS: Record<ReviewStatus, string> = {
  in_review: "In review",
  changes_requested: "Changes requested",
  filed: "Filed",
  closed: "Closed",
};

export type ReviewKind = "New research" | "Update" | "Procedure change" | "Idea";
export type Urgency = "Low" | "Normal" | "High" | "Urgent";
export type NextStep = { text: string; assignee?: string | null };

export type ReviewRequest = {
  id: string;
  org_id: string;
  number: number;
  project_id: string;
  document_id: string;
  draft_id: string;
  title: string;
  kind: ReviewKind;
  summary: string;
  next_steps: NextStep[];
  urgency: Urgency;
  labels: string[];
  milestone_id: string | null;
  status: ReviewStatus;
  needs_manager: boolean;
  touched: string[];
  author_id: string;
  filed_version: number | null;
  closed_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type Approval = {
  review_id: string;
  stage: "manager" | "hod";
  state: "waiting" | "pending" | "approved" | "changes_requested";
  decided_by: string | null;
  decided_at: string | null;
  note: string | null;
  pending_since: string | null;
};

export type Comment = {
  id: string;
  review_id: string;
  section_title: string;
  author_id: string | null;
  body: string;
  suggestion: string | null;
  resolved: boolean;
  created_at: string;
};

export type Reaction = { comment_id: string; user_id: string; emoji: string };
export const REACTIONS = ["👍", "❤️", "🎉", "👀", "✅"] as const;

export type Link = { review_id: string; target_kind: "review" | "report"; target_id: string };
export type Attachment = { id: string; review_id: string; name: string; path: string; size: number; created_at: string };

export type Task = {
  id: string;
  org_id: string;
  project_id: string | null;
  review_id: string | null;
  milestone_id: string | null;
  title: string;
  assignee_id: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string;
};

export type Milestone = { id: string; org_id: string; project_id: string | null; title: string; due_on: string | null; created_at: string };

export type OrgEvent = {
  id: number;
  org_id: string;
  project_id: string | null;
  actor_id: string | null;
  action: string;
  target_kind: string | null;
  target_id: string | null;
  target_label: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

export type Notification = {
  id: string;
  org_id: string;
  kind: "review_requested" | "mentioned" | "assigned" | "status_changed" | "reminder" | "comment";
  title: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type LibraryDocument = {
  id: string;
  project_id: string;
  title: string;
  kind: DocumentKind;
  current_version: number;
  filed_at: string;
  created_by: string | null;
  sections: Section[];
  filed_by: string | null;
  review_id: string | null;
};

// Postgres's codes for a missing table, view or function: the collaboration
// part of the schema hasn't been run yet.
const NOT_SET_UP = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

function fail(error: { code?: string; message: string }): never {
  throw new Error(
    error.code && NOT_SET_UP.has(error.code)
      ? "Collaboration isn't set up in the database yet. Run supabase/schema.sql in the Supabase SQL Editor."
      : error.message,
  );
}

async function rows<T>(query: PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) fail(error);
  return data as T;
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) fail(error);
  return data as T;
}

// ---------------------------------------------------------------------------
// Queries. Keys start with "collab" and the organization, so one
// invalidation refreshes everything after a change.
// ---------------------------------------------------------------------------

export const collabKey = (orgId: string) => ["collab", orgId] as const;

export const projectsQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "projects"],
    queryFn: () => rows<Project[]>(db.from("projects").select("*").eq("org_id", orgId).order("updated_at", { ascending: false })),
  });

export const projectMembersQuery = (orgId: string, projectId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "project-members", projectId],
    queryFn: async () => (await rows<{ user_id: string }[]>(db.from("project_members").select("user_id").eq("project_id", projectId))).map((r) => r.user_id),
  });

export const documentsQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "documents"],
    queryFn: () => rows<ResearchDocument[]>(db.from("documents").select("*").eq("org_id", orgId).order("updated_at", { ascending: false })),
  });

export const documentQuery = (orgId: string, documentId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "document", documentId],
    queryFn: async () => {
      const [doc, versions, owners] = await Promise.all([
        rows<ResearchDocument | null>(db.from("documents").select("*").eq("id", documentId).maybeSingle()),
        rows<DocumentVersion[]>(db.from("document_versions").select("*").eq("document_id", documentId).order("version", { ascending: false })),
        rows<DocumentOwner[]>(db.from("document_owners").select("*").eq("document_id", documentId)),
      ]);
      return { doc, versions, owners };
    },
  });

export const ownersQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "owners"],
    queryFn: () => rows<DocumentOwner[]>(db.from("document_owners").select("*")),
  });

export const draftsQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "drafts"],
    queryFn: async () => {
      const columns = "id, org_id, project_id, document_id, title, author_id, base_version, status, created_at, updated_at";
      const list = (extra: string) => db.from("drafts").select(columns + extra).eq("org_id", orgId).order("updated_at", { ascending: false });
      // Who closed a draft and why, once the closing part of the schema is run.
      const full = await list(", closed_by, closed_reason, closed_at");
      if (full.error?.code === "42703") return rows<Draft[]>(list(""));
      if (full.error) fail(full.error);
      return full.data as unknown as Draft[];
    },
  });

export const draftQuery = (orgId: string, draftId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "draft", draftId],
    queryFn: async () => {
      const draft = await rows<Draft | null>(db.from("drafts").select("*").eq("id", draftId).maybeSingle());
      if (!draft) return null;
      const [revisions, base, review] = await Promise.all([
        rows<Revision[]>(db.from("draft_revisions").select("*").eq("draft_id", draftId).order("created_at", { ascending: false })),
        draft.base_version > 0
          ? rows<DocumentVersion | null>(db.from("document_versions").select("*").eq("document_id", draft.document_id).eq("version", draft.base_version).maybeSingle())
          : Promise.resolve(null),
        rows<ReviewRequest | null>(db.from("review_requests").select("*").eq("draft_id", draftId).order("created_at", { ascending: false }).limit(1).maybeSingle()),
      ]);
      // The latest request to close it. Missing until the closing part of the schema is run.
      const close = await db.from("draft_close_requests").select("*").eq("draft_id", draftId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const closeRequest = close.error ? null : (close.data as CloseRequest | null);
      return { draft, revisions, base: base?.sections ?? [], review, closeRequest };
    },
  });

/** Requests to close a draft that are waiting for a decision. */
export const closeRequestsQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "close-requests"],
    queryFn: async () => {
      const { data, error } = await db
        .from("draft_close_requests")
        .select("*, drafts(title, project_id)")
        .eq("org_id", orgId)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      // Before the schema is re-run there are simply none.
      if (error) return error.code && NOT_SET_UP.has(error.code) ? [] : fail(error);
      return data as (CloseRequest & { drafts: { title: string; project_id: string } | null })[];
    },
  });

export const revisionsQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "revisions"],
    queryFn: () =>
      rows<(Omit<Revision, "sections"> & { drafts: { project_id: string; title: string } | null })[]>(
        db.from("draft_revisions").select("id, draft_id, author_id, message, added, removed, created_at, drafts!inner(project_id, title, org_id)").eq("drafts.org_id", orgId).order("created_at", { ascending: false }).limit(200),
      ),
  });

export const reviewsQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "reviews"],
    queryFn: async () => {
      const [reviews, approvals] = await Promise.all([
        rows<ReviewRequest[]>(db.from("review_requests").select("*").eq("org_id", orgId).order("number", { ascending: false })),
        rows<Approval[]>(db.from("review_approvals").select("*, review_requests!inner(org_id)").eq("review_requests.org_id", orgId)),
      ]);
      return reviews.map((r) => ({ ...r, approvals: approvals.filter((a) => a.review_id === r.id).sort(byStage) }));
    },
  });

/** Stage 1 (Research Manager) before stage 2 (head of department). */
function byStage(a: Approval, b: Approval) {
  return (a.stage === "manager" ? 0 : 1) - (b.stage === "manager" ? 0 : 1);
}

export type ReviewWithApprovals = ReviewRequest & { approvals: Approval[] };

export const reviewQuery = (orgId: string, number: number) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "review", number],
    queryFn: async () => {
      const review = await rows<ReviewRequest | null>(db.from("review_requests").select("*").eq("org_id", orgId).eq("number", number).maybeSingle());
      if (!review) return null;
      const [approvals, comments, links, attachments, draft, owners] = await Promise.all([
        rows<Approval[]>(db.from("review_approvals").select("*").eq("review_id", review.id)),
        rows<Comment[]>(db.from("review_comments").select("*").eq("review_id", review.id).order("created_at")),
        rows<Link[]>(db.from("review_links").select("*").eq("review_id", review.id)),
        rows<Attachment[]>(db.from("review_attachments").select("*").eq("review_id", review.id).order("created_at")),
        rows<Draft>(db.from("drafts").select("*").eq("id", review.draft_id).single()),
        rows<DocumentOwner[]>(db.from("document_owners").select("*").eq("document_id", review.document_id)),
      ]);
      const commentIds = comments.map((c) => c.id);
      const [reactions, base, linkedFrom, filed] = await Promise.all([
        commentIds.length ? rows<Reaction[]>(db.from("comment_reactions").select("*").in("comment_id", commentIds)) : Promise.resolve([] as Reaction[]),
        draft.base_version > 0
          ? rows<DocumentVersion | null>(db.from("document_versions").select("*").eq("document_id", draft.document_id).eq("version", draft.base_version).maybeSingle())
          : Promise.resolve(null),
        rows<Link[]>(db.from("review_links").select("*").eq("target_kind", "review").eq("target_id", review.id)),
        review.filed_version
          ? rows<DocumentVersion | null>(db.from("document_versions").select("*").eq("document_id", review.document_id).eq("version", review.filed_version).maybeSingle())
          : Promise.resolve(null),
      ]);
      return {
        review,
        approvals: approvals.sort(byStage),
        comments,
        reactions,
        links,
        linkedFrom,
        attachments,
        draft,
        owners,
        // What the changes are measured against, and what they are now (or were when filed).
        before: base?.sections ?? [],
        after: filed?.sections ?? draft.sections,
      };
    },
  });

export const tasksQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "tasks"],
    queryFn: () => rows<Task[]>(db.from("tasks").select("*").eq("org_id", orgId).order("created_at", { ascending: false })),
  });

export const milestonesQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "milestones"],
    queryFn: () => rows<Milestone[]>(db.from("milestones").select("*").eq("org_id", orgId).order("due_on", { ascending: true, nullsFirst: false })),
  });

export const eventsQuery = (orgId: string, limit = 50, sinceDays?: number) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "events", limit, sinceDays ?? 0],
    queryFn: () => {
      let q = db.from("org_events").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
      if (sinceDays) q = q.gte("created_at", new Date(Date.now() - sinceDays * 86_400_000).toISOString());
      return rows<OrgEvent[]>(q);
    },
  });

export const notificationsQuery = (orgId: string, userId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "notifications", userId],
    queryFn: () => rows<Notification[]>(db.from("notifications").select("*").eq("org_id", orgId).eq("user_id", userId).order("created_at", { ascending: false }).limit(200)),
    refetchInterval: 30_000,
  });

export const libraryQuery = (orgId: string, search: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "library", search],
    queryFn: () => {
      let q = db.from("library_documents").select("id, project_id, title, kind, current_version, filed_at, created_by, sections, filed_by, review_id").eq("org_id", orgId).order("filed_at", { ascending: false });
      const term = search.trim().replace(/[%,()]/g, " ");
      if (term) q = q.or(`title.ilike.%${term}%,body_text.ilike.%${term}%`);
      return rows<LibraryDocument[]>(q);
    },
  });

/** Reports in the organization's workspace, for linking to requests and starting documents from. */
export const orgReportsQuery = (orgId: string) =>
  queryOptions({
    queryKey: [...collabKey(orgId), "reports"],
    queryFn: () =>
      rows<{ id: string; topic: string; created_at: string; title: string | null }[]>(
        db.from("reports").select("id, topic, created_at, title:report->>research_title").eq("org_id", orgId).order("created_at", { ascending: false }).limit(100),
      ),
  });

// ---------------------------------------------------------------------------
// Changes
// ---------------------------------------------------------------------------

export const createProject = (a: { org: string; name: string; description: string; topics: string[]; visibility: "department" | "restricted"; lead: string | null }) =>
  call<string>("create_project", { _org: a.org, _name: a.name, _description: a.description, _topics: a.topics, _visibility: a.visibility, _lead: a.lead });

export const setProjectMembers = (project: string, members: string[]) => call<void>("set_project_members", { _project: project, _members: members });

export const startDraft = (a: { project: string; document: string | null; title: string; kind: DocumentKind; sections: Section[] | null }) =>
  call<string>("start_draft", { _project: a.project, _document: a.document, _title: a.title, _kind: a.kind, _sections: a.sections });

export const saveRevision = (draft: string, sections: Section[], message: string, added: number, removed: number) =>
  call<void>("save_revision", { _draft: draft, _sections: sections, _message: message, _added: added, _removed: removed });

export const submitReview = (a: {
  draft: string;
  title: string;
  kind: ReviewKind;
  summary: string;
  nextSteps: NextStep[];
  urgency: Urgency;
  labels: string[];
  milestone: string | null;
  links: { kind: "review" | "report"; id: string }[];
}) =>
  call<number>("submit_review", {
    _draft: a.draft,
    _title: a.title,
    _kind: a.kind,
    _summary: a.summary,
    _next_steps: a.nextSteps,
    _urgency: a.urgency,
    _labels: a.labels,
    _milestone: a.milestone,
    _links: a.links,
  });

export async function reviewIdByNumber(orgId: string, number: number) {
  return (await rows<{ id: string }>(db.from("review_requests").select("id").eq("org_id", orgId).eq("number", number).single())).id;
}

export const decide = (review: string, decision: "approve" | "request_changes" | "reject", note: string) =>
  call<string>("review_decision", { _review: review, _decision: decision, _note: note || null });

export const resubmit = (review: string) => call<void>("resubmit_review", { _review: review });

export const addComment = (a: { review: string; section: string; body: string; suggestion: string | null; mentions: string[] }) =>
  call<string>("add_comment", { _review: a.review, _section: a.section, _body: a.body, _suggestion: a.suggestion, _mentions: a.mentions });

export const acceptSuggestion = (comment: string) => call<void>("accept_suggestion", { _comment: comment });

export async function setResolved(comment: string, resolved: boolean) {
  const { error } = await db.from("review_comments").update({ resolved }).eq("id", comment);
  if (error) fail(error);
}

export async function toggleReaction(comment: string, userId: string, emoji: string, on: boolean) {
  const { error } = on
    ? await db.from("comment_reactions").insert({ comment_id: comment, user_id: userId, emoji })
    : await db.from("comment_reactions").delete().eq("comment_id", comment).eq("user_id", userId).eq("emoji", emoji);
  if (error) fail(error);
}

export async function addLink(review: string, kind: "review" | "report", id: string, userId: string) {
  const { error } = await db.from("review_links").insert({ review_id: review, target_kind: kind, target_id: id, created_by: userId });
  if (error) fail(error);
}

export async function removeLink(review: string, kind: "review" | "report", id: string) {
  const { error } = await db.from("review_links").delete().eq("review_id", review).eq("target_kind", kind).eq("target_id", id);
  if (error) fail(error);
}

export const setSectionOwners = (document: string, section: string, users: string[]) =>
  call<void>("set_section_owners", { _document: document, _section: section, _users: users });

export const createMilestone = (a: { org: string; project: string | null; title: string; due: string | null }) =>
  call<string>("create_milestone", { _org: a.org, _project: a.project, _title: a.title, _due: a.due });

export async function deleteMilestone(id: string) {
  const { error } = await db.from("milestones").delete().eq("id", id);
  if (error) fail(error);
}

export const setTaskDone = (task: string, done: boolean) => call<void>("set_task_done", { _task: task, _done: done });

export async function markRead(ids: string[]) {
  if (!ids.length) return;
  const { error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).in("id", ids);
  if (error) fail(error);
}

export const ATTACHMENT_BUCKET = "collab-attachments";
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Store a file for a request, under the organization's folder. */
export async function uploadAttachment(orgId: string, reviewId: string, file: File, userId: string) {
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const path = `${orgId}/${reviewId}/${crypto.randomUUID()}-${safe}`;
  const { error: upload } = await supabase.storage.from(ATTACHMENT_BUCKET).upload(path, file, file.type ? { contentType: file.type } : {});
  if (upload) throw new Error(upload.message);
  const { error } = await db.from("review_attachments").insert({ review_id: reviewId, name: file.name, path, size: file.size, uploaded_by: userId });
  if (error) fail(error);
}

export async function attachmentUrl(path: string) {
  const { data, error } = await supabase.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
// Closing drafts.
// ---------------------------------------------------------------------------

/** Managers, heads of department and owners close a draft directly. */
export const closeDraft = (draft: string, reason: string) => call<void>("close_draft", { _draft: draft, _reason: reason });

/** Ask for a draft to be closed: by one person, everyone in a role, or (neither) everyone who can close it. */
export const requestDraftClose = (draft: string, reason: string, to: { user?: string; role?: string } = {}) =>
  call<string>("request_draft_close", { _draft: draft, _reason: reason, _to_user: to.user ?? null, _to_role: to.role ?? null });

/** Open a closed draft again, so it can be worked on, submitted and filed. */
export const reopenDraft = (draft: string) => call<void>("reopen_draft", { _draft: draft });

export const decideCloseRequest = (request: string, approve: boolean, note: string) =>
  call<void>("decide_close_request", { _request: request, _approve: approve, _note: note });

export const withdrawCloseRequest = (request: string) => call<void>("withdraw_close_request", { _request: request });
