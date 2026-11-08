// Test helpers for the local Avon server. Every CLI call names the local server explicitly.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const SERVER = "avonlocal";                       // spacetime server add --url http://127.0.0.1:3001 avonlocal
export const URI = "ws://127.0.0.1:3001";
export const DB = "avon";
export const ROOT = join(import.meta.dirname, "..", "..");
const local = join(homedir(), ".local", "bin", "spacetime");
export const SPACETIME = existsSync(local) ? local : "spacetime";

// Rows of `spacetime sql` output as objects of strings, keyed by column name.
export function sql(query: string, server = SERVER, db = DB): Record<string, string>[] {
  const out = execFileSync(SPACETIME, ["sql", "-s", server, db, query], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const lines = out.split("\n").filter((l) => l.trim() && !l.startsWith("WARNING"));
  const sep = lines.findIndex((l) => /^-+(\+-+)*$/.test(l.trim()));
  if (sep < 1) throw new Error(`unexpected sql output:\n${out}`);
  const head = lines[sep - 1].split("|").map((s) => s.trim());
  return lines.slice(sep + 1).map((l) => {
    const cells = l.split("|").map((s) => s.trim());
    return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? ""]));
  });
}

export function count(table: string, server = SERVER, db = DB): number {
  return Number(sql(`SELECT COUNT(*) AS n FROM ${table}`, server, db)[0].n);
}
