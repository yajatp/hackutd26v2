import { test } from "node:test";
import assert from "node:assert/strict";
import { appendEvent, type LogEvent } from "../../chain.ts";
import { evidenceTitle, openIncidentsOf, planEvidence } from "./bring.ts";

const DANA = "Dana|Commander|aa11";

function log(...entries: { incident_id: string; type: string; payload: { [k: string]: string } }[]): LogEvent[] {
  const out: LogEvent[] = [];
  for (const e of entries) out.push(appendEvent(out, { ...e, ts: "2026-11-08T07:00:00.000Z", actor: DANA }));
  return out;
}

const REF = "AV-1A2B-3C4D";

test("the title names the reference", () => {
  assert.equal(evidenceTitle(REF), "Sensor disagrees with physics (AV-1A2B-3C4D)");
});

test("open incidents: opened and not closed, newest last", () => {
  const l = log(
    { incident_id: "INC-0001", type: "incident_opened", payload: { title: "one" } },
    { incident_id: "INC-0002", type: "incident_opened", payload: { title: "two" } },
    { incident_id: "INC-0001", type: "incident_closed", payload: { resolution: "done" } },
  );
  assert.deepEqual(openIncidentsOf(l).map(i => i.id), ["INC-0002"]);
});

test("no incident open: a Commander opens one titled with the reference, then logs it", () => {
  const p = planEvidence("Commander", [], null, { ref: "av-1a2b-3c4d", fingerprint: "" });
  assert.deepEqual(p, { kind: "open_then_log", title: evidenceTitle(REF), payload: { ref: REF, fingerprint: "", source: "Avon console", note: "" } });
});

test("no incident open: a Responder gets a clear message and nothing is written", () => {
  const p = planEvidence("Responder", [], null, { ref: REF, fingerprint: "" });
  assert.equal(p.kind, "refuse");
  assert.match(p.kind === "refuse" ? p.reason : "", /No incident is open.*Commander/);
});

test("an incident is open: the evidence goes to the one on screen, or else the newest open one", () => {
  const l = log(
    { incident_id: "INC-0001", type: "incident_opened", payload: { title: "one" } },
    { incident_id: "INC-0002", type: "incident_opened", payload: { title: "two" } },
  );
  const open = openIncidentsOf(l);
  assert.deepEqual(planEvidence("Responder", open, "INC-0001", { ref: REF, fingerprint: "" }), { kind: "log", incidentId: "INC-0001", payload: { ref: REF, fingerprint: "", source: "Avon console", note: "" } });
  assert.equal((planEvidence("Commander", open, "INC-0009", { ref: REF, fingerprint: "" }) as { incidentId: string }).incidentId, "INC-0002");
});

test("a bad reference or a fingerprint that does not match is refused before anything is written", () => {
  const bad = planEvidence("Commander", [], null, { ref: "AV-12", fingerprint: "" });
  assert.equal(bad.kind, "refuse");
  assert.match(bad.kind === "refuse" ? bad.reason : "", /AV-1A2B-3C4D/);
  const fp = planEvidence("Commander", [], null, { ref: REF, fingerprint: "f".repeat(64) });
  assert.equal(fp.kind, "refuse");
  assert.match(fp.kind === "refuse" ? fp.reason : "", /does not match/);
});

test("a Viewer cannot log evidence", () => {
  const p = planEvidence("Viewer", [], null, { ref: REF, fingerprint: "" });
  assert.equal(p.kind, "refuse");
  assert.match(p.kind === "refuse" ? p.reason : "", /Viewer cannot log evidence/);
});
