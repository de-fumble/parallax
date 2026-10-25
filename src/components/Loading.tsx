import { ParallaxMark } from "@/components/ParallaxMark";
import { Skeleton } from "@/components/ui/skeleton";

// Shown while a page's data loads: the shape of a page, not a spinner.
export function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 px-5 py-8 animate-in fade-in duration-300 sm:px-6" aria-busy aria-label="Loading">
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-2/3 max-w-sm" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-4 rounded-2xl border border-border p-4 md:rounded-none">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Shown once, while the app works out who is signed in.
export function AppSplash() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6" role="status" aria-label="Loading workspace">
      <ParallaxMark className="h-10 w-auto animate-pulse" />
      <div className="h-0.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className="indeterminate-bar h-full w-1/3 bg-foreground" />
      </div>
    </div>
  );
}
