// scripts/ingest.mjs loads mock_test through load_dataset -> ingest_batch -> finish_ingest and
// the stored rows match the files. Needs the local server (npm run st:start) with avon published.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { basename, join } from "node:path";
import { HISTORY, hasData, loadFolder } from "../../lib/eog/testdata.ts";
import { count, ROOT, sql } from "./local.ts";

const FOLDER = "mock_test_2026-10-10T1530";

test("ingest.mjs loads mock_test and prints timings; facility, reading and config match the files", { skip: !hasData(FOLDER) }, () => {
  const dir = join(HISTORY, FOLDER);
  const run = spawnSync(process.execPath, [join(ROOT, "scripts", "ingest.mjs"), dir], { encoding: "utf8", cwd: ROOT });
  console.log(run.stdout + run.stderr);
  assert.equal(run.status, 0, run.stderr);
  for (const step of ["parse", "load_dataset", "ingest_batch", "finish_ingest", "total"]) {
    assert.match(run.stdout, new RegExp(`^${step}\\s+\\d+ ms`, "m"), `prints ${step} time`);
  }

  const ds = loadFolder(FOLDER);
  let facilities = 0;
  for (const s of ds.network.systems) facilities += s.facilities.length;
  assert.equal(facilities, 15);
  assert.equal(count("facility"), facilities);
  assert.equal(count("reading"), facilities * ds.ts.length);
  assert.equal(count("reading"), 24405);

  const cfg = sql("SELECT * FROM config");
  assert.equal(cfg.length, 1);
  assert.equal(cfg[0].dataset_id, `"${basename(dir)}"`);
  assert.equal(Number(cfg[0].now_ts), ds.now);
  assert.equal(ds.now, 1791646200);
});
