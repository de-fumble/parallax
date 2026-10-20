import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Building2, Check, ChevronsUpDown, Plus, Settings, Ticket, User } from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/hooks/use-workspace";
import { createOrganization, inviteCodeFrom, ROLE_LABELS } from "@/lib/organizations";
import { WorkspaceLogo } from "@/components/OrgBranding";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

// The sidebar's top control: shows which workspace is open and switches
// between the personal one and any organizations, or starts or joins another.
export function WorkspaceSwitcher({ onNavigate }: { onNavigate: () => void }) {
  const navigate = useNavigate();
  const { org, name, organizations, switchTo, refresh } = useWorkspace();
  const [dialog, setDialog] = useState<"create" | "join" | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const open = (which: "create" | "join") => {
    setValue("");
    setDialog(which);
  };

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await createOrganization(value);
      await refresh();
      switchTo(id);
      setDialog(null);
      toast.success(`${value.trim()} created`, { description: "You're its owner. Invite your team from Organization settings." });
      navigate({ to: "/organization" });
    } catch (err) {
      toast.error("Couldn't create the organization", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const code = inviteCodeFrom(value);
    if (!code) return;
    setDialog(null);
    // The join page shows which organization the invite is for before anything happens.
    navigate({ to: "/join/$code", params: { code } });
  }

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton size="lg" tooltip={`Workspace: ${name}`}>
                <span className="flex size-8 shrink-0 items-center justify-center">
                  <WorkspaceLogo className="h-5 max-w-8 w-auto" />
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate font-serif text-xl leading-none">{name}</span>
                  <span className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {org ? ROLE_LABELS[org.role] : "Personal workspace"}
                  </span>
                </span>
                <ChevronsUpDown className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-(--radix-dropdown-menu-trigger-width) min-w-64">
              <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Workspaces</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => switchTo(null)}>
                <User /> Personal
                {!org && <Check className="ml-auto" />}
              </DropdownMenuItem>
              {organizations.map((o) => (
                <DropdownMenuItem key={o.id} onSelect={() => switchTo(o.id)}>
                  <Building2 />
                  <span className="truncate">{o.name}</span>
                  {org?.id === o.id && <Check className="ml-auto shrink-0" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {org && (
                <DropdownMenuItem onSelect={() => { onNavigate(); navigate({ to: "/organization" }); }}>
                  <Settings /> Organization settings
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => open("create")}>
                <Plus /> Create an organization
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => open("join")}>
                <Ticket /> Join with an invite
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <Dialog open={dialog === "create"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <form onSubmit={create} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Create an organization</DialogTitle>
              <DialogDescription>
                A shared workspace for your team's research. You'll be its owner, and your personal workspace stays exactly as it is.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="org-name">Organization name</Label>
              <Input id="org-name" required minLength={2} maxLength={80} autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Acme R&D" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={busy || value.trim().length < 2}>Create organization</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "join"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <form onSubmit={join} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Join an organization</DialogTitle>
              <DialogDescription>Paste the invite link or code you were sent by someone in the organization.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="invite-code">Invite link or code</Label>
              <Input id="invite-code" required autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…/join/…" />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={!value.trim()}>Continue</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
