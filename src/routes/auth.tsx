import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PENDING_ORG_KEY } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

// Where to go after signing in: an invite link, or the page that asked for a
// sign-in. Only paths inside this site are accepted.
const safeRedirect = (value: unknown) => (typeof value === "string" && /^\/(?!\/)/.test(value) ? value : undefined);

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => {
    const redirect = safeRedirect(search["redirect"]);
    return redirect ? { redirect } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in — Parallax" },
      { name: "description", content: "Sign in to Parallax to run and save evidence-linked research reports." },
      { property: "og:title", content: "Sign in — Parallax" },
      { property: "og:description", content: "Sign in to run and save evidence-linked research reports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  // At sign-up: a personal account alone, or one that also starts an organization.
  const [kind, setKind] = useState<"personal" | "organization">("personal");
  const [orgName, setOrgName] = useState("");
  const { redirect } = Route.useSearch();
  // Read when a button is pressed, not while rendering: this page is also rendered on the server.
  const comeBackTo = () => `${window.location.origin}${redirect ?? "/research"}`;

  useEffect(() => {
    if (user) navigate({ to: redirect ?? "/research" });
  }, [user, navigate, redirect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error, data } =
      mode === "in"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: {
              emailRedirectTo: comeBackTo(),
              // The organization is created on first sign-in, once the email is confirmed.
              ...(kind === "organization" && orgName.trim() ? { data: { pending_org: orgName.trim() } } : {}),
            },
          });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (mode === "up" && !data.session) toast.success("Check your email to confirm your account.");
  }

  return (
      <main className="mx-auto max-w-sm px-5 py-10 sm:px-6 sm:py-16">
        <h1 className="text-4xl">{mode === "in" ? "Welcome back" : "Create an account"}</h1>
        <Button
          variant="outline"
          className="mt-8 w-full"
          disabled={googleBusy || busy}
          onClick={async () => {
            setGoogleBusy(true);
            // Google sign-up can't carry the organization name, so it waits in this browser until sign-in completes.
            if (mode === "up" && kind === "organization" && orgName.trim()) window.localStorage.setItem(PENDING_ORG_KEY, orgName.trim());
            else window.localStorage.removeItem(PENDING_ORG_KEY);
            const { error } = await supabase.auth.signInWithOAuth({
              provider: "google",
              options: { redirectTo: comeBackTo() },
            });
            // On success the browser leaves for Google, so only an error needs handling.
            if (error) {
              toast.error(error.message);
              setGoogleBusy(false);
            }
          }}
        >
          {googleBusy && <Loader2 className="animate-spin" />}
          Continue with Google
        </Button>
        <div className="my-6 text-center font-mono text-xs uppercase text-muted-foreground">or</div>
        <form onSubmit={submit} className="space-y-4">
          {mode === "up" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">What are you setting up?</legend>
              <div className="grid grid-cols-2 gap-2">
                {([["personal", "Personal account", "Just for me"], ["organization", "Organization", "For my team"]] as const).map(([id, title, hint]) => (
                  <button key={id} type="button" role="radio" aria-checked={kind === id} onClick={() => setKind(id)}
                    className={`border px-3 py-2.5 text-left transition-colors ${kind === id ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"}`}>
                    <div className="text-sm font-medium">{title}</div>
                    <div className="text-xs text-muted-foreground">{hint}</div>
                  </button>
                ))}
              </div>
              {kind === "organization" && (
                <div className="space-y-1.5 pt-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <Label htmlFor="org">Organization name</Label>
                  <Input id="org" required minLength={2} maxLength={80} value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="e.g. Acme R&D" />
                  <p className="text-xs text-muted-foreground">
                    You get a personal account too, and can switch between the two. You'll be the organization's owner.
                  </p>
                </div>
              )}
            </fieldset>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">Password</Label>
            <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={busy || googleBusy}>
            {busy && <Loader2 className="animate-spin" />}
            {mode === "in" ? (busy ? "Signing in…" : "Sign in") : busy ? "Creating account…" : "Sign up"}
          </Button>
        </form>
        <button className="mt-2 py-3 text-sm text-muted-foreground underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </main>
  );
}
