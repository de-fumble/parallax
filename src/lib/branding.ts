import { queryOptions } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

// An organization's branding: a two-toned theme (primary and secondary
// colours), a logo, a favicon, and a logo for printed documents. Owners and
// heads of department set it; everyone in the organization sees it.

const db = supabase as unknown as SupabaseClient;

export const BRANDING_BUCKET = "org-branding";
export const MAX_BRAND_IMAGE_BYTES = 2 * 1024 * 1024;
export const BRAND_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const FAVICON_TYPES = [...BRAND_IMAGE_TYPES, "image/x-icon", "image/vnd.microsoft.icon"];

export type Branding = {
  org_id: string;
  primary_color: string | null;
  secondary_color: string | null;
  logo_path: string | null;
  favicon_path: string | null;
  print_logo_path: string | null;
  updated_at: string;
};

export type BrandImage = "logo" | "favicon" | "print-logo";

/** Parallax's own two tones: ink and paper. */
export const DEFAULT_PRIMARY = "#231f20";
export const DEFAULT_SECONDARY = "#ffffff";

export const PRESETS: { name: string; primary: string; secondary: string }[] = [
  { name: "Ink", primary: "#231f20", secondary: "#ffffff" },
  { name: "Navy and gold", primary: "#0b2545", secondary: "#eec643" },
  { name: "Forest and cream", primary: "#1f4d3a", secondary: "#f2e8cf" },
  { name: "Oxblood and sand", primary: "#6d1a2a", secondary: "#e9d8a6" },
  { name: "Slate and sky", primary: "#2f3e46", secondary: "#a9d6e5" },
  { name: "Plum and blush", primary: "#4a1942", secondary: "#f4c2c2" },
];

export const brandingQuery = (orgId: string) =>
  queryOptions({
    queryKey: ["branding", orgId],
    queryFn: async () => {
      const { data, error } = await db.from("organization_branding").select("*").eq("org_id", orgId).maybeSingle();
      // Before the branding part of the schema is run, every organization looks like Parallax.
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") return null;
        throw new Error(error.message);
      }
      return data as Branding | null;
    },
    staleTime: 5 * 60_000,
  });

export function brandImageUrl(path: string | null | undefined) {
  return path ? db.storage.from(BRANDING_BUCKET).getPublicUrl(path).data.publicUrl : null;
}

export async function uploadBrandImage(orgId: string, kind: BrandImage, file: File) {
  const types = kind === "favicon" ? FAVICON_TYPES : BRAND_IMAGE_TYPES;
  if (!types.includes(file.type)) throw new Error(kind === "favicon" ? "Use a PNG, JPEG, WebP or ICO file." : "Use a PNG, JPEG or WebP image.");
  if (file.size > MAX_BRAND_IMAGE_BYTES) throw new Error("Images can be up to 2 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
  // A new name each time, so browsers and the CDN never show the old image.
  const path = `${orgId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await db.storage.from(BRANDING_BUCKET).upload(path, file, { contentType: file.type, cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  return path;
}

/** Remove images no longer in use. Failing to tidy up never blocks a save. */
export async function removeBrandImages(paths: string[]) {
  if (paths.length) await db.storage.from(BRANDING_BUCKET).remove(paths).catch(() => undefined);
}

export async function saveBranding(orgId: string, b: Omit<Branding, "org_id" | "updated_at">) {
  const { error } = await db.rpc("set_org_branding", {
    _org: orgId,
    _primary: b.primary_color,
    _secondary: b.secondary_color,
    _logo: b.logo_path,
    _favicon: b.favicon_path,
    _print_logo: b.print_logo_path,
  });
  if (error) {
    throw new Error(error.code === "PGRST202" ? "Branding isn't set up in the database yet. Run supabase/schema.sql in the Supabase SQL Editor." : error.message);
  }
}

// ---------------------------------------------------------------------------
// Colour.
// ---------------------------------------------------------------------------

export const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Near-black or near-white, whichever reads better on the colour. */
export const textOn = (hex: string) => (luminance(hex) > 0.4 ? "#231f20" : "#fcfcfc");

/**
 * The theme's colour tokens for a two-toned organization. The primary colour
 * carries buttons, focus rings and the active state; the secondary colour
 * carries accents and tints the quieter surfaces.
 */
export function themeVariables(primary: string, secondary: string): Record<string, string> {
  const tint = (hex: string, pct: number) => `color-mix(in oklch, ${hex} ${pct}%, white)`;
  return {
    "--primary": primary,
    "--primary-foreground": textOn(primary),
    "--ring": primary,
    "--chart-1": primary,
    "--accent": primary,
    "--accent-foreground": textOn(primary),
    "--secondary": tint(secondary, 28),
    // The tints are light, so text on them stays dark.
    "--secondary-foreground": "#231f20",
    "--muted": tint(secondary, 14),
    "--sidebar": tint(secondary, 12),
    "--sidebar-primary": primary,
    "--sidebar-primary-foreground": textOn(primary),
    "--sidebar-accent": tint(secondary, 32),
    "--sidebar-accent-foreground": "#231f20",
    "--sidebar-ring": primary,
    "--brand-primary": primary,
    "--brand-secondary": secondary,
  };
}

// ---------------------------------------------------------------------------
// The printed-document logo.
// ---------------------------------------------------------------------------

// The Parallax mark, as drawn in src/components/ParallaxMark.tsx.
const MARK_POLYGONS = [
  "926,525 948,525 948,1165 842,653",
  "991,590 1019,590 1129,757 991,1270",
  "834,729 950,1296 655,998",
  "1149,728 1303,962 1005,1260",
  "657,1053 918,1314 822,1314 535,1237",
  "1273,1062 1408,1266 1180,1314 1021,1314",
  "496,1240 778,1314 446,1314",
  "1464,1267 1495,1314 1235,1314",
];

export function markSvg(fill: string, size?: { width: number; height: number }) {
  const dims = size ? ` width="${size.width}" height="${size.height}"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="430 505 1082 830"${dims} fill="${fill}">${MARK_POLYGONS.map((p) => `<polygon points="${p}"/>`).join("")}</svg>`;
}

export type PrintLogo = { dataUrl: string; width: number; height: number };

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't load the logo image."));
    img.src = src;
  });
}

/**
 * Recolour a logo in the organization's two tones: what is black becomes the
 * secondary colour, and all the white (and transparent) space becomes the
 * primary colour. Greys in between blend the two, so edges stay smooth.
 * Pass no image to recolour the Parallax mark.
 */
export async function recolourLogo(src: string | null, primary: string, secondary: string, maxSide = 600): Promise<PrintLogo> {
  // The mark gets a margin of white around it, which becomes the primary colour.
  const source = src ?? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markSvg("#000000", { width: 1082, height: 830 }))}`;
  const img = await loadImage(source);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const pad = src ? 0 : Math.round(Math.max(w, h) * 0.12);

  const canvas = document.createElement("canvas");
  canvas.width = w + pad * 2;
  canvas.height = h + pad * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the logo.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, pad, pad, w, h);

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const [pr, pg, pb] = rgb(primary);
  const [sr, sg, sb] = rgb(secondary);
  const d = pixels.data;
  for (let i = 0; i < d.length; i += 4) {
    // 0 for black, 1 for white.
    const t = (0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!) / 255;
    d[i] = sr + (pr - sr) * t;
    d[i + 1] = sg + (pg - sg) * t;
    d[i + 2] = sb + (pb - sb) * t;
    d[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return { dataUrl: canvas.toDataURL("image/png"), width: canvas.width, height: canvas.height };
}

/** The logo printed on an organization's documents: its print logo, else its logo, else the Parallax mark. */
export function printLogoFor(b: Branding | null | undefined) {
  if (!b) return null;
  const primary = b.primary_color ?? DEFAULT_PRIMARY;
  const secondary = b.secondary_color ?? DEFAULT_SECONDARY;
  const image = brandImageUrl(b.print_logo_path ?? b.logo_path);
  // Nothing set: the documents keep Parallax's own look.
  if (!image && !b.primary_color && !b.secondary_color) return null;
  return recolourLogo(image, primary, secondary);
}
