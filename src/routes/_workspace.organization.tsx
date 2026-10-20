import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Link2, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  canManage,
  createInvite,
  deleteOrganization,
  inviteLink,
  orgInvitesQuery,
  orgMembersQuery,
  removeMember,
  renameOrganization,
  revokeInvite,
  ROLE_LABELS,
  setMemberRole,
  type OrgRole,
  INVITE_ROLES,
  ROLES,
} from "@/lib/organizations";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_workspace/organization")({
  head: () => ({ meta: [{ title: "Organization — Parallax" }] }),
  component: OrganizationPage,
});

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-border bg-card">
      <header className="border-b border-border px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{title}</header>
      {children}
    </section>
  );
}

const selectClass = "h-10 border border-input bg-background px-2 text-sm md:h-8";

function OrganizationPage() {
  const { user } = useAuth();
  const { org, switchTo, refresh } = useWorkspace();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const orgId = org?.id ?? "";
  const manage = canManage(org?.role);
  const owner = org?.role === "owner";

  const members = useQuery({ ...orgMembersQuery(orgId), enabled: !!org });
  const invites = useQuery({ ...orgInvitesQuery(orgId), enabled: !!org && manage });
  const [name, setName] = useState(org?.name ?? "");
  const [inviteRole, setInviteRole] = useState<(typeof INVITE_ROLES)[number]>("assistant");
  const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
  useEffect(() => setName(org?.name ?? ""), [org?.id, org?.name]);

  // Run a change, report a failure in plain words, and refresh what it touched.
  async function act(work: () => Promise<void>, done?: string) {
    try {
      await work();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["organization-members", orgId] }),
        queryClient.invalidateQueries({ queryKey: ["organization-invites", orgId] }),
        refresh(),
      ]);
      if (done) toast.success(done);
    } catch (err) {
      toast.error("That didn't work", { description: err instanceof Error ? err.message : undefined });
    }
  }

  if (!org) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="text-3xl leading-tight sm:text-4xl">Organization</h1>
        <div className="mt-8 border border-dashed border-border p-8 text-center">
          <p className="font-serif text-2xl">You're in your personal workspace</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            An organization is a shared workspace for a team. Create one, or join one with an invite, from the workspace menu at the top of the sidebar.
          </p>
        </div>
      </div>
    );
  }

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
      <div>
        <h1 className="text-3xl leading-tight [overflow-wrap:anywhere] sm:text-4xl">{org.name}</h1>
        <p className="mt-2 text-muted-foreground">You are {org.role === "owner" ? "an" : "a"} {ROLE_LABELS[org.role].toLowerCase()} of this organization.</p>
      </div>

      {owner && (
        <Panel title="Name">
          <form
            className="flex flex-col gap-3 p-5 sm:flex-row sm:items-end"
            onSubmit={(e) => { e.preventDefault(); void act(() => renameOrganization(org.id, name), "Organization renamed"); }}
          >
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="org-rename">Organization name</Label>
              <Input id="org-rename" required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="submit" variant="outline" disabled={name.trim() === org.name || name.trim().length < 2}>Save</Button>
          </form>
        </Panel>
      )}

      <Panel title={`Members${members.data ? ` (${members.data.length})` : ""}`}>
        {members.isPending ? (
          <div className="space-y-3 p-5"><Skeleton className="h-5 w-2/3" /><Skeleton className="h-5 w-1/2" /></div>
        ) : members.isError ? (
          <p className="p-5 text-sm text-weak">Couldn't load members: {members.error.message}</p>
        ) : (
          <ul className="divide-y divide-border">
            {members.data.map((m) => {
              const self = m.user_id === user?.id;
              return (
                <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {m.full_name || m.email || "Unknown member"}
                      {self && <span className="ml-2 font-normal text-muted-foreground">(you)</span>}
                    </div>
                    {m.full_name && m.email && <div className="truncate text-xs text-muted-foreground">{m.email}</div>}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Owners change anyone's role; heads of department anyone's except an owner's. */}
                    {!self && (owner || (org.role === "hod" && m.role !== "owner")) ? (
                      <>
                        <select
                          aria-label={`Role for ${m.email ?? "member"}`}
                          className={selectClass}
                          value={m.role}
                          onChange={(e) => void act(() => setMemberRole(org.id, m.user_id, e.target.value as OrgRole), "Role updated")}
                        >
                          {ROLES.filter((r) => owner || r !== "owner").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                        </select>
                        {owner && (
                          <Button variant="ghost" size="icon" className="text-muted-foreground" aria-label={`Remove ${m.email ?? "member"}`}
                            onClick={() => void act(() => removeMember(org.id, m.user_id), "Member removed")}>
                            <Trash2 />
                          </Button>
                        )}
                      </>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{ROLE_LABELS[m.role]}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {manage && (
        <Panel title="Invite people">
          <div className="space-y-4 p-5">
            <p className="text-sm text-muted-foreground">
              Create a link and send it to the people you want to add. Anyone who opens it with a Parallax account can join; a link works for 7 days.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="invite-role">They join as</Label>
                <select id="invite-role" className={selectClass} value={inviteRole} onChange={(e) => setInviteRole(e.target.value as (typeof INVITE_ROLES)[number])}>
                  {INVITE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
              <Button onClick={() => void act(() => createInvite(org.id, inviteRole, user!.id), "Invite link created")}>
                <Link2 /> Create invite link
              </Button>
            </div>
            {invites.data && invites.data.length > 0 && (
              <ul className="divide-y divide-border border border-border">
                {invites.data.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs">{inviteLink(i.code)}</div>
                      <div className="text-xs text-muted-foreground">
                        {ROLE_LABELS[i.role]} · expires {new Date(i.expires_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="outline" size="sm" onClick={() => void copy(i.code)}><Copy /> Copy</Button>
                      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => void act(() => revokeInvite(i.id), "Invite withdrawn")}>Withdraw</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      )}

      <Panel title="Leaving">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="max-w-md text-sm text-muted-foreground">
            Leaving removes your access to this organization's research. Your personal workspace is not affected.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirm("leave")}>Leave organization</Button>
            {owner && <Button variant="destructive" size="sm" onClick={() => setConfirm("delete")}>Delete organization</Button>}
          </div>
        </div>
      </Panel>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "delete" ? `Delete ${org.name}?` : `Leave ${org.name}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "This removes the organization for every member, along with all the research saved in it. It can't be undone."
                : "You'll lose access to this organization's research until someone invites you again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                void act(async () => {
                  if (confirm === "delete") await deleteOrganization(org.id);
                  else await removeMember(org.id, user!.id);
                  switchTo(null);
                  navigate({ to: "/research" });
                }, confirm === "delete" ? "Organization deleted" : "You've left the organization")
              }
            >
              {confirm === "delete" ? "Delete organization" : "Leave"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
