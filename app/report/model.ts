// The incident report's rules, without React: which incident, what each entry said in plain
// words, and the team as the log records it. Everything is a replay of the log; nothing here
// reads a stored status.

import type { Json, LogEvent } from "../../lib/chain";
import type { Incident } from "../../lib/rules/darkroom/replay";
import { parseActor } from "../../lib/rules/darkroom/roles";
import type { ChainStatus } from "../../lib/rules/darkroom/status";

type Broken = Extract<ChainStatus, { kind: "rollback" | "tampering" }>;

// The same test the box uses to stop writing: anything but a whole, witnessed chain.
export function isBroken(st: ChainStatus): st is Broken {
  return st.kind === "rollback" || st.kind === "tampering";
}

// One sentence under the red status line.
export function brokenWhy(st: Broken): string {
  return st.kind === "rollback"
    ? `Entries from #${st.at} on were removed after this device saw them, so this report is missing part of the record.`
    : "Part of the record changed after it was written, so this report cannot be relied on.";
}

// ?incident=INC-0001 picks that incident; no parameter picks the newest.
export function pickIncident(incidents: readonly Incident[], requested: string): { incident: Incident | null; notFound: boolean } {
  const want = requested.trim().toUpperCase();
  if (!want) return { incident: incidents[incidents.length - 1] ?? null, notFound: false };
  const found = incidents.find(i => i.id === want) ?? null;
  return { incident: found, notFound: !found };
}

function field(payload: Json, key: string): string {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const v = payload[key];
    if (typeof v === "string") return v;
  }
  return "";
}

function withNote(s: string, note: string): string {
  return note ? `${s}. Note: ${note}` : s;
}

// What one entry did, in the words a reader of the report would use.
export function describeEntry(e: LogEvent): string {
  const p = e.payload;
  switch (e.type) {
    case "incident_opened":
      return `opened the incident: ${field(p, "title")}`;
    case "scope_update":
      return withNote(`marked ${field(p, "system")} ${field(p, "state")} (${field(p, "certainty")})`, field(p, "note"));
    case "evidence_imported": {
      const base = `logged evidence ${field(p, "ref")} from ${field(p, "source")}${field(p, "fingerprint") ? "" : " (reference only)"}`;
      return withNote(base, field(p, "note"));
    }
    case "chat":
      return `wrote: ${field(p, "text")}`;
    case "incident_closed":
      return `closed it: ${field(p, "resolution")}`;
    case "member_added":
      return `added ${field(p, "name")} as ${field(p, "role")}`;
    default:
      return `wrote a ${e.type} entry`;
  }
}

export interface TimelineEntry {
  seq: number;
  ts: string;
  name: string;
  role: string;
  what: string;
}

export function timelineFor(log: readonly LogEvent[], incidentId: string): TimelineEntry[] {
  return [...log]
    .filter(e => e.incident_id === incidentId)
    .sort((a, b) => a.seq - b.seq)
    .map(e => {
      const a = parseActor(e.actor);
      return { seq: e.seq, ts: e.ts, name: a.name, role: a.role, what: describeEntry(e) };
    });
}

// Who wrote entry #seq, as the server stamped it.
export function actorAt(log: readonly LogEvent[], seq: number): { name: string; role: string } {
  const e = log.find(x => x.seq === seq);
  return e ? parseActor(e.actor) : { name: "", role: "" };
}

export interface TeamMember {
  identity: string;
  name: string;
  role: string;
  seq: number; // the newest member_added entry for this identity
}

// The team as the log records it (member_added entries; the newest per identity wins), in the
// order people were first added.
export function teamFromLog(log: readonly LogEvent[]): TeamMember[] {
  const team = new Map<string, TeamMember>();
  for (const e of [...log].sort((a, b) => a.seq - b.seq)) {
    if (e.type !== "member_added") continue;
    const identity = field(e.payload, "identity").toLowerCase().replace(/^0x/, "");
    if (!identity) continue;
    team.set(identity, { identity, name: field(e.payload, "name"), role: field(e.payload, "role"), seq: e.seq });
  }
  return [...team.values()];
}

// The command a reader runs on any laptop on the isolated local network.
export function verifyCommand(host: string, db: string): string {
  return `node verify-standalone.mjs --host ${host} --db ${db}`;
}
