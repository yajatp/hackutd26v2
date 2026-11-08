// The attack moment as data (docs/TWIN-THEME.md "The attack moment"): compare two snapshots of
// the tanks (tankStates in ../model) and say what just happened, so the headset can light a
// beacon, send a shockwave, slide a toast in and chirp. Pure, no DOM: tested in events.test.ts.
// Words are the console's: the state line of a tank is quoted, never reworded.
import type { Alert, ConsoleView } from "@/lib/eog/alerts";
import type { Confirmed } from "@/lib/live";
import type { TankState, Tone } from "../model";

export type FxKind = "faked" | "cleared" | "failed";

export interface FxEvent {
  kind: FxKind;
  facility_id: string;
  name: string;          // "S9 Facility Q"
  what: string;          // "tank level sensor", or "" when the state line says it all
  state: string;         // the console's line: "LYING · SIMULATED", "PUMP FAILED · trips in 2h 03m"
  text: string;          // one line: "▲ S9 Facility Q · tank level sensor LYING · SIMULATED"
  sub: string | null;    // a second line: "Your confirmed plan rests on it"
  tone: Tone;            // warn: a faked sensor; alert: a pump failed; ok: cleared
}

// A Toast notice: an event with its place in the session's order.
export interface FxNotice extends FxEvent { seq: number }

export const RESTS_ON_IT = "Your confirmed plan rests on it";
export const ICON: Record<FxKind, string> = { faked: "▲", failed: "▲", cleared: "✓" };

const SIMULATED_SENSOR = /^(LYING|DEAD|DRIFTING)\b.*\bSIMULATED\b/;
const PUMP_FAILED = /^PUMP FAILED\b/;
const ANY_SENSOR = /^(LYING|DEAD|DRIFTING)\b/;

// The tank's faked-sensor line ("LYING · SIMULATED"), or null when no sensor on it is simulated.
export function simulatedLine(s: TankState): string | null {
  return s.lines.find((l) => SIMULATED_SENSOR.test(l.text))?.text ?? null;
}

// The tank's pump-failure line ("PUMP FAILED · trips in 2h 03m"), or null.
export function failedLine(s: TankState): string | null {
  return s.lines.find((l) => PUMP_FAILED.test(l.text))?.text ?? null;
}

// The facilities whose tank reads a SIMULATED sensor now: where the beacon spins and the gauge
// tears. `faultAssets` (tank ids from useAvonConsole().faults) also counts, because a fault row
// can land a moment before the console flags it (as isFaked in ../look).
export function fakedIds(states: readonly TankState[], faultAssets: ReadonlySet<string> = new Set()): Set<string> {
  const out = new Set<string>();
  for (const s of states) if (simulatedLine(s) !== null || faultAssets.has(s.tank_id)) out.add(s.facility_id);
  return out;
}

// The facilities where the night shift confirmed a plan (useAvonConsole().confirmations is by
// alert id). A faked sensor there is the plan's own evidence going bad.
export function confirmedFacilities(view: ConsoleView | null, confirmations: Readonly<Record<string, Confirmed>>): Set<string> {
  const out = new Set<string>();
  if (!view) return out;
  for (const a of view.alerts as Alert[]) if (confirmations[a.id] && a.event.facility_id) out.add(a.event.facility_id);
  return out;
}

const noBaseline = (s: TankState | undefined) => !s || s.lines.some((l) => l.text === "NO DATA");
const ORDER: Record<FxKind, number> = { faked: 0, failed: 1, cleared: 2 };

function event(kind: FxKind, s: TankState, what: string, state: string, sub: string | null, tone: Tone): FxEvent {
  const detail = what ? `${what} ${state}` : state;
  return { kind, facility_id: s.facility_id, name: s.name, what, state, text: `${ICON[kind]} ${s.name} · ${detail}`, sub, tone };
}

// What changed between two snapshots. `prev` null (the first snapshot) or a tank with no
// baseline (not in prev, or prev had no data) gives no events, so loading a site never floods the
// judge with toasts. A pump-failure countdown ticking down is not a new failure.
export function diffFaults(
  prev: readonly TankState[] | null,
  next: readonly TankState[],
  confirmed: ReadonlySet<string> = new Set(),
): FxEvent[] {
  if (!prev) return [];
  const before = new Map(prev.map((s) => [s.facility_id, s]));
  const out: FxEvent[] = [];
  for (const s of next) {
    const p = before.get(s.facility_id);
    if (noBaseline(p) || noBaseline(s)) continue;
    const was = simulatedLine(p!), now = simulatedLine(s);
    if (now !== null && now !== was) {
      out.push(event("faked", s, "tank level sensor", now, confirmed.has(s.facility_id) ? RESTS_ON_IT : null, "warn"));
    } else if (now === null && was !== null) {
      const still = s.lines.find((l) => ANY_SENSOR.test(l.text))?.text;
      out.push(event("cleared", s, "", "simulated fault cleared", still ? `Tank level sensor now ${still}` : "Tank level sensor reads true again", "ok"));
    }
    const failed = failedLine(s);
    if (failed !== null && failedLine(p!) === null) {
      out.push(event("failed", s, "", failed, s.fix ? `Do this: ${s.fix.headline}` : null, "alert"));
    }
  }
  return out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
}

// The event worth one chirp when several land together: a fake first, then a failure, then a clear.
export function loudest(events: readonly FxEvent[]): FxEvent | null {
  return events.reduce<FxEvent | null>((w, e) => (!w || ORDER[e.kind] < ORDER[w.kind] ? e : w), null);
}
