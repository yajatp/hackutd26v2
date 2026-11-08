import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detect } from "./detect.ts";
import { answerKey, FOLDERS, hasData, loadFolder } from "./testdata.ts";
import type { DetectedEvent } from "./types.ts";

const EXACT = ["category", "system_id", "facility_id", "asset_id", "onset_unix", "end_unix", "status",
  "evidence", "onset_bounds", "end_bounds", "detected_unix"] as const;
const CLOSE = ["level_onset_pct", "hours_to_limit_at_onset", "trips_at_unix_pred", "level_pct", "hours_to_limit"] as const;

function fixture(folder: string): Record<string, unknown>[] {
  return JSON.parse(readFileSync(join(import.meta.dirname, "__fixtures__", `detect_${folder}.json`), "utf8"));
}

for (const folder of FOLDERS) {
  test(`${folder}: same events as prototypes/detect.py`, { skip: !hasData(folder) }, () => {
    const t0 = performance.now();
    const ours = detect(loadFolder(folder)) as unknown as Record<string, unknown>[];
    const ms = Math.round(performance.now() - t0);
    const ref = fixture(folder);
    console.log(`${folder}: ${ours.length} events in ${ms} ms (python ${ref.length})`);
    assert.equal(ours.length, ref.length, "event count");
    ref.forEach((r, i) => {
      const o = ours[i];
      const at = `#${i} ${r.category} ${r.asset_id}`;
      for (const k of EXACT) assert.deepEqual(o[k] ?? null, r[k] ?? null, `${at}: ${k}`);
      for (const k of CLOSE) {
        const a = o[k] ?? null, b = r[k] ?? null;
        if (a === null || b === null) assert.equal(a, b, `${at}: ${k}`);
        else assert.ok(Math.abs((a as number) - (b as number)) <= 1e-6, `${at}: ${k} ${a} vs ${b}`);
      }
      // fields present in one and not the other (beyond null vs missing) are a port bug
      for (const k of Object.keys(r)) if (r[k] !== null) assert.ok(k in o, `${at}: missing ${k}`);
    });
  });
}

test("full_week: 23 of 23 answer-key events, 0 false positives", { skip: !hasData("full_week") }, () => {
  const ours: DetectedEvent[] = detect(loadFolder("full_week"));
  const key = answerKey("full_week") as { asset: string; category: string }[];
  assert.equal(key.length, 23);
  const left = [...ours];
  for (const k of key) {
    const i = left.findIndex((e) => e.asset_id === k.asset && e.category === k.category);
    assert.ok(i >= 0, `missed ${k.category} on ${k.asset}`);
    left.splice(i, 1);
  }
  assert.deepEqual(left.map((e) => `${e.category} ${e.asset_id}`), [], "false positives");
});
