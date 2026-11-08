// The Darkroom in /twin, as plain data (unit-tested in logic.test.ts):
// - attackSignal: is the site being viewed under attack right now (a tank sensor reporting false
//   data, or LOCKDOWN active), in one plain sentence;
// - the security alert's show / dismiss state: shown once per new signal, a dismissal holds until
//   the signal changes;
// - consoleRows: a Darkroom snapshot (lib/darkroom-live.ts) as the rows the room's console shows.
import type { DarkroomSnapshot } from "@/lib/darkroom-live";
import { parseActor } from "@/lib/rules/darkroom/roles";

export interface AttackSignal {
  key: string;                 // changes when the attack changes (a new tank faked, a lockdown)
  line: string;                // one plain sentence: what happened
  facilityId: string | null;   // the tank's facility when one is named
  lockdown: boolean;
}

export interface AttackInput {
  faked: readonly { facility_id: string; name: string; short?: string }[]; // tanks reading SIMULATED now
  lockdown: { active: boolean; tank: string; evidenceRef: string; startedAtMs: number } | null;
}

// The plain words for the alert. Several fakes name the first and count the rest.
export function attackSignal(x: AttackInput): AttackSignal | null {
  const fakes = [...x.faked].sort((a, b) => a.facility_id.localeCompare(b.facility_id));
  const lock = x.lockdown?.active ? x.lockdown : null;
  if (fakes.length === 0 && !lock) return null;
  const parts: string[] = [];
  if (fakes.length > 0) parts.push(`fake:${fakes.map((f) => f.facility_id).join(",")}`);
  if (lock) parts.push(`lock:${lock.startedAtMs}`);
  let line: string;
  if (fakes.length > 0) {
    const f = fakes[0];
    const more = fakes.length > 1 ? ` (and ${fakes.length - 1} more)` : "";
    line = `${f.name} tank sensor is reporting false data (simulated attack)${more}.`;
  } else {
    line = `LOCKDOWN is active: the plan is on hold while ${lock!.tank} is investigated${lock!.evidenceRef ? ` (${lock!.evidenceRef})` : ""}.`;
  }
  return { key: parts.join("|"), line, facilityId: fakes[0]?.facility_id ?? null, lockdown: !!lock };
}

// The alert's state: which signal key the judge last dismissed (or acted on).
export interface AlertState { dismissed: string | null }
export const NO_ALERT: AlertState = { dismissed: null };

export function alertVisible(st: AlertState, sig: AttackSignal | null): boolean {
  return !!sig && st.dismissed !== sig.key;
}

// "Not now" and "Enter the Darkroom" both put this signal away; a new signal shows again.
export function dismissAlert(_st: AlertState, sig: AttackSignal | null): AlertState {
  return { dismissed: sig?.key ?? null };
}

// The signal clearing resets the memory, so the same fake injected again later alerts again.
export function settleAlert(st: AlertState, sig: AttackSignal | null): AlertState {
  return sig || st.dismissed === null ? st : NO_ALERT;
}

export const short = (h: string, n = 8) => (h ? h.slice(0, n) : "");

export interface ConsoleRows {
  live: boolean;                               // the Darkroom database answered
  connection: DarkroomSnapshot["connection"];
  status: { tone: "ok" | "alert" | "idle"; text: string };
  entries: { seq: string; kind: string; who: string; hash: string }[];   // newest first, at most 5
  team: { name: string; role: string }[];
  incident: "open" | "closed" | "none";
  count: number;
}

// The console rows from a snapshot. "live" only once the database answered with data.
export function consoleRows(s: DarkroomSnapshot, max = 5): ConsoleRows {
  const live = s.connection === "live" && s.ready;
  const tone = s.status.kind === "verified" ? "ok" : s.status.kind === "empty" ? "idle" : "alert";
  const names = new Map(s.members.map((m) => [m.identity, m]));
  const sorted = [...s.events].sort((a, b) => b.seq - a.seq);
  const entries = sorted.slice(0, max).map((e) => {
    const a = parseActor(e.actor);
    const m = a.identity ? names.get(a.identity) : undefined;
    const who = m?.name || a.name || short(e.actor, 10);
    return { seq: `#${e.seq}`, kind: e.type, who, hash: short(e.hash) };
  });
  let incident: ConsoleRows["incident"] = "none";
  for (const e of sorted) {
    if (e.type === "incident_closed") { incident = "closed"; break; }
    if (e.type === "incident_opened") { incident = "open"; break; }
  }
  const team = s.members.filter((m) => m.active).map((m) => ({ name: m.name, role: m.role }));
  return { live, connection: s.connection, status: { tone, text: s.status.text }, entries, team, incident, count: s.events.length };
}

// The threat model, from the /box card (app/box/ThreatModelCard.tsx), short enough for a wall.
export const PROTECTS = [
  "An attacker on the company network reading or changing the incident record.",
  "Someone quietly editing or deleting log entries afterward (hash-chained, tamper-evident).",
  "People writing to the record without being let in (roles: Commander, Responder, Viewer).",
] as const;
export const DOES_NOT = [
  "Proving the original sensor evidence was true: integrity, not authenticity.",
  "Someone with physical control of the Darkroom laptop.",
] as const;

export const ISOLATED_LINE = "This headset is on the field network. The Darkroom runs on its own isolated network and cannot be reached from here. Take the reference to the Darkroom laptop.";
export const ALERT_TITLE = "Security alert";
export const ALERT_MOVE = "The field network may be compromised. Move the incident to the Darkroom, an isolated network.";
