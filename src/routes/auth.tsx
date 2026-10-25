import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PENDING_ORG_KEY } from "@/hooks/use-workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { ParallaxMark } from "@/components/ParallaxMark";

function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="!size-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

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

  // Coming back from Google with the Back button restores this page as it was, spinner and all.
  useEffect(() => {
    const reset = (e: PageTransitionEvent) => { if (e.persisted) setGoogleBusy(false); };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

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
      <main className="mx-auto flex min-h-[calc(100dvh-4.5rem)] max-w-sm flex-col justify-center px-6 pb-12 pt-6 sm:py-16">
        <ParallaxMark className="mx-auto mb-6 h-12 w-auto md:hidden" />
        <h1 className="text-center text-4xl md:text-left">{mode === "in" ? "Welcome back" : "Create an account"}</h1>
        <Button
          variant="outline"
          size="lg"
          className="mt-8 w-full max-md:border-border max-md:bg-card max-md:shadow-md"
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
          {googleBusy ? <Loader2 className="animate-spin" /> : <GoogleG />}
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
                    className={`press rounded-2xl border px-3 py-3 text-left transition-colors md:rounded-none md:py-2.5 ${kind === id ? "border-foreground bg-muted" : "border-border hover:bg-muted/50"}`}>
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
          <Button type="submit" size="lg" className="w-full" disabled={busy || googleBusy}>
            {busy && <Loader2 className="animate-spin" />}
            {mode === "in" ? (busy ? "Signing in…" : "Sign in") : busy ? "Creating account…" : "Sign up"}
          </Button>
        </form>
        <button className="mt-2 py-4 text-sm text-muted-foreground md:underline" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
        <p className="mt-4 text-center text-xs text-muted-foreground md:text-left">
          By continuing you agree to our <Link to="/terms" className="underline hover:text-foreground">Terms of Service</Link> and{" "}
          <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
        </p>
      </main>
  );
}
