import { test } from "node:test";
import assert from "node:assert/strict";
import { buildConsole } from "./eog/alerts.ts";
import { hasData, loadFolder } from "./eog/testdata.ts";
import { injectFault } from "./rules/faults.ts";
import { evidenceFor, hashRecord, refMatches, refOf } from "./evidence.ts";

const MOCK = "mock_test_2026-10-10T1530";

test("a clean tank sensor gives no evidence; a faked one gives a record, fingerprint and AV- reference", { skip: !hasData(MOCK) }, () => {
  const ds = loadFolder(MOCK);
  const clean = buildConsole(ds).alerts.filter((a) => a.fix);
  for (const a of clean) assert.equal(evidenceFor(a, MOCK, ds.now), null);
  const top = clean[0].facility;
  const { ds: faked } = injectFault(ds, { kind: "fake_flat", asset_id: top.tank.id, from_ts: ds.now - 3600 });
  const a = buildConsole(faked).alerts.find((x) => x.facility.id === top.id && x.fix)!;
  const ev = evidenceFor(a, MOCK, faked.now)!;
  assert.equal(ev.record.kind, "sensor_disagrees_with_physics");
  assert.equal(ev.record.simulated, true);
  assert.match(ev.hash, /^[0-9a-f]{64}$/);
  assert.match(ev.ref, /^AV-[0-9A-F]{4}-[0-9A-F]{4}$/);
  // anyone rebuilding the same record from the same folder gets the same fingerprint
  assert.equal(evidenceFor(a, MOCK, faked.now)!.hash, ev.hash);
  assert.equal(hashRecord({ ...ev.record }), ev.hash);
  // one changed character changes the fingerprint
  assert.notEqual(hashRecord({ ...ev.record, evidence: ev.record.evidence + " " }), ev.hash);
});

test("a typed reference matches regardless of case and spaces, and only its own fingerprint", () => {
  const h = "1a2b3c4d" + "0".repeat(56);
  assert.equal(refOf(h), "AV-1A2B-3C4D");
  assert.ok(refMatches(" av-1a2b-3c4d ", h));
  assert.ok(!refMatches("AV-1A2B-3C4E", h));
});
