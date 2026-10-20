import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImageUp, Loader2, RotateCcw, Trash2 } from "lucide-react";
import {
  brandImageUrl,
  brandingQuery,
  DEFAULT_PRIMARY,
  DEFAULT_SECONDARY,
  FAVICON_TYPES,
  BRAND_IMAGE_TYPES,
  isHex,
  PRESETS,
  recolourLogo,
  removeBrandImages,
  saveBranding,
  themeVariables,
  uploadBrandImage,
  type BrandImage,
} from "@/lib/branding";
import { isManager } from "@/lib/organizations";
import { Panel, useCollab } from "@/components/collab/kit";
import { ParallaxMark } from "@/components/ParallaxMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

type Images = { logo: string | null; favicon: string | null; "print-logo": string | null };

// The organization's look: two colours, a logo, a favicon and the logo on
// printed documents. Research Managers, heads of department and owners
// change it; the Settings page shows it to no one else.
export function BrandingSettings() {
  const { orgId, role } = useCollab();
  const queryClient = useQueryClient();
  const saved = useQuery(brandingQuery(orgId));
  const editable = isManager(role);

  const [primary, setPrimary] = useState(DEFAULT_PRIMARY);
  const [secondary, setSecondary] = useState(DEFAULT_SECONDARY);
  const [images, setImages] = useState<Images>({ logo: null, favicon: null, "print-logo": null });
  const [busy, setBusy] = useState(false);

  // Start from what's saved, and again after every save.
  useEffect(() => {
    const b = saved.data;
    setPrimary(b?.primary_color ?? DEFAULT_PRIMARY);
    setSecondary(b?.secondary_color ?? DEFAULT_SECONDARY);
    setImages({ logo: b?.logo_path ?? null, favicon: b?.favicon_path ?? null, "print-logo": b?.print_logo_path ?? null });
  }, [saved.data]);

  const before = {
    primary: saved.data?.primary_color ?? DEFAULT_PRIMARY,
    secondary: saved.data?.secondary_color ?? DEFAULT_SECONDARY,
    logo: saved.data?.logo_path ?? null,
    favicon: saved.data?.favicon_path ?? null,
    "print-logo": saved.data?.print_logo_path ?? null,
  };
  const dirty =
    primary !== before.primary || secondary !== before.secondary || (Object.keys(images) as BrandImage[]).some((k) => images[k] !== before[k]);
  const validColours = isHex(primary) && isHex(secondary);

  async function save(next = { primary, secondary, images }) {
    setBusy(true);
    try {
      const plain = next.primary.toLowerCase() === DEFAULT_PRIMARY && next.secondary.toLowerCase() === DEFAULT_SECONDARY;
      await saveBranding(orgId, {
        primary_color: plain ? null : next.primary.toLowerCase(),
        secondary_color: plain ? null : next.secondary.toLowerCase(),
        logo_path: next.images.logo,
        favicon_path: next.images.favicon,
        print_logo_path: next.images["print-logo"],
      });
      // Images that were replaced or removed are no longer needed.
      const kept = new Set(Object.values(next.images));
      await removeBrandImages([before.logo, before.favicon, before["print-logo"]].filter((p): p is string => !!p && !kept.has(p)));
      await queryClient.invalidateQueries({ queryKey: ["branding", orgId] });
      toast.success("Branding saved", { description: "Everyone in the organization sees it the next time a page loads." });
    } catch (err) {
      toast.error("Couldn't save the branding", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  if (saved.isPending) return <Skeleton className="h-96" />;

  return (
    <Panel title="Branding">
      <div className="space-y-8 p-4 sm:p-5">

        <section className="space-y-4">
          <div>
            <h3 className="font-sans text-sm font-medium">Theme colours</h3>
            <p className="text-xs text-muted-foreground">A two-toned theme. The primary colour carries buttons, links and the active state; the secondary colour tints the sidebar and quieter surfaces.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <ColourField label="Primary colour" value={primary} onChange={setPrimary} disabled={!editable} />
            <ColourField label="Secondary colour" value={secondary} onChange={setSecondary} disabled={!editable} />
          </div>
          {editable && (
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setPrimary(p.primary);
                    setSecondary(p.secondary);
                  }}
                  className="flex items-center gap-2 border border-border px-2.5 py-1.5 text-xs hover:bg-muted"
                >
                  <span className="flex">
                    <span className="size-4 border border-border" style={{ background: p.primary }} />
                    <span className="size-4 border border-l-0 border-border" style={{ background: p.secondary }} />
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {validColours && <ThemePreview primary={primary} secondary={secondary} logo={brandImageUrl(images.logo)} />}
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <ImageField
            kind="logo"
            label="Logo"
            hint="Shown in the workspace menu. A square or wide PNG, JPEG or WebP, up to 2 MB."
            path={images.logo}
            disabled={!editable}
            onChange={(p) => setImages({ ...images, logo: p })}
          />
          <ImageField
            kind="favicon"
            label="Favicon"
            hint="The browser tab icon while the organization is open. A square PNG or ICO, 64 × 64 or larger."
            path={images.favicon}
            disabled={!editable}
            onChange={(p) => setImages({ ...images, favicon: p })}
          />
          <ImageField
            kind="print-logo"
            label="Logo on printed documents"
            hint="Top left of every PDF, Word export and print-out. A black logo on white works best. Without one, the logo above is used."
            path={images["print-logo"]}
            disabled={!editable}
            onChange={(p) => setImages({ ...images, "print-logo": p })}
          />
        </section>

        {validColours && <PrintPreview image={brandImageUrl(images["print-logo"] ?? images.logo)} primary={primary} secondary={secondary} />}

        {editable && (
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button
              variant="ghost"
              disabled={busy || (!saved.data?.primary_color && !saved.data?.secondary_color && !before.logo && !before.favicon && !before["print-logo"])}
              onClick={() => void save({ primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY, images: { logo: null, favicon: null, "print-logo": null } })}
            >
              <RotateCcw /> Back to Parallax's look
            </Button>
            <div className="flex items-center gap-3">
              {!validColours && <span className="text-xs text-weak">Colours must look like #1a2b3c.</span>}
              <Button disabled={!dirty || busy || !validColours} onClick={() => void save()}>
                {busy && <Loader2 className="animate-spin" />} {dirty ? "Save branding" : "Saved"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function ColourField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (v: string) => void; disabled: boolean }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={isHex(value) ? value : "#000000"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 shrink-0 cursor-pointer border border-input bg-background p-1 disabled:cursor-default md:h-9"
        />
        <Input id={id} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value.trim())} className="font-mono" maxLength={7} spellCheck={false} />
      </div>
    </div>
  );
}

// A small piece of the workspace in the chosen colours. The theme is made of
// CSS variables, so setting them on this box restyles everything inside it.
function ThemePreview({ primary, secondary, logo }: { primary: string; secondary: string; logo: string | null }) {
  return (
    <div style={themeVariables(primary, secondary) as React.CSSProperties} className="grid overflow-hidden border border-border sm:grid-cols-[11rem_1fr]" aria-label="Preview">
      <div className="space-y-1 bg-sidebar p-3 text-sm text-sidebar-foreground">
        <div className="mb-3 flex items-center gap-2">
          {logo ? <img src={logo} alt="" className="h-5 max-w-8 object-contain" /> : <ParallaxMark className="h-5 w-auto" />}
          <span className="font-serif text-lg leading-none">Workspace</span>
        </div>
        <div className="bg-sidebar-accent px-2 py-1.5">Collaboration</div>
        <div className="px-2 py-1.5 text-muted-foreground">New research</div>
        <div className="px-2 py-1.5 text-muted-foreground">History</div>
      </div>
      <div className="space-y-3 bg-background p-4">
        <div className="font-serif text-2xl">Overview</div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" type="button">Primary action</Button>
          <Button size="sm" variant="secondary" type="button">Secondary</Button>
          <Button size="sm" variant="outline" type="button">Outline</Button>
        </div>
        <div className="bg-muted p-3 text-xs text-muted-foreground">
          A quieter surface, with a citation <span className="cite-chip">S1</span>
        </div>
      </div>
    </div>
  );
}

// The printed logo as it will come out: black parts in the secondary colour,
// white space in the primary colour.
function PrintPreview({ image, primary, secondary }: { image: string | null; primary: string; secondary: string }) {
  const logo = useQuery({
    queryKey: ["print-logo-preview", image, primary, secondary],
    queryFn: () => recolourLogo(image, primary, secondary, 400),
    staleTime: Infinity,
    retry: false,
  });
  return (
    <section className="space-y-2">
      <h3 className="font-sans text-sm font-medium">How printed documents look</h3>
      <div className="max-w-md border border-border bg-white p-6 text-[#231f20] shadow-sm">
        {logo.isPending ? (
          <Skeleton className="h-14 w-24" />
        ) : logo.isError ? (
          <p className="text-xs text-weak">Couldn't draw the logo: {logo.error.message}</p>
        ) : (
          <img src={logo.data.dataUrl} alt="Printed logo" className="h-14 w-auto" />
        )}
        <div className="mt-4 font-sans text-lg font-bold">Report title</div>
        <div className="mt-1 h-2 w-3/4 bg-neutral-200" />
        <div className="mt-1.5 h-2 w-1/2 bg-neutral-200" />
      </div>
      <p className="text-xs text-muted-foreground">The black parts of the logo print in the secondary colour and all the white space in the primary colour.</p>
    </section>
  );
}

function ImageField({ kind, label, hint, path, disabled, onChange }: {
  kind: BrandImage;
  label: string;
  hint: string;
  path: string | null;
  disabled: boolean;
  onChange: (path: string | null) => void;
}) {
  const { orgId } = useCollab();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const url = brandImageUrl(path);

  async function pick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      onChange(await uploadBrandImage(orgId, kind, file));
    } catch (err) {
      toast.error(`Couldn't upload the ${label.toLowerCase()}`, { description: err instanceof Error ? err.message : undefined });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex h-24 items-center justify-center border border-dashed border-border bg-muted/30 p-3">
        {uploading ? <Loader2 className="size-5 animate-spin text-muted-foreground" /> : url ? <img src={url} alt={label} className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">Parallax's</span>}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="flex-1" disabled={uploading} onClick={() => input.current?.click()}>
            <ImageUp /> {url ? "Replace" : "Upload"}
          </Button>
          {url && (
            <Button type="button" variant="ghost" size="sm" aria-label={`Remove the ${label.toLowerCase()}`} onClick={() => onChange(null)}>
              <Trash2 />
            </Button>
          )}
          <input
            ref={input}
            type="file"
            className="sr-only"
            accept={(kind === "favicon" ? FAVICON_TYPES : BRAND_IMAGE_TYPES).join(",")}
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
