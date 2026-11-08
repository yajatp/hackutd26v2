// Which evidence and which plan a lockdown is about, from what the console shows now. The row
// carries only the AV- reference and the tank; the fingerprint and the plan come from the view,
// computed the same way the console computes them (lib/evidence.ts).
import { evidenceFor, evidenceForIssue, type Evidence } from "@/lib/evidence";
import type { Alert, ConsoleView } from "@/lib/eog/alerts";

export function findEvidence(view: ConsoleView | null, dataset: string, ref: string): Evidence | null {
  if (!view) return null;
  for (const a of view.alerts) {
    const ev = a.fix ? evidenceFor(a, dataset, view.now) : null;
    if (ev?.ref === ref) return ev;
  }
  for (const s of view.sensors ?? []) {
    const ev = evidenceForIssue(s, dataset, view.now);
    if (ev?.ref === ref) return ev;
  }
  return null;
}

// The plan that is put on hold: the fix card on the suspect tank, else the top fix card.
export function heldPlan(view: ConsoleView | null, tank: string): Alert | null {
  if (!view) return null;
  const fixes = view.alerts.filter((a) => a.fix);
  return fixes.find((a) => a.facility.tank.id === tank) ?? fixes[0] ?? null;
}
