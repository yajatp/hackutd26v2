// What the drawn hash chain on /box and /witness shows, without React or a browser:
// which links arrived since the last render (they drop in), where a crack goes when the status
// says ROLLBACK or TAMPERING, which links fall out of line below it, which slice of the log is
// drawn, and when the chain is sealed (the newest entry closed the last open incident).
// The status itself always comes from lib/rules/darkroom/status.ts; this file only places it.
// Run: npx tsx --test app/box/chain-view.test.ts

import type { LogEvent, Witness } from "@/lib/chain";
import type { ChainStatus } from "@/lib/rules/darkroom/status";

export interface LinkKey {
  seq: number;
  hash: string;
}

export const keysOf = (events: readonly LogEvent[]): LinkKey[] => events.map(e => ({ seq: e.seq, hash: e.hash }));

// The links in `next` that were not there at the last render: seqs past the newest seq seen.
// The first render (prev null) and a different log (a new genesis after a box reset) are not
// news, so nothing drops in. An entry rewritten in place keeps its seq, so it is not new either.
export function newSince(prev: readonly LinkKey[] | null, next: readonly LinkKey[]): number[] {
  if (prev === null) return [];
  if (prev.length > 0 && next.length > 0 && prev[0].hash !== next[0].hash) return [];
  const newest = prev.reduce((m, k) => Math.max(m, k.seq), -1);
  return next.filter(k => k.seq > newest).map(k => k.seq);
}

// The seqs to keep marking as arrived-live after this render: the old marks still on the box
// plus the new ones. A new genesis clears them.
export function nextFresh(prev: readonly LinkKey[] | null, next: readonly LinkKey[], fresh: ReadonlySet<number>): Set<number> {
  const sameLog = prev !== null && (prev.length === 0 || next.length === 0 || prev[0].hash === next[0].hash);
  const seqs = new Set(next.map(k => k.seq));
  const out = new Set<number>(sameLog ? [...fresh].filter(s => seqs.has(s)) : []);
  for (const s of newSince(prev, next)) out.add(s);
  return out;
}

// The drop-in delay for each link in the batch that just arrived, by seq: the batch's drawn links
// fall one after another, oldest first, `step` ms apart, and the whole batch starts within `span`
// ms (a big batch steps closer together). Links from earlier batches, and links not drawn, are not
// in the map and drop at 0 ms, so a late entry in a long demo never waits behind the earlier ones.
export function dropDelays(batch: readonly number[], shown: readonly number[], step = 90, span = 270): Map<number, number> {
  const inBatch = new Set(batch);
  const drawn = shown.filter(s => inBatch.has(s));
  const gap = drawn.length > 1 ? Math.min(step, span / (drawn.length - 1)) : 0;
  return new Map(drawn.map((s, i) => [s, Math.round(i * gap)]));
}

// Where the chain breaks. `link` is the seq of a drawn link the fracture runs through, or null
// when the break is past the newest link the box still has. `ghosts` are the seqs this device saw
// that the box no longer has (rollback): drawn as empty dashed links, at most GHOSTS of them.
export type Crack = { kind: "rollback" | "tampering"; at: number; link: number | null; ghosts: number[] } | null;

export const GHOSTS = 3;

export function crackOf(status: ChainStatus, events: readonly LogEvent[], witness: Witness | null): Crack {
  if (status.kind !== "rollback" && status.kind !== "tampering") return null;
  const at = status.at;
  const link = events.some(e => e.seq === at) ? at : null;
  let ghosts: number[] = [];
  if (status.kind === "rollback" && link === null) {
    const last = Math.max(at, witness?.seq ?? at);
    const all = Array.from({ length: last - at + 1 }, (_, i) => at + i);
    ghosts = all.length <= GHOSTS ? all : [...all.slice(0, GHOSTS - 1), last];
  }
  return { kind: status.kind, at, link, ghosts };
}

export type LinkState = "ok" | "cracked" | "below";

// A drawn link's place relative to the crack: the cracked link, a link after it (drops 6 px out
// of line and dims), or in line.
export function linkState(seq: number, crack: Crack): LinkState {
  if (!crack) return "ok";
  if (crack.link === seq) return "cracked";
  return crack.link !== null && seq > crack.link ? "below" : "ok";
}

// The slice of the log to draw, oldest first: the newest `max` entries, widened back to the
// cracked link if it is older, so the fracture is always on screen.
export function windowOf(events: readonly LogEvent[], max: number, crack: Crack): LogEvent[] {
  let start = Math.max(0, events.length - max);
  if (crack?.link != null) {
    const i = events.findIndex(e => e.seq === crack.link);
    if (i >= 0 && i < start) start = i;
  }
  return events.slice(start);
}

// The seq of the link that seals the chain, or null: the log verifies, its newest entry is an
// incident_closed, and no incident is left open.
export function sealedAt(events: readonly LogEvent[], status: ChainStatus): number | null {
  if (status.kind !== "verified" || events.length === 0) return null;
  const last = events[events.length - 1];
  if (last.type !== "incident_closed") return null;
  const open = new Set<string>();
  for (const e of events) {
    if (e.type === "incident_opened") open.add(e.incident_id);
    else if (e.type === "incident_closed") open.delete(e.incident_id);
  }
  return open.size === 0 ? last.seq : null;
}

// Ghost seqs that do not follow the one before (a gap) get a "⋮" spacer before them.
export function gapBefore(ghosts: readonly number[], i: number): boolean {
  return i > 0 && ghosts[i] !== ghosts[i - 1] + 1;
}

// Pixelify Sans draws "5" exactly like "S", so "ROLLBACK DETECTED AT #5" read as "AT #S". Numbers
// in pixel type are split out to be drawn in a face with a real 5; the text itself is unchanged.
// A number glued to letters (a hex id such as c2000453) stays whole in the surrounding face.
export function numberRuns(text: string): Array<{ text: string; num: boolean }> {
  const out: Array<{ text: string; num: boolean }> = [];
  let last = 0;
  for (const m of text.matchAll(/(?<![0-9A-Za-z])#?\d+(?![0-9A-Za-z])/g)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), num: false });
    out.push({ text: m[0], num: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), num: false });
  return out;
}
