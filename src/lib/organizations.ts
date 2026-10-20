import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// Organizations: shared workspaces a person can create or join alongside their
// personal one. Everything here goes through row level security, so a query
// only ever returns what the signed-in user is allowed to see.

// These tables are newer than the generated database types, so they are read
// through an untyped handle and given their types here.
const db = supabase as unknown as SupabaseClient;

export type OrgRole = "owner" | "hod" | "manager" | "assistant" | "intern";

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  hod: "Head of Department",
  manager: "Research Manager",
  assistant: "Research Assistant",
  intern: "Research Intern",
};

/** Highest first, for lists and pickers. */
export const ROLES: OrgRole[] = ["owner", "hod", "manager", "assistant", "intern"];

/** Roles an invite can hand out: never ownership. */
export const INVITE_ROLES: Exclude<OrgRole, "owner">[] = ["hod", "manager", "assistant", "intern"];

export type Organization = { id: string; name: string; role: OrgRole };

export type OrgMember = { user_id: string; role: OrgRole; joined_at: string; email: string | null; full_name: string | null };

export type OrgInvite = { id: string; code: string; role: Exclude<OrgRole, "owner">; expires_at: string; created_at: string };

export type InvitePreview = { org_id: string; org_name: string; role: OrgRole; already_member: boolean };

/** Owners and heads of department run the organization: members, invites, final approval. */
export const canManage = (role: OrgRole | undefined) => role === "owner" || role === "hod";

/** Research Managers and above: create projects and milestones, approve at stage 1. */
export const isManager = (role: OrgRole | undefined) => role === "owner" || role === "hod" || role === "manager";

export const orgListQuery = (userId: string) =>
  queryOptions({
    queryKey: ["organizations", userId] as const,
    // Before the database has the organization tables, this simply finds none.
    retry: false,
    queryFn: async (): Promise<Organization[]> => {
      const { data, error } = await db
        .from("organization_members")
        .select("role, organizations (id, name)")
        .eq("user_id", userId)
        .order("joined_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).flatMap((row) => {
        const org = row.organizations as unknown as { id: string; name: string } | null;
        return org ? [{ id: org.id, name: org.name, role: row.role as OrgRole }] : [];
      });
    },
  });

export const orgMembersQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["organization-members", orgId] as const,
    queryFn: async (): Promise<OrgMember[]> => {
      const { data: members, error } = await db
        .from("organization_members")
        .select("user_id, role, joined_at")
        .eq("org_id", orgId)
        .order("joined_at", { ascending: true });
      if (error) throw new Error(error.message);
      const ids = (members ?? []).map((m) => m.user_id as string);
      const { data: profiles } = ids.length
        ? await db.from("profiles").select("id, email, full_name").in("id", ids)
        : { data: [] };
      const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));
      return (members ?? []).map((m) => ({
        user_id: m.user_id as string,
        role: m.role as OrgRole,
        joined_at: m.joined_at as string,
        email: (byId.get(m.user_id as string)?.email as string | null) ?? null,
        full_name: (byId.get(m.user_id as string)?.full_name as string | null) ?? null,
      }));
    },
  });

export const orgInvitesQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["organization-invites", orgId] as const,
    queryFn: async (): Promise<OrgInvite[]> => {
      const { data, error } = await db
        .from("organization_invites")
        .select("id, code, role, expires_at, created_at")
        .eq("org_id", orgId)
        .eq("revoked", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as OrgInvite[];
    },
  });

// Postgres raises these when the organization tables or functions aren't there yet.
const NOT_SET_UP = new Set(["42P01", "42883", "PGRST202", "PGRST205"]);

function fail(error: { code?: string; message: string }): never {
  throw new Error(
    error.code && NOT_SET_UP.has(error.code)
      ? "Organizations aren't set up in the database yet. Run supabase/schema.sql in the Supabase SQL Editor."
      : error.message,
  );
}

export async function createOrganization(name: string): Promise<string> {
  const { data, error } = await db.rpc("create_organization", { _name: name });
  if (error) fail(error);
  return data as string;
}

export async function previewInvite(code: string): Promise<InvitePreview | null> {
  const { data, error } = await db.rpc("invite_preview", { _code: code });
  if (error) fail(error);
  return ((data as InvitePreview[] | null) ?? [])[0] ?? null;
}

export async function joinOrganization(code: string): Promise<string> {
  const { data, error } = await db.rpc("join_organization", { _code: code });
  if (error) fail(error);
  return data as string;
}

export async function renameOrganization(orgId: string, name: string) {
  const { error } = await db.from("organizations").update({ name: name.trim() }).eq("id", orgId);
  if (error) fail(error);
}

export async function deleteOrganization(orgId: string) {
  const { error } = await db.from("organizations").delete().eq("id", orgId);
  if (error) fail(error);
}

// Owners can set any role; heads of department any role except owner. The database checks it.
export async function setMemberRole(orgId: string, userId: string, role: OrgRole) {
  const { error } = await db.rpc("set_member_role", { _org: orgId, _user: userId, _role: role });
  if (error) fail(error);
}

/** Remove someone from an organization, or leave it yourself. */
export async function removeMember(orgId: string, userId: string) {
  const { error } = await db.from("organization_members").delete().eq("org_id", orgId).eq("user_id", userId);
  if (error) fail(error);
}

export async function createInvite(orgId: string, role: Exclude<OrgRole, "owner">, createdBy: string) {
  const { error } = await db.from("organization_invites").insert({ org_id: orgId, role, created_by: createdBy });
  if (error) fail(error);
}

export async function revokeInvite(inviteId: string) {
  const { error } = await db.from("organization_invites").update({ revoked: true }).eq("id", inviteId);
  if (error) fail(error);
}

/** Accepts a bare invite code or a whole invite link pasted from a message. */
export function inviteCodeFrom(input: string): string {
  const text = input.trim();
  const fromLink = /\/join\/([0-9a-z]+)/i.exec(text)?.[1];
  return (fromLink ?? text).toLowerCase();
}

export const inviteLink = (code: string) => `${window.location.origin}/join/${code}`;
