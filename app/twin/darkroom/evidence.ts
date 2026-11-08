// The AV- reference for the incident, computed exactly as the console computes it
// (lib/evidence.ts: evidenceFor on the fix card, else evidenceForIssue on the sensor issue), so
// the judge can carry it from the headset to the Darkroom box. Unit-tested in logic.test.ts.
import { evidenceFor, evidenceForIssue, type Evidence } from "@/lib/evidence";
import type { ConsoleView } from "@/lib/eog/alerts";

export function incidentEvidence(view: ConsoleView | null, dataset: string, facilityId: string | null, lockRef?: string | null): Evidence | null {
  if (!view) return null;
  const all: Evidence[] = [];
  for (const a of view.alerts) {
    const ev = a.fix ? evidenceFor(a, dataset, view.now) : null;
    if (ev) all.push(ev);
  }
  for (const s of view.sensors ?? []) {
    const ev = evidenceForIssue(s, dataset, view.now);
    if (ev) all.push(ev);
  }
  // A lockdown names its reference: that one first.
  if (lockRef) { const hit = all.find((e) => e.ref === lockRef); if (hit) return hit; }
  if (facilityId) {
    const mine = all.filter((e) => e.record.facility_id === facilityId);
    return mine.find((e) => e.record.simulated) ?? mine[0] ?? null;
  }
  return all.find((e) => e.record.simulated) ?? null;
}
