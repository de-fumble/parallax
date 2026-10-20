import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/use-workspace";
import { brandImageUrl, brandingQuery, DEFAULT_PRIMARY, DEFAULT_SECONDARY, printLogoFor, themeVariables } from "@/lib/branding";
import { ParallaxMark } from "@/components/ParallaxMark";

/** The branding of the organization being worked in, or null in the personal workspace. */
export function useOrgBranding() {
  const { org } = useWorkspace();
  const query = useQuery({ ...brandingQuery(org?.id ?? ""), enabled: !!org });
  return org ? (query.data ?? null) : null;
}

// While an organization is open, its colours become the theme and its favicon
// the tab icon. Switching to the personal workspace puts Parallax's back.
export function OrgBranding() {
  const branding = useOrgBranding();
  const primary = branding?.primary_color;
  const secondary = branding?.secondary_color;
  const favicon = brandImageUrl(branding?.favicon_path);

  useEffect(() => {
    if (!primary && !secondary) return;
    const root = document.documentElement;
    const vars = themeVariables(primary ?? DEFAULT_PRIMARY, secondary ?? DEFAULT_SECONDARY);
    for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
    return () => {
      for (const name of Object.keys(vars)) root.style.removeProperty(name);
    };
  }, [primary, secondary]);

  useEffect(() => {
    if (!favicon) return;
    const links = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]'));
    const original = links.map((l) => ({ link: l, href: l.href, type: l.type }));
    for (const l of links) {
      l.href = favicon;
      l.removeAttribute("type");
    }
    return () => {
      for (const o of original) {
        o.link.href = o.href;
        if (o.type) o.link.type = o.type;
      }
    };
  }, [favicon]);

  return null;
}

/** The organization's logo where Parallax's mark would be, in an organization workspace. */
export function WorkspaceLogo({ className }: { className?: string }) {
  const branding = useOrgBranding();
  const logo = brandImageUrl(branding?.logo_path);
  if (logo) return <img src={logo} alt="" className={`${className ?? ""} object-contain`} />;
  return <ParallaxMark className={className ?? ""} />;
}

/** The organization's print logo, in its colours, shown only on paper (the browser's Print). */
export function PrintOnlyLogo() {
  const branding = useOrgBranding();
  const logo = useQuery({
    queryKey: ["print-logo", branding?.org_id, branding?.updated_at],
    queryFn: async () => (await printLogoFor(branding)?.catch(() => null)) ?? null,
    enabled: !!branding,
    staleTime: Infinity,
  });
  if (!logo.data) return null;
  return <img src={logo.data.dataUrl} alt="" className="mb-6 hidden h-14 w-auto print:block" />;
}
