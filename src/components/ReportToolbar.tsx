import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Download, Loader2, MoreHorizontal, Pencil, Printer, RotateCw, Trash2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { reportQuery } from "@/lib/reports.queries";
import { buildExportDoc, EXPORT_FORMATS, exportReport, toMarkdown, type ExportFormat, type ExportSource } from "@/lib/report-export";
import { printLogoFor } from "@/lib/branding";
import { useOrgBranding } from "@/components/OrgBranding";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = {
  id: string;
  /** The report as currently saved, edits included; exports and copies use this. */
  source: ExportSource;
  context: string | null;
  /** True when the user has saved edits over the original. */
  edited: boolean;
  /** False for an organization member looking at someone else's report: read and export only. */
  canChange: boolean;
  onEdit: () => void;
  onReset: () => void;
};

export function ReportToolbar({ id, source, context, edited, canChange, onEdit, onReset }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const branding = useOrgBranding();
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<"reset" | "delete" | null>(null);

  async function download(format: ExportFormat) {
    setExporting(format);
    try {
      // Inside a branded organization, printed documents carry its logo in its colours.
      const logo = format === "pdf" || format === "docx" ? await printLogoFor(branding)?.catch(() => null) : null;
      await exportReport(source, format, logo ?? null);
    } catch (err) {
      toast.error("Couldn't export the report", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(toMarkdown(buildExportDoc(source)));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      // The phone menu closes on tap, so the button's "Copied" label is never seen there.
      if (window.matchMedia("(max-width: 767px)").matches) toast.success("Report text copied");
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  }

  async function remove() {
    const { error } = await supabase.from("reports").delete().eq("id", id);
    if (error) {
      toast.error("Couldn't delete the report", { description: error.message });
      return;
    }
    queryClient.removeQueries({ queryKey: reportQuery(id).queryKey });
    await queryClient.invalidateQueries({ queryKey: ["reports"] });
    toast.success("Report deleted");
    navigate({ to: "/history" });
  }

  const runAgain = { topic: source.topic, ...(context ? { context } : {}), mode: source.report.mode };

  return (
    <div data-tour="report-toolbar" className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4 mb-6 lg:mb-8 lg:pb-5 print:hidden">
      <div className="flex flex-wrap items-center gap-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={exporting !== null} className="gap-2 shadow-2xs">
              {exporting ? <Loader2 className="animate-spin size-3.5" /> : <Download className="size-3.5" />}
              <span>{exporting ? "Preparing…" : "Export report"}</span>
              <ChevronDown className="size-3 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60 shadow-lg">
            <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Document format
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {EXPORT_FORMATS.map((f) => (
              <DropdownMenuItem key={f.id} onSelect={() => void download(f.id)} className="py-2">
                <span className="font-medium">{f.label}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">{f.hint}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {canChange && (
          <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5 border-border/80 hover:bg-muted/50">
            <Pencil className="size-3.5" /> <span>Edit report</span>
          </Button>
        )}

        {/* A row of six buttons wraps untidily on a phone, so the rest fold into one menu there. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden size-8" aria-label="More actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => window.print()}><Printer className="size-4" /> Print document</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void copy()}><Copy className="size-4" /> Copy markdown text</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate({ to: "/research", search: runAgain })}><RotateCw className="size-4" /> Run again</DropdownMenuItem>
            {canChange && <DropdownMenuSeparator />}
            {canChange && edited && <DropdownMenuItem onSelect={() => setConfirm("reset")}><Undo2 className="size-4" /> Reset to original</DropdownMenuItem>}
            {canChange && <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm("delete")}><Trash2 className="size-4" /> Delete</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="hidden flex-wrap items-center gap-2 md:flex">
          <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 border-border/80 hover:bg-muted/50">
            <Printer className="size-3.5" /> <span>Print</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copy()} className="gap-1.5 border-border/80 hover:bg-muted/50">
            {copied ? <Check className="size-3.5 text-strong" /> : <Copy className="size-3.5" />}
            <span>{copied ? "Copied" : "Copy text"}</span>
          </Button>
          <Button asChild variant="outline" size="sm" className="gap-1.5 border-border/80 hover:bg-muted/50">
            <Link to="/research" search={runAgain}>
              <RotateCw className="size-3.5" /> <span>Re-run inquiry</span>
            </Link>
          </Button>
        </div>
      </div>

      <div className="hidden items-center gap-2 md:flex">
        {canChange && edited && (
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setConfirm("reset")}>
            <Undo2 className="size-3.5 mr-1" /> Reset to original
          </Button>
        )}
        {canChange && (
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setConfirm("delete")}>
            <Trash2 className="size-3.5 mr-1" /> Delete
          </Button>
        )}
      </div>

      {/* One confirmation for each destructive action, opened from the buttons or from the phone menu. */}
      <AlertDialog open={confirm === "reset"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard your edits?</AlertDialogTitle>
            <AlertDialogDescription>
              The report goes back to exactly what Parallax wrote, in its original order. Your edited wording and layout will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my edits</AlertDialogCancel>
            <AlertDialogAction onClick={onReset}>Reset to original</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirm === "delete"} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this report?</AlertDialogTitle>
            <AlertDialogDescription>
              It will be removed from your history for good. Export it first if you want to keep a copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>Delete report</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
