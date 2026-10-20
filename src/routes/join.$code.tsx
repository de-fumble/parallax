import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { joinOrganization, previewInvite, ROLE_LABELS } from "@/lib/organizations";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Where an invite link lands. Joining needs a personal account, so a visitor
// who isn't signed in is sent to sign in or sign up first and brought back.
export const Route = createFileRoute("/join/$code")({
  head: () => ({ meta: [{ title: "Join an organization — Parallax" }] }),
  component: JoinPage,
});

function JoinPage() {
  const { code } = Route.useParams();
  const { user, loading } = useAuth();
  const { switchTo, refresh } = useWorkspace();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);
  const invite = useQuery({ queryKey: ["invite", code, user?.id], queryFn: () => previewInvite(code), enabled: !!user, retry: false });

  async function join() {
    setJoining(true);
    try {
      const orgId = await joinOrganization(code);
      await refresh();
      switchTo(orgId);
      toast.success(`You've joined ${invite.data?.org_name ?? "the organization"}`);
      navigate({ to: "/research" });
    } catch (err) {
      toast.error("Couldn't join", { description: err instanceof Error ? err.message : undefined });
      setJoining(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 py-12 sm:px-6 sm:py-20">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Invitation</p>

      {loading || (user && invite.isPending) ? (
        <div className="mt-5 space-y-3" aria-label="Loading invitation">
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="h-4 w-full" />
        </div>
      ) : !user ? (
        <>
          <h1 className="mt-4 text-4xl leading-tight">You've been invited to an organization</h1>
          <p className="mt-4 text-muted-foreground">
            Joining needs a personal Parallax account. Sign in, or create one, and you'll come straight back here.
          </p>
          <Button asChild size="lg" className="mt-8 w-full">
            <Link to="/auth" search={{ redirect: `/join/${code}` }}>Sign in or create an account</Link>
          </Button>
        </>
      ) : invite.isError ? (
        <>
          <h1 className="mt-4 text-4xl leading-tight">This invite couldn't be checked</h1>
          <p className="mt-4 text-muted-foreground">{invite.error.message}</p>
        </>
      ) : !invite.data ? (
        <>
          <h1 className="mt-4 text-4xl leading-tight">This invite is no longer valid</h1>
          <p className="mt-4 text-muted-foreground">It may have expired or been withdrawn. Ask whoever sent it for a new link.</p>
          <Button asChild variant="outline" className="mt-8"><Link to="/research">Go to your workspace</Link></Button>
        </>
      ) : invite.data.already_member ? (
        <>
          <h1 className="mt-4 text-4xl leading-tight">You're already in {invite.data.org_name}</h1>
          <Button className="mt-8" onClick={() => { switchTo(invite.data!.org_id); navigate({ to: "/research" }); }}>
            Open {invite.data.org_name}
          </Button>
        </>
      ) : (
        <>
          <h1 className="mt-4 text-4xl leading-tight">Join {invite.data.org_name}</h1>
          <p className="mt-4 text-muted-foreground">
            You'll join as <span className="text-foreground">{ROLE_LABELS[invite.data.role]}</span>, signed in as{" "}
            <span className="text-foreground">{user.email}</span>. Your personal workspace stays private and you can switch between the two at any time.
          </p>
          <div className="mt-8 flex flex-col gap-2 sm:flex-row">
            <Button size="lg" disabled={joining} onClick={() => void join()}>
              {joining && <Loader2 className="animate-spin" />}
              Join {invite.data.org_name}
            </Button>
            <Button asChild size="lg" variant="ghost"><Link to="/research">Not now</Link></Button>
          </div>
        </>
      )}
    </main>
  );
}
