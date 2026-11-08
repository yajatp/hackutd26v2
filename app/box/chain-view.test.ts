// Run: npx tsx --test app/box/chain-view.test.ts
// The drawn chain's placement rules against real hash-chained logs and the real status function.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appendEvent, witnessOf, type LogEvent, type NewEvent } from "@/lib/chain";
import { chainStatus } from "@/lib/rules/darkroom/status";
import { crackOf, dropDelays, gapBefore, keysOf, linkState, newSince, nextFresh, numberRuns, sealedAt, windowOf, GHOSTS } from "./chain-view";

const actor = "Dana|Commander|c2";
function log(types: Array<[string, string]>): LogEvent[] {
  const out: LogEvent[] = [];
  types.forEach(([type, incident_id], i) => {
    const e: NewEvent = { incident_id, ts: `2026-11-08T04:00:0${i % 10}Z`, actor, type, payload: { n: i } };
    out.push(appendEvent(out, e));
  });
  return out;
}

const base = log([["member_added", ""], ["member_added", ""], ["incident_opened", "INC-0001"], ["evidence_imported", "INC-0001"]]);
const grown = log([["member_added", ""], ["member_added", ""], ["incident_opened", "INC-0001"], ["evidence_imported", "INC-0001"], ["chat", "INC-0001"], ["incident_closed", "INC-0001"]]);

test("newSince: the first render and an unchanged log are not news", () => {
  assert.deepEqual(newSince(null, keysOf(base)), []);
  assert.deepEqual(newSince(keysOf(base), keysOf(base)), []);
});

test("newSince: entries past the newest seq seen are new, in order", () => {
  assert.deepEqual(newSince(keysOf(base), keysOf(grown)), [4, 5]);
  assert.deepEqual(newSince([], keysOf(base.slice(0, 1))), [0]);
});

test("newSince: a rollback or a rewrite in place adds nothing; a new genesis is not news", () => {
  assert.deepEqual(newSince(keysOf(grown), keysOf(base)), []);
  const rewritten = keysOf(grown).map(k => (k.seq === 3 ? { ...k, hash: "f".repeat(64) } : k));
  assert.deepEqual(newSince(keysOf(grown), rewritten), []);
  const other = log([["member_added", "x"], ["member_added", "x"], ["chat", "x"], ["chat", "x"], ["chat", "x"], ["chat", "x"], ["chat", "x"]]);
  assert.deepEqual(newSince(keysOf(grown), keysOf(other)), []);
});

test("nextFresh: keeps earlier marks still on the box, adds new ones, clears on a new genesis", () => {
  const a = nextFresh(keysOf(base), keysOf(grown), new Set([3]));
  assert.deepEqual([...a].sort(), [3, 4, 5]);
  const b = nextFresh(keysOf(grown), keysOf(base), a);
  assert.deepEqual([...b].sort(), [3]);
  const other = log([["member_added", "x"]]);
  assert.deepEqual([...nextFresh(keysOf(grown), keysOf(other), a)], []);
  assert.deepEqual([...nextFresh(null, keysOf(grown), new Set())], []);
});

test("crackOf: a verified log has no crack", () => {
  assert.equal(crackOf(chainStatus(grown, witnessOf(grown)), grown, witnessOf(grown)), null);
});

test("crackOf: ROLLBACK DETECTED AT #k breaks past the last link, with ghosts for what this device saw", () => {
  const w = witnessOf(grown); // saw up to #5
  const st = chainStatus(base, w); // the box now ends at #3
  assert.equal(st.text, "ROLLBACK DETECTED AT #4");
  const c = crackOf(st, base, w);
  assert.deepEqual(c, { kind: "rollback", at: 4, link: null, ghosts: [4, 5] });
  for (const e of base) assert.equal(linkState(e.seq, c), "ok");
});

test("crackOf: a long rollback keeps at most GHOSTS ghosts, the last one the seq this device remembers", () => {
  const c = crackOf({ kind: "rollback", text: "ROLLBACK DETECTED AT #2", at: 2 }, base.slice(0, 2), { genesis: "g", seq: 9, head: "h" });
  assert.equal(c?.ghosts.length, GHOSTS);
  assert.deepEqual(c?.ghosts, [2, 3, 9]);
  assert.equal(gapBefore(c!.ghosts, 1), false);
  assert.equal(gapBefore(c!.ghosts, 2), true);
});

test("crackOf: TAMPERING AT #k runs through link k; later links fall out of line", () => {
  const forged = grown.map(e => (e.seq === 3 ? { ...e, payload: { n: 99 } } : e));
  const st = chainStatus(forged, null);
  assert.equal(st.text, "TAMPERING AT #3");
  const c = crackOf(st, forged, null);
  assert.deepEqual(c, { kind: "tampering", at: 3, link: 3, ghosts: [] });
  assert.deepEqual(forged.map(e => linkState(e.seq, c)), ["ok", "ok", "ok", "cracked", "below", "below"]);
});

test("crackOf: tampering past the newest link (the member list) has no link and no ghosts", () => {
  const c = crackOf({ kind: "tampering", text: "MEMBER LIST CHANGED OUTSIDE THE LOG (c2000453)", at: grown.length }, grown, null);
  assert.deepEqual(c, { kind: "tampering", at: 6, link: null, ghosts: [] });
  assert.ok(grown.every(e => linkState(e.seq, c) === "ok"));
});

test("windowOf: the newest max entries, oldest first, widened back to an older cracked link", () => {
  assert.deepEqual(windowOf(grown, 3, null).map(e => e.seq), [3, 4, 5]);
  assert.deepEqual(windowOf(grown, 10, null).map(e => e.seq), [0, 1, 2, 3, 4, 5]);
  const c = { kind: "tampering" as const, at: 1, link: 1, ghosts: [] };
  assert.deepEqual(windowOf(grown, 3, c).map(e => e.seq), [1, 2, 3, 4, 5]);
});

test("sealedAt: only when the newest entry closed the last open incident and the log verifies", () => {
  assert.equal(sealedAt(grown, chainStatus(grown, null)), 5);
  assert.equal(sealedAt(base, chainStatus(base, null)), null);
  const reopened = log([["incident_opened", "INC-0001"], ["incident_opened", "INC-0002"], ["incident_closed", "INC-0001"]]);
  assert.equal(sealedAt(reopened, chainStatus(reopened, null)), null);
  assert.equal(sealedAt(grown, { kind: "tampering", text: "TAMPERING AT #2", at: 2 }), null);
});

test("numberRuns: numbers split out for a legible face; hex ids stay whole; the text is unchanged", () => {
  const join = (t: string) => numberRuns(t).map(r => r.text).join("");
  for (const t of ["ROLLBACK DETECTED AT #5", "TAMPERING AT #12", "INC-0005 OPEN", "MEMBER LIST CHANGED OUTSIDE THE LOG (c2000453)", "LOG VERIFIED", ""]) {
    assert.equal(join(t), t);
  }
  assert.deepEqual(numberRuns("ROLLBACK DETECTED AT #5"), [{ text: "ROLLBACK DETECTED AT ", num: false }, { text: "#5", num: true }]);
  assert.deepEqual(numberRuns("INC-0005 OPEN").filter(r => r.num).map(r => r.text), ["0005"]);
  assert.deepEqual(numberRuns("MEMBER LIST CHANGED OUTSIDE THE LOG (c2000453)").filter(r => r.num), []);
});

test("dropDelays: only the newest batch is staggered, from 0 ms, so later arrivals never wait longer", () => {
  const shown = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  // One entry per batch, late in a session: each drops at once, however many arrived before it.
  for (const q of [5, 6, 7, 8]) assert.deepEqual([...dropDelays([q], shown)], [[q, 0]]);
  // A batch of three: 90 ms apart, oldest first; links from earlier batches are not delayed.
  const d = dropDelays([6, 7, 8], shown);
  assert.deepEqual([...d], [[6, 0], [7, 90], [8, 180]]);
  assert.equal(d.get(5), undefined);
});

test("dropDelays: a big batch starts within 270 ms; links outside the drawn window are skipped", () => {
  const d = dropDelays([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(d.get(0), 0);
  assert.equal(d.get(9), 270);
  assert.ok([...d.values()].every(ms => ms <= 270));
  assert.deepEqual([...dropDelays([2, 3, 4, 5, 6], [4, 5, 6])], [[4, 0], [5, 90], [6, 180]]);
  assert.deepEqual([...dropDelays([], [1, 2])], []);
});
