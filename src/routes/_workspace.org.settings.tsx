import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";
import { isManager, ROLE_LABELS, ROLES } from "@/lib/organizations";
import { PERMISSIONS } from "@/lib/collab/rules";
import { Avatar, Panel, PageTitle, useCollab } from "@/components/collab/kit";
import { BrandingSettings } from "@/components/collab/BrandingSettings";

export const Route = createFileRoute("/_workspace/org/settings")({
  component: Settings,
});

function Settings() {
  const { members, role } = useCollab();
  const order = [...ROLES].reverse();
  return (
    <div className="space-y-6">
      <PageTitle
        title="Settings"
        sub={isManager(role) ? "The organization's branding, who can do what, and how a request is approved." : "Who can do what, and how a request is approved."}
      />

      {/* Branding is for Research Managers and above only. */}
      {isManager(role) && <BrandingSettings />}

      <Panel title="Roles and permissions">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-sm">
            <thead className="border-b border-border text-left">
              <tr>
                <th className="px-4 py-2 font-normal text-muted-foreground">Can…</th>
                {order.map((r) => <th key={r} className="px-2 py-2 text-center text-xs font-medium">{ROLE_LABELS[r]}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PERMISSIONS.map((p) => (
                <tr key={p.action}>
                  <td className="px-4 py-2.5">{p.action}</td>
                  {order.map((r) => (
                    <td key={r} className="px-2 py-2.5 text-center">
                      {p.who.includes(r) ? <Check className="mx-auto size-4 text-strong" aria-label="Yes" /> : <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="No" />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="How a request is approved">
        <ul className="divide-y divide-border text-sm">
          {[
            ["Work by Research Interns and Research Assistants", "A Research Manager approves first, then the head of department files it. With no Research Manager in the organization, it goes straight to the head of department."],
            ["Work by Research Managers, heads of department and owners", "The head of department files it."],
            ["Your own request", "Someone else in the right role must approve it, unless nobody else could."],
            ["Changes after approval", "Saving a new revision while a request is in review sends it back to the first stage."],
            ["Waiting reviewers", "Reviewers are reminded once a day while a request waits on them for more than 24 hours."],
            ["On filing", "The draft becomes the document's next version, and each next step becomes a task for the person named."],
          ].map(([what, rule]) => (
            <li key={what} className="grid gap-1 px-4 py-3 sm:grid-cols-[16rem_1fr] sm:gap-4">
              <span className="font-medium">{what}</span>
              <span className="text-muted-foreground">{rule}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="People" action={<Link to="/organization" className="text-xs underline">Change roles</Link>}>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <Avatar id={m.user_id} size="sm" />
              <span className="min-w-0 flex-1 truncate">{m.full_name || m.email}</span>
              <span className="text-xs text-muted-foreground">{ROLE_LABELS[m.role]}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
