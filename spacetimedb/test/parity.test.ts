// The engine runs inside finish_ingest. Its alert + console_meta rows must equal
// buildConsole(loadDataset(files)) run directly in Node on the same folder.
// Needs the local server (npm run st:start) with avon published, and lib/eog/detect.ts + planner.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDataset, type DatasetFiles } from "../../lib/eog/load.ts";
import { HISTORY, hasData } from "../../lib/eog/testdata.ts";
import { tables, type DbConnection } from "../../lib/module_bindings/index.ts";
import { openAvon, sendDataset, viewFromRows } from "../../lib/live.ts";
import { DB, ROOT, sql, URI } from "./local.ts";

const FOLDER = "mock_test_2026-10-10T1530";
const ENGINE = ["detect.ts", "planner.ts"].every((f) => existsSync(join(ROOT, "lib", "eog", f)));
const json = (x: unknown) => JSON.parse(JSON.stringify(x));

function readFiles(folder: string): DatasetFiles {
  const r = (f: string) => readFileSync(join(HISTORY, folder, f), "utf8");
  return { network: r("network.json"), ops: r("ops.json"), telemetry: r("telemetry.csv") };
}

function subscribed(conn: DbConnection): Promise<void> {
  return new Promise((resolve, reject) => {
    conn.subscriptionBuilder()
      .onApplied(() => resolve())
      .onError(() => reject(new Error("subscription failed")))
      .subscribe([tables.alert, tables.consoleMeta]);
  });
}

test(`${FOLDER}: finish_ingest writes exactly what buildConsole() gives in Node`, {
  skip: !ENGINE ? "engine not wired: lib/eog/detect.ts or planner.ts missing" : !hasData(FOLDER),
}, async () => {
  // Dynamic import: this file must still load while the engine files are missing.
  const { buildConsole } = await import("../../lib/eog/alerts.ts");
  const files = readFiles(FOLDER);
  const node = buildConsole(loadDataset(files));

  const conn = await openAvon(URI, DB);
  try {
    const t = await sendDataset(conn, files, FOLDER);
    console.log(`finish_ingest ${t.finishMs.toFixed(0)} ms (parse ${t.parseMs.toFixed(0)}, load ${t.loadMs.toFixed(0)}, ingest ${t.ingestMs.toFixed(0)})`);
    assert.ok(t.finishMs < 5000, `finish_ingest took ${t.finishMs} ms`);

    await subscribed(conn);
    const rows = [...conn.db.alert.iter()].sort((a, b) => a.rank - b.rank);
    const meta = [...conn.db.consoleMeta.iter()][0];
    assert.ok(meta, "console_meta row");
    assert.equal(rows.length, node.alerts.length, "alert count");
    assert.equal(meta.alertCount, node.alerts.length);
    rows.forEach((r, i) => {
      const a = node.alerts[i];
      assert.equal(r.rank, i + 1);
      assert.equal(r.alertId, a.id);
      assert.equal(r.kind, a.event.category);
      assert.equal(r.systemId, a.event.system_id);
      assert.equal(r.facilityId, a.facility.id);
      assert.equal(r.assetId, a.event.asset_id);
      assert.equal(r.hoursToLimit ?? null, a.hours_to_limit);
      assert.deepEqual(JSON.parse(r.alertJson), json(a), `alert ${i + 1} (${a.id})`);
    });
    assert.equal(meta.now, node.now);
    assert.equal(meta.datasetId, FOLDER);
    assert.deepEqual({ do_nothing: meta.doNothing, plans: meta.plans }, node.totals);
    assert.deepEqual(JSON.parse(meta.eventsJson), json(node.events));
    assert.deepEqual(viewFromRows(rows, meta), json(node), "lib/live.ts rebuilds the same ConsoleView");

    assert.equal(rows[0].assetId, "S5_PUMP_C");
    assert.equal(rows[1].assetId, "S5_PUMP_B");
  } finally {
    conn.disconnect();
  }

  const top = sql("SELECT rank, facility_id, asset_id, kind FROM alert WHERE rank <= 2");
  console.log(top);
  const byRank = Object.fromEntries(top.map((r) => [r.rank, r.asset_id]));
  assert.deepEqual(byRank, { 1: '"S5_PUMP_C"', 2: '"S5_PUMP_B"' });
});
