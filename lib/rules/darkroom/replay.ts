// Every Darkroom screen is a replay of the log. Nothing here reads a stored
// status: delete or edit an entry and the board changes with it.

import { canonical, type Json, type LogEvent } from "../../chain.ts";
import { parseActor } from "./roles.ts";
import type { Certainty, ScopeState } from "./entries.ts";

export { SCOPE_STATES, CERTAINTIES } from "./entries.ts";

export interface Incident {
  id: string;
  title: string;
  openedBy: string;
  openedAt: string;
  seq: number;
}

export interface ScopeRow {
  key: string;
  system: string;
  state: ScopeState;
  certainty: Certainty;
  note: string;
  by: string;
  ts: string;
  seq: number;
  updates: number;
}

export interface ChatLine {
  seq: number;
  ts: string;
  name: string;
  role: string;
  text: string;
}

function bySeq(log: readonly LogEvent[]): LogEvent[] {
  return [...log].sort((a, b) => a.seq - b.seq);
}

function field(payload: Json, key: string): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const v = payload[key];
    if (typeof v === "string") return v;
  }
  return "";
}

export function scopeKey(system: string): string {
  return system.trim().toLowerCase().replace(/\s+/g, " ");
}

export function replayIncidents(log: readonly LogEvent[]): Incident[] {
  return bySeq(log)
    .filter(e => e.type === "incident_opened")
    .map(e => ({ id: e.incident_id, title: field(e.payload, "title"), openedBy: parseActor(e.actor).name, openedAt: e.ts, seq: e.seq }));
}

export function replayScope(log: readonly LogEvent[], incidentId: string): ScopeRow[] {
  const rows = new Map<string, ScopeRow>();
  for (const e of bySeq(log)) {
    if (e.type !== "scope_update" || e.incident_id !== incidentId) continue;
    const system = field(e.payload, "system");
    const key = scopeKey(system);
    if (!key) continue;
    const prev = rows.get(key);
    rows.set(key, {
      key,
      system: prev ? prev.system : system.trim(),
      state: field(e.payload, "state") as ScopeState,
      certainty: field(e.payload, "certainty") as Certainty,
      note: field(e.payload, "note"),
      by: parseActor(e.actor).name,
      ts: e.ts,
      seq: e.seq,
      updates: (prev?.updates ?? 0) + 1,
    });
  }
  return [...rows.values()];
}

export function replayChat(log: readonly LogEvent[], incidentId: string): ChatLine[] {
  return bySeq(log)
    .filter(e => e.type === "chat" && e.incident_id === incidentId)
    .map(e => {
      const a = parseActor(e.actor);
      return { seq: e.seq, ts: e.ts, name: a.name, role: a.role, text: field(e.payload, "text") };
    });
}

export interface EvidenceItem {
  seq: number;
  ts: string;
  ref: string;
  fingerprint: string;   // "" when only the reference was typed
  source: string;
  note: string;
  collector: string;     // the member who logged it (from the server, not the client)
  role: string;
}

export function replayEvidence(log: readonly LogEvent[], incidentId: string): EvidenceItem[] {
  return bySeq(log)
    .filter(e => e.type === "evidence_imported" && e.incident_id === incidentId)
    .map(e => {
      const a = parseActor(e.actor);
      return {
        seq: e.seq, ts: e.ts, ref: field(e.payload, "ref"), fingerprint: field(e.payload, "fingerprint"),
        source: field(e.payload, "source"), note: field(e.payload, "note"), collector: a.name, role: a.role,
      };
    });
}

export interface Closure { seq: number; ts: string; by: string; resolution: string }

// The first close counts; the module refuses every write to a closed incident.
export function replayClosure(log: readonly LogEvent[], incidentId: string): Closure | null {
  const e = bySeq(log).find(x => x.type === "incident_closed" && x.incident_id === incidentId);
  return e ? { seq: e.seq, ts: e.ts, by: parseActor(e.actor).name, resolution: field(e.payload, "resolution") } : null;
}

// A row as the database or the generated bindings hand it over.
export interface LogRow {
  seq: bigint | number;
  prevHash: string;
  incidentId: string;
  ts: string;
  actor: string;
  type: string;
  payloadJson: string;
  hash: string;
}

export function rowToEvent(r: LogRow): LogEvent {
  let payload: Json;
  try {
    payload = JSON.parse(r.payloadJson) as Json;
    // The module stores exactly canonical(payload). Different bytes with the same parse (duplicate
    // keys, extra spaces, escapes, a big number that rounds) mean the row was edited outside the
    // module: keep the raw text so the hash check flags it (red team items 3-5).
    if (canonical(payload) !== r.payloadJson) payload = r.payloadJson;
  } catch {
    // Unparseable payload (or one canonical() refuses, like 1e309): keep the raw text so the
    // hash check flags it.
    payload = r.payloadJson;
  }
  return {
    seq: Number(r.seq),
    prev_hash: r.prevHash,
    incident_id: r.incidentId,
    ts: r.ts,
    actor: r.actor,
    type: r.type,
    payload,
    hash: r.hash,
  };
}
