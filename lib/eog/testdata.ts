// Test-only helper: reads an EOG history folder from disk. Data lives outside the repo in
// EOG_DIR (default ../eog-data, a copy of github.com/nihaal419/HackUTD-ZeroDay).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadDataset, type Dataset } from "./load.ts";

export const EOG_DIR = process.env.EOG_DIR ?? join(process.cwd(), "..", "eog-data");
export const HISTORY = join(EOG_DIR, "history");

export const FOLDERS = [
  "full_week",
  "snapshot_2026-10-08T1200",
  "snapshot_2026-10-09T0330",
  "snapshot_2026-10-10T0900",
  "mock_test_2026-10-10T1530",
] as const;

export function hasData(folder: string): boolean {
  const ok = existsSync(join(HISTORY, folder, "telemetry.csv"));
  if (!ok) console.log(`SKIP ${folder}: no data at ${join(HISTORY, folder)} (set EOG_DIR)`);
  return ok;
}

const cache = new Map<string, Dataset>();
export function loadFolder(folder: string): Dataset {
  let ds = cache.get(folder);
  if (!ds) {
    const dir = join(HISTORY, folder);
    const read = (f: string) => readFileSync(join(dir, f), "utf8");
    ds = loadDataset({ network: read("network.json"), ops: read("ops.json"), telemetry: read("telemetry.csv") });
    cache.set(folder, ds);
  }
  return ds;
}

export function answerKey(folder: string): Record<string, unknown>[] | null {
  const p = join(HISTORY, folder, "answer_key.json");
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}
