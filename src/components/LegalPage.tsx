import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

// Change this to the address people should write to about privacy and terms.
export const LEGAL_CONTACT_EMAIL = "support@parallax.app";
export const LEGAL_UPDATED = "25 October 2026";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="landing-uniform mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
      <Link to="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">← Parallax</Link>
      <h1 className="mt-6 text-4xl sm:text-5xl">{title}</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated {LEGAL_UPDATED}</p>
      <div className="mt-10 space-y-4 text-[15px] leading-relaxed text-foreground/90 [&_h2]:mt-10 [&_h2]:text-2xl [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5 [&_a]:underline">
        {children}
      </div>
      <nav className="mt-14 flex gap-5 border-t border-border pt-6 text-sm text-muted-foreground">
        <Link to="/privacy" className="hover:text-foreground">Privacy Policy</Link>
        <Link to="/terms" className="hover:text-foreground">Terms of Service</Link>
      </nav>
    </main>
  );
}
