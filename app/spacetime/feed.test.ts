// Run: npx tsx --test app/spacetime/*.test.ts
// The /spacetime feed without a server: one line per row change, rebuilds coalesced, newest
// first and capped, and the reducer match against what spacetimedb/src/index.ts writes.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FEED_MAX, countWords, emptyStats, fieldsOf, linesOf, matchReducers, matchWords, nextStats, observe, pushFeed,
  touchedTables, type RowChange, type TableName, type Txn,
} from "./feed.ts";

const ch = (table: TableName, op: RowChange["op"], row: Record<string, unknown> = {}): RowChange => ({ table, op, row });
const txn = (id: string, changes: RowChange[], atMs = 1000): Txn => ({ id, atMs, changes });
const meta = ch("console_meta", "update", { alertCount: 3, plans: 12345.6 });
const alerts = (n: number, op: RowChange["op"] = "update") =>
  Array.from({ length: n }, (_, i) => ch("alert", op, { rank: i + 1, kind: "pump_failure", assetId: `T${i}` }));

test("fields: the 1 to 3 a person cares about", () => {
  assert.deepEqual(fieldsOf("fault", { assetId: "SYS1_TANK_A", kind: "fake_flat" }), ["SYS1_TANK_A", "fake flat"]);
  assert.deepEqual(fieldsOf("confirmation", { headline: "Divert to Facility B", cost: 4200.4 }), ["Divert to Facility B", "$4,200"]);
  assert.deepEqual(fieldsOf("alert", { rank: 2, kind: "pump_failure", assetId: "P1" }), ["#2", "pump failure", "P1"]);
  assert.deepEqual(fieldsOf("console_meta", { alertCount: 3, plans: 12345.6 }), ["3 alerts", "plans $12,346"]);
  assert.deepEqual(fieldsOf("config", { datasetId: "mock", nowTs: 0 }), ["mock", "no readings yet"]);
  assert.deepEqual(fieldsOf("config", { datasetId: "mock", nowTs: 1760110200 }), ["mock", "now 2025-10-10 15:30 UTC"]);
  assert.deepEqual(fieldsOf("sensor_issue", { rank: 1, issueJson: JSON.stringify({ asset_id: "T1", state: "lying", simulated: true }) }), ["T1", "lying", "SIMULATED"]);
  assert.deepEqual(fieldsOf("sensor_issue", { rank: 4, issueJson: "not json" }), ["#4"]);
  for (const f of [fieldsOf("alert", {}), fieldsOf("facility", {}), fieldsOf("confirmation", { cost: NaN })]) {
    assert.ok(f.length <= 3 && f.every((s) => s.length > 0), JSON.stringify(f));
  }
});

test("one line per row change, tables in a fixed order", () => {
  const lines = linesOf(txn("e1", [meta, ch("fault", "insert", { assetId: "T1", kind: "kill" })]));
  assert.deepEqual(lines.map((l) => [l.table, l.op]), [["console_meta", "update"], ["fault", "insert"]]);
  assert.ok(lines.every((l) => l.txId === "e1" && l.atMs === 1000));
  assert.equal(new Set(lines.map((l) => l.key)).size, lines.length);
});

test("a rebuild of many rows is one line", () => {
  const lines = linesOf(txn("e2", [...alerts(14), meta]));
  const a = lines.filter((l) => l.table === "alert");
  assert.equal(a.length, 1);
  assert.equal(a[0].op, "many");
  assert.deepEqual(a[0].fields, ["14 rows replaced"]);
  assert.equal(countWords([...alerts(12), ...alerts(2, "insert")]), "12 rows replaced, 2 added");
  assert.equal(countWords(alerts(1, "delete")), "1 row removed");
  assert.equal(linesOf(txn("e3", alerts(3))).length, 3, "three changes stay three lines");
});

test("feed: newest first, capped", () => {
  let feed = pushFeed([], txn("a", [meta], 1));
  feed = pushFeed(feed, txn("b", [ch("fault", "delete", { assetId: "T1", kind: "kill" })], 2));
  assert.deepEqual(feed.map((l) => l.txId), ["b", "a"]);
  for (let i = 0; i < 150; i++) feed = pushFeed(feed, txn(`x${i}`, [meta, ch("fault", "insert")], i));
  assert.equal(feed.length, FEED_MAX);
  assert.equal(feed[0].txId, "x149");
});

test("match: Fake, Clear and Confirm each have one reducer", () => {
  const fake = [ch("fault", "insert"), ...alerts(14), meta, ch("sensor_issue", "insert")];
  assert.deepEqual(matchReducers(fake), ["inject_fault"]);
  assert.deepEqual(matchReducers([ch("fault", "update"), meta]), ["inject_fault"], "a second fault on the same tank");
  assert.deepEqual(matchReducers([ch("fault", "delete"), ...alerts(14), meta, ch("sensor_issue", "delete")]), ["clear_fault"]);
  assert.deepEqual(matchReducers([ch("confirmation", "insert")]), ["confirm_plan"]);
  assert.deepEqual(matchReducers([ch("confirmation", "update")]), ["confirm_plan"], "confirmed again");
});

test("match: loads, and the cases the rows cannot tell apart", () => {
  assert.deepEqual(matchReducers([ch("config", "insert"), ch("facility", "insert")]), ["load_dataset"]);
  assert.deepEqual(matchReducers([ch("config", "update"), ch("fault", "delete"), ch("confirmation", "delete")]), ["load_dataset"]);
  assert.deepEqual(matchReducers([ch("config", "update")]), ["load_dataset", "ingest_batch"]);
  // finish_ingest, and Clear all with nothing to clear, both rewrite only the board.
  assert.deepEqual(matchReducers([...alerts(5), meta]), ["finish_ingest", "clear_fault"]);
  assert.deepEqual(matchReducers([ch("alert", "update")]), [], "the board without console_meta: nothing writes that");
  assert.deepEqual(matchReducers([]), []);
});

test("match words", () => {
  assert.equal(matchWords(["confirm_plan"]), "Only confirm_plan writes these tables this way.");
  assert.equal(matchWords(["finish_ingest", "clear_fault"]), "finish_ingest or clear_fault: the row changes alone cannot tell them apart.");
  assert.match(matchWords([]), /No reducer/);
});

test("observed matrix counts only unique matches", () => {
  let seen = observe({}, txn("1", [ch("confirmation", "insert")]));
  seen = observe(seen, txn("2", [ch("confirmation", "update")]));
  seen = observe(seen, txn("3", [...alerts(2), meta]));          // ambiguous: not counted
  seen = observe(seen, txn("4", [ch("fault", "insert"), meta]));
  assert.deepEqual(seen, { confirm_plan: { confirmation: 2 }, inject_fault: { fault: 1, console_meta: 1 } });
  assert.deepEqual(touchedTables([meta, ch("config", "update"), meta]), ["config", "console_meta"]);
});

test("stats: counts from the cache, last change only where touched", () => {
  const rows = { config: 1, facility: 8, alert: 14, console_meta: 1, sensor_issue: 2, fault: 0, confirmation: 0 };
  let s = nextStats(emptyStats(), rows);
  assert.equal(s.alert.rows, 14);
  assert.equal(s.alert.lastChangeMs, null);
  s = nextStats(s, { ...rows, fault: 1 }, txn("f", [ch("fault", "insert"), meta], 5000));
  assert.equal(s.fault.rows, 1);
  assert.equal(s.fault.lastChangeMs, 5000);
  assert.equal(s.console_meta.lastChangeMs, 5000);
  assert.equal(s.alert.lastChangeMs, null);
  s = nextStats(s, rows, txn("c", [ch("confirmation", "insert")], 9000));
  assert.equal(s.fault.lastChangeMs, 5000, "kept from before");
});
