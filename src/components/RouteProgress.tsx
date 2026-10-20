import { useRouterState } from "@tanstack/react-router";

// A thin bar across the top while a page is loading. The fade-in is delayed so
// instant navigations never flash it.
export function RouteProgress() {
  const pending = useRouterState({ select: (s) => s.status === "pending" });
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity duration-200 ${
        pending ? "opacity-100 delay-150" : "opacity-0"
      }`}
    >
      <div className="indeterminate-bar h-full w-1/3 bg-accent" />
    </div>
  );
}
