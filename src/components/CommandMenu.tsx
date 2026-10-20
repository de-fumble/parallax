import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileText, History, Home, Plus } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/use-workspace";
import { reportListQuery } from "@/lib/reports.queries";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

// Jump anywhere in the workspace, or find a report by name. Opens with ⌘K / Ctrl K.
export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orgId } = useWorkspace();
  const reports = useQuery({ ...reportListQuery(user?.id ?? "", orgId), enabled: !!user });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const go = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search reports or jump to…" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => go(() => navigate({ to: "/research" }))}>
            <Plus /> New research
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/history" }))}>
            <History /> History
          </CommandItem>
          <CommandItem onSelect={() => go(() => navigate({ to: "/" }))}>
            <Home /> Parallax home page
          </CommandItem>
        </CommandGroup>
        {reports.data && reports.data.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Reports">
              {reports.data.map((r) => (
                <CommandItem
                  key={r.id}
                  // cmdk matches on this value; the id keeps same-named reports distinct.
                  value={`${r.title ?? ""} ${r.topic} ${r.id}`}
                  onSelect={() => go(() => navigate({ to: "/reports/$id", params: { id: r.id } }))}
                >
                  <FileText />
                  <span className="truncate">{r.title || r.topic}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
