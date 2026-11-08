// Run: npx tsx --test app/twin/darkroom/logic.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { DarkroomSnapshot } from "@/lib/darkroom-live";
import { appendEvent, type LogEvent } from "@/lib/chain";
import { alertVisible, attackSignal, consoleRows, dismissAlert, NO_ALERT, settleAlert } from "./logic";
import { incidentEvidence } from "./evidence";
import { evidenceForIssue, refOf } from "@/lib/evidence";
import type { ConsoleView } from "@/lib/eog/alerts";

const S5 = { facility_id: "f5", name: "S5 Facility C" };

test("no fake and no lockdown: no signal", () => {
  assert.equal(attackSignal({ faked: [], lockdown: null }), null);
  assert.equal(attackSignal({ faked: [], lockdown: { active: false, tank: "t", evidenceRef: "", startedAtMs: 1 } }), null);
});

test("a faked tank names the facility in one plain line", () => {
  const s = attackSignal({ faked: [S5], lockdown: null })!;
  assert.equal(s.line, "S5 Facility C tank sensor is reporting false data (simulated attack).");
  assert.equal(s.facilityId, "f5");
  assert.equal(s.lockdown, false);
  const two = attackSignal({ faked: [S5, { facility_id: "f2", name: "S2 Facility A" }], lockdown: null })!;
  assert.match(two.line, /^S2 Facility A .*\(and 1 more\)\.$/);
});

test("a lockdown alone is a signal, with its reference", () => {
  const s = attackSignal({ faked: [], lockdown: { active: true, tank: "T-9", evidenceRef: "AV-AAAA-BBBB", startedAtMs: 5 } })!;
  assert.equal(s.lockdown, true);
  assert.match(s.line, /LOCKDOWN is active.*T-9.*AV-AAAA-BBBB/);
});

test("the alert shows once per signal; a dismissal holds until the signal changes", () => {
  const a = attackSignal({ faked: [S5], lockdown: null });
  let st = NO_ALERT;
  assert.equal(alertVisible(st, a), true);
  st = dismissAlert(st, a);
  assert.equal(alertVisible(st, a), false);
  // Same signal, new object (a new frame of data): still dismissed.
  assert.equal(alertVisible(st, attackSignal({ faked: [S5], lockdown: null })), false);
  // A lockdown on top is a new signal: shows again.
  const b = attackSignal({ faked: [S5], lockdown: { active: true, tank: "T", evidenceRef: "", startedAtMs: 9 } });
  assert.equal(alertVisible(st, b), true);
  // The signal clears: the memory resets, so the same fake later alerts again.
  st = settleAlert(st, null);
  assert.deepEqual(st, NO_ALERT);
  assert.equal(alertVisible(st, a), true);
  assert.equal(alertVisible(st, null), false);
  // While a signal is up, settle keeps the dismissal.
  const kept = dismissAlert(NO_ALERT, a);
  assert.equal(settleAlert(kept, a), kept);
});

function snap(events: LogEvent[], extra: Partial<DarkroomSnapshot> = {}): DarkroomSnapshot {
  return {
    connection: "live", ready: true, identity: "me", events,
    members: [{ identity: "id1", name: "Ana", role: "commander", active: true }, { identity: "id2", name: "Old", role: "viewer", active: false }],
    me: null, head: null, status: { kind: "verified", text: "LOG VERIFIED", count: events.length, head: events.at(-1)?.hash ?? "" },
    witness: null, error: null, rttMs: null, ...extra,
  };
}

test("console rows: newest 5 entries, who from the members, team, incident open/closed", () => {
  let log: LogEvent[] = [];
  const add = (type: string) => { log = [...log, appendEvent(log, { incident_id: "i1", ts: "2026-11-08T07:00:00Z", actor: "Ana|commander|id1", type, payload: {} })]; };
  add("incident_opened");
  for (let i = 0; i < 6; i++) add("note");
  const r = consoleRows(snap(log));
  assert.equal(r.live, true);
  assert.equal(r.status.tone, "ok");
  assert.equal(r.status.text, "LOG VERIFIED");
  assert.equal(r.entries.length, 5);
  assert.equal(r.entries[0].seq, `#${log.at(-1)!.seq}`);
  assert.equal(r.entries[0].who, "Ana");
  assert.equal(r.entries[0].hash, log.at(-1)!.hash.slice(0, 8));
  assert.deepEqual(r.team, [{ name: "Ana", role: "commander" }]);
  assert.equal(r.incident, "open");
  assert.equal(r.count, 7);
  add("incident_closed");
  assert.equal(consoleRows(snap(log)).incident, "closed");
});

test("console rows: rollback is an alert; offline is not live", () => {
  const r = consoleRows(snap([], { status: { kind: "rollback", text: "ROLLBACK DETECTED AT #3", at: 3 } }));
  assert.equal(r.status.tone, "alert");
  assert.equal(r.status.text, "ROLLBACK DETECTED AT #3");
  assert.equal(r.incident, "none");
  assert.equal(consoleRows(snap([], { connection: "offline", ready: false })).live, false);
  assert.equal(consoleRows(snap([], { connection: "connecting", ready: false })).live, false);
});

test("the incident's AV- reference is the console's (lib/evidence.ts)", () => {
  const issue = { key: "T5|level_pct", asset_id: "T5", metric: "level_pct", facility_id: "f5", state: "lying" as const, evidence: "Level up with no inflow", simulated: true };
  const view = { now: 1000, alerts: [], sensors: [issue], events: [], totals: { do_nothing: 0, plans: 0 } } as unknown as ConsoleView;
  const want = evidenceForIssue(issue, "ds1", 1000)!;
  const got = incidentEvidence(view, "ds1", "f5")!;
  assert.equal(got.ref, want.ref);
  assert.equal(got.ref, refOf(want.hash));
  assert.equal(incidentEvidence(view, "ds1", null)!.ref, want.ref);
  assert.equal(incidentEvidence(view, "ds1", "nope"), null);
  assert.equal(incidentEvidence(null, "ds1", "f5"), null);
  assert.equal(incidentEvidence(view, "ds1", null, want.ref)!.ref, want.ref);
});
