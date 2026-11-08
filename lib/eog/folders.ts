// Server-only: finds EOG dataset folders on this box and reads their three files.
// Never serves answer_key.json (EOG's rule: the app must not load it).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

export const DATA_ROOT = resolve(process.env.EOG_DIR ?? join(process.cwd(), "..", "eog-data"));
export const FILES = ["network.json", "ops.json", "telemetry.csv"] as const;
export type DataFile = (typeof FILES)[number];

// Every folder up to two levels under DATA_ROOT that holds all three files.
export function listFolders(): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (FILES.every((f) => existsSync(join(dir, f)))) out.push(relative(DATA_ROOT, dir));
    if (depth === 0) return;
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory() && !d.name.startsWith(".")) walk(join(dir, d.name), depth - 1);
    }
  };
  if (existsSync(DATA_ROOT)) walk(DATA_ROOT, 2);
  return out.sort();
}

export function readDataFile(folder: string, name: string): string | null {
  if (!(FILES as readonly string[]).includes(name)) return null;
  const dir = resolve(DATA_ROOT, folder);
  if (dir !== DATA_ROOT && !dir.startsWith(DATA_ROOT + sep)) return null;
  const p = join(dir, name);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}
