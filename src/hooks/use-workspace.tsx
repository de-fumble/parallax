import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createOrganization, orgListQuery, type Organization } from "@/lib/organizations";

// Which workspace the user is working in: their personal one, or one of the
// organizations they belong to. Everyone has the personal workspace; being in
// an organization never takes it away.

type WorkspaceState = {
  /** The organization being worked in, or null for the personal workspace. */
  org: Organization | null;
  /** Convenience: the id to scope queries and new research by. */
  orgId: string | null;
  name: string;
  organizations: Organization[];
  loading: boolean;
  /** Pass null for the personal workspace. */
  switchTo: (orgId: string | null) => void;
  /** Re-read the organization list (after creating, joining, renaming, leaving). */
  refresh: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceState>({
  org: null,
  orgId: null,
  name: "Personal",
  organizations: [],
  loading: true,
  switchTo: () => {},
  refresh: async () => {},
});

const storageKey = (userId: string) => `parallax:workspace:${userId}`;

/** Holds the organization name across a Google sign-up, which can't carry it any other way. */
export const PENDING_ORG_KEY = "parallax:pending-org";

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? "";
  const list = useQuery({ ...orgListQuery(userId), enabled: !!user });
  const [selected, setSelected] = useState<string | null>(null);

  // Come back to the workspace that was open last time, on this device.
  useEffect(() => {
    setSelected(userId ? window.localStorage.getItem(storageKey(userId)) : null);
  }, [userId]);

  const switchTo = useCallback(
    (orgId: string | null) => {
      setSelected(orgId);
      if (!userId) return;
      if (orgId) window.localStorage.setItem(storageKey(userId), orgId);
      else window.localStorage.removeItem(storageKey(userId));
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["organizations"] });
  }, [queryClient]);

  // Someone who chose "create an organization" at sign-up only gets a session
  // after confirming their email, so the organization is created on first sign-in.
  const fromSignUp = typeof user?.user_metadata?.["pending_org"] === "string" ? (user.user_metadata["pending_org"] as string) : "";
  const [fromBrowser, setFromBrowser] = useState("");
  useEffect(() => {
    if (userId) setFromBrowser(window.localStorage.getItem(PENDING_ORG_KEY) ?? "");
  }, [userId]);
  const pendingOrg = fromSignUp || fromBrowser;
  const creating = useRef(false);
  useEffect(() => {
    // Clearing the marker below updates the user, which re-runs this effect
    // mid-flight; the flag makes sure the organization is still created once
    // and that the work in progress is allowed to finish.
    if (!pendingOrg || !userId || creating.current) return;
    creating.current = true;
    void (async () => {
      // Clear the markers first so a second tab can't create the organization twice.
      window.localStorage.removeItem(PENDING_ORG_KEY);
      setFromBrowser("");
      if (fromSignUp) await supabase.auth.updateUser({ data: { pending_org: null } });
      try {
        const id = await createOrganization(pendingOrg);
        await queryClient.invalidateQueries({ queryKey: ["organizations"] });
        switchTo(id);
        toast.success(`${pendingOrg} is ready`, { description: "You're its owner. Invite your team from Organization settings." });
      } catch (err) {
        toast.error("Couldn't create your organization", { description: err instanceof Error ? err.message : undefined });
      } finally {
        creating.current = false;
      }
    })();
  }, [pendingOrg, fromSignUp, userId, queryClient, switchTo]);

  const value = useMemo<WorkspaceState>(() => {
    const organizations = list.data ?? [];
    // A remembered organization the user has since left falls back to personal.
    const org = organizations.find((o) => o.id === selected) ?? null;
    return {
      org,
      orgId: org?.id ?? null,
      name: org?.name ?? "Personal",
      organizations,
      loading: !!user && list.isPending,
      switchTo,
      refresh,
    };
  }, [list.data, list.isPending, selected, user, switchTo, refresh]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  return useContext(WorkspaceContext);
}
