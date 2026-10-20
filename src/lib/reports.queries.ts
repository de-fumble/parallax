import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ReportEdits } from "./report-layout";
import type { Report } from "./research.types";

export type ReportSummary = {
  id: string;
  /** Who ran it; in an organization that may not be the person looking. */
  user_id: string;
  topic: string;
  mode: string;
  created_at: string;
  title: string | null;
  status: string | null;
  confidence: string | null;
};

export type ReportDetail = {
  /** The person who ran it. */
  user_id: string;
  /** The organization it belongs to, or null for a personal report. */
  org_id: string | null;
  topic: string;
  user_context: string | null;
  created_at: string;
  report: Report;
  /** The user's edited version, if they have saved one. */
  edited: ReportEdits | null;
};

// Postgres's code for "no such column". The `edited` column arrived in a later
// version of supabase/schema.sql; until that has been run, read without it so
// reports still open.
const UNDEFINED_COLUMN = "42703";

type ListRow = Omit<ReportSummary, "title"> & { title: string | null; edited_title?: string | null };

// The list pulls a few fields out of the report JSON instead of downloading every full report.
const LIST_FIELDS = "id, user_id, topic, mode, created_at, title:report->>research_title, status:report->>status, confidence:report->>confidence";

/**
 * The reports in one workspace: an organization's shared reports, or (with
 * orgId null) the user's own personal ones.
 */
export const reportListQuery = (userId: string, orgId: string | null) =>
  queryOptions({
    queryKey: ["reports", userId, orgId ?? "personal"] as const,
    queryFn: async () => {
      const list = (fields: string, scoped: boolean) => {
        const query = supabase.from("reports").select(fields).order("created_at", { ascending: false });
        if (!scoped) return query;
        // Personal means "mine and in no organization"; row level security
        // already limits an organization's reports to its members.
        return orgId ? query.eq("org_id" as never, orgId as never) : query.is("org_id" as never, null).eq("user_id", userId);
      };
      let { data, error } = await list(`${LIST_FIELDS}, edited_title:edited->report->>research_title`, true);
      // A database from before workspaces existed has only personal reports.
      if (error?.code === UNDEFINED_COLUMN) ({ data, error } = await list(LIST_FIELDS, false));
      if (error) throw new Error(error.message);
      // A title the user has edited is the one to show everywhere.
      return ((data ?? []) as unknown as ListRow[]).map(
        ({ edited_title, ...row }): ReportSummary => ({ ...row, title: edited_title || row.title }),
      );
    },
  });

// The report the AI wrote never changes; only the user's own edits do, and
// saving those updates this cache directly. So a fetched report stays fresh.
export const reportQuery = (id: string) =>
  queryOptions({
    queryKey: ["report", id] as const,
    staleTime: Infinity,
    queryFn: async () => {
      const one = (fields: string) => supabase.from("reports").select(fields).eq("id", id).maybeSingle();
      let { data, error } = await one("user_id, org_id, topic, user_context, created_at, report, edited");
      if (error?.code === UNDEFINED_COLUMN) ({ data, error } = await one("user_id, topic, user_context, created_at, report"));
      if (error) throw new Error(error.message);
      if (!data) return null;
      const row = data as unknown as Omit<ReportDetail, "edited" | "org_id"> & { edited?: ReportEdits | null; org_id?: string | null };
      return { ...row, org_id: row.org_id ?? null, edited: row.edited ?? null } satisfies ReportDetail;
    },
  });
