// What the headset's dashboard says, as plain data from the live view (useAvonConsole). Same words
// and the same rules as the console (app/console/Board.tsx), so the two screens never disagree:
// the totals line, the top fix card with its confirm state, the sensors to check, and a "Go to"
// list of facilities, problems first. Unit-tested in board.test.ts.
import { hhmm, money, prettyId, type Alert, type ConsoleView } from "@/lib/eog/alerts";
import type { Confirmed, SiteFacility } from "@/lib/live";
import type { FlowSeries } from "@/lib/eog/flows";
import type { SystemBudget } from "@/lib/eog/budget";
import { countdown, tankStates, type Tone } from "../model";

export const CALM = "No pump failures right now. Every tank is draining normally.";
export const CHANGED_WORD = "CONFIRMED, THEN CHANGED";

// Board.tsx's pretty(): "S5_TANK_C" -> "S5 · TANK C".
export function pretty(id: string): string {
  return id.replace(/^(S\d+)_/, "$1 · ").replace(/_/g, " ");
}

const METRIC_WORD: Record<string, string> = {
  level_pct: "level", flow_bpd: "flow", discharge_psi: "discharge pressure", status: "status",
  pressure_psi: "pressure", receive_flow_bpd: "receive flow", inflow_bpd: "inflow", water_bpd: "water rate",
};
// The console's sensor badges (app/ui/Badge.tsx SENSOR_STATE): word and icon.
const SENSOR: Record<string, { word: string; icon: string }> = {
  dead: { word: "DEAD", icon: "▲" },
  lying: { word: "LYING", icon: "▲" },
  drifting: { word: "DRIFTING", icon: "●" },
};
const BAD = new Set(["dead", "drifting", "lying"]);

// "2 pump failures · Cost if unaddressed $9,957 · Response cost $1,810 · Savings $8,147"; null
// with no failures.
export function totalsLine(view: ConsoleView): string | null {
  const n = view.alerts.filter((a) => a.fix).length;
  if (n === 0) return null;
  const save = Math.max(0, view.totals.do_nothing - view.totals.plans);
  return `${n} pump failure${n > 1 ? "s" : ""} · Cost if unaddressed ${money(view.totals.do_nothing)} · Response cost ${money(view.totals.plans)} · Savings ${money(save)}`;
}

// The totals line in parts, for the dashboard's stat tiles: failures, Cost if unaddressed,
// Response cost, Savings.
export interface Stats { failures: number; failuresWord: string; doNothing: string; plans: string; savings: string }

export const STAT_WORDS = { doNothing: "Cost if unaddressed", plans: "Response cost", savings: "Savings", spare: "Spare trucks" } as const;

export function stats(view: ConsoleView): Stats | null {
  const n = view.alerts.filter((a) => a.fix).length;
  if (n === 0) return null;
  return {
    failures: n, failuresWord: `pump failure${n > 1 ? "s" : ""}`, doNothing: money(view.totals.do_nothing), plans: money(view.totals.plans),
    savings: money(Math.max(0, view.totals.do_nothing - view.totals.plans)),
  };
}

// One pump's own numbers, for its card: what differs per pump even when EOG prices every trip
// the same. "—" when the data does not say.
export interface PumpFacts {
  level: string;                         // "62.4%"
  fill: string;                          // "+3.1 pts/h"
  toLimit: string;                       // "2h 03m"
  lostPerHour: string;                   // "$410/h"
  truckEta: string;                      // "01:35"
  wells: string;                         // "3 wells"
  spare: string;                         // "1 of 2"
}

const DASH = "—";

// Fill rate in level points per hour: the last hour of rate in vs rate out (flow_series), else
// what the level and the countdown imply against the shutdown line.
export function fillPtsH(flow: FlowSeries | undefined, level: number | undefined, hours: number | null, shutdownPct = 90): number | null {
  const last = flow?.points[flow.points.length - 1];
  if (last && Number.isFinite(last.physics_pts)) return last.physics_pts;
  if (level !== undefined && hours !== null && hours > 0) return (shutdownPct - level) / hours;
  return null;
}

export function pumpFacts(a: Alert, flow?: FlowSeries, budget?: SystemBudget): PumpFacts {
  const lvl = a.event.level_pct;
  const f = fillPtsH(flow, lvl, a.hours_to_limit);
  const eta = (a.fix?.details ?? []).find((d) => /^Trucks? arrives?/.test(d));
  const wells = a.facility?.wells?.length;
  const fleet = budget?.fleet ?? a.fix?.fleet;
  const used = budget?.trucks_used ?? a.fix?.plan.trucks;
  return {
    level: lvl !== undefined ? `${lvl.toFixed(1)}%` : DASH,
    fill: f !== null ? `${f >= 0 ? "+" : ""}${f.toFixed(1)} pts/h` : DASH,
    toLimit: countdown(a.hours_to_limit).replace(/^trips in /, "") || DASH,
    lostPerHour: `${money(a.lost_revenue_per_hour)}/h`,
    truckEta: eta ? eta.replace(/^Trucks? arrives? /, "") : DASH,
    wells: wells !== undefined ? `${wells} well${wells === 1 ? "" : "s"}` : DASH,
    spare: fleet !== undefined && used !== undefined ? `${Math.max(0, fleet - used)} of ${fleet}` : DASH,
  };
}

export type ConfirmModel =
  | { kind: "open" }                                          // not confirmed yet: the big button
  | { kind: "confirmed"; text: string }                       // ✓ CONFIRMED by the night shift at 03:12
  | { kind: "changed"; text: string; renew: boolean };        // CONFIRMED, THEN CHANGED (+ Confirm the new plan)

// ConfirmRow's rule: a confirmed plan shows CONFIRMED, THEN CHANGED when its tank sensor is now
// dead, drifting or lying, or when the plan's headline or cost changed since the confirm.
export function confirmModel(a: Alert, done: Confirmed | undefined, clock: (ms: number) => string): ConfirmModel {
  const fix = a.fix!;
  if (!done) return { kind: "open" };
  const bad = a.tank_sensor && BAD.has(a.tank_sensor.state) ? a.tank_sensor : null;
  const changed = done.headline !== fix.headline || Math.round(done.cost) !== Math.round(fix.plan.cost);
  if (!bad && !changed) return { kind: "confirmed", text: `by the night shift at ${clock(done.atMs)}` };
  let text = `You confirmed "${done.headline}" (${money(done.cost)}) at ${clock(done.atMs)}.`;
  if (bad) text += ` It relies on a tank sensor that is now ${bad.state.toUpperCase()}${bad.simulated ? " (simulated)" : ""}. Check the sensor before the truck rolls.`;
  if (changed) text += ` The plan now reads "${fix.headline}" (${money(fix.plan.cost)}).`;
  return { kind: "changed", text, renew: changed };
}

export interface FixCardModel {
  alertId: string;
  facilityId: string;
  facility: string;                      // "S5 Facility C"
  when: string;                          // "trips in 2h 03m", "" when unknown
  headline: string;                      // "Call 1 truck now, 1 trip"
  cost: string;                          // "$905"
  sensorFirst: string | null;            // "CHECK THE TANK SENSOR FIRST: LYING · SIMULATED"
  canConfirm: boolean;                   // the console offers Confirm only when there were alternatives
  confirm: ConfirmModel;
  details: string;                       // the console's line under the plan: "Truck arrives 01:35 · tank would trip 03:38 · …"
  assetId: string;                       // the failed pump: what Simulate runs on
  tankId: string;                        // the facility's tank
  pump: PumpFacts;
}

// The console's detail line under a fix card.
export function fixDetails(a: Alert): string {
  const fix = a.fix!;
  return [
    ...fix.details,
    fix.trip_at_unix !== null ? `tank would trip ${hhmm(fix.trip_at_unix)}` : null,
    `repair done ${hhmm(fix.repair_done_unix)}`,
    a.event.level_pct !== undefined ? `level now ${a.event.level_pct.toFixed(1)}%` : null,
  ].filter(Boolean).join(" · ");
}

export interface InsightLite { flows?: readonly FlowSeries[]; budget?: readonly SystemBudget[] }

// Every pump failure with a plan as a card, the console's order (top problem first).
export function fixCards(view: ConsoleView, confirmations: Record<string, Confirmed>, clock: (ms: number) => string, insight: InsightLite = {}): FixCardModel[] {
  return view.alerts.filter((a) => a.fix).map((a) => cardOf(a, confirmations, clock, insight));
}

// The console's top fix card: its first pump failure with a plan.
export function topCard(view: ConsoleView, confirmations: Record<string, Confirmed>, clock: (ms: number) => string, insight: InsightLite = {}): FixCardModel | null {
  const a = view.alerts.find((x) => x.fix);
  if (!a || !a.fix) return null;
  return cardOf(a, confirmations, clock, insight);
}

function cardOf(a: Alert, confirmations: Record<string, Confirmed>, clock: (ms: number) => string, insight: InsightLite): FixCardModel {
  const facilityId = a.event.facility_id;
  const s = a.tank_sensor && BAD.has(a.tank_sensor.state) ? a.tank_sensor : null;
  const fix = a.fix!;
  return {
    alertId: a.id,
    facilityId,
    facility: prettyId(facilityId),
    when: countdown(a.hours_to_limit),
    headline: fix.headline,
    cost: money(fix.plan.cost),
    sensorFirst: s ? `CHECK THE TANK SENSOR FIRST: ${SENSOR[s.state]?.word ?? s.state.toUpperCase()}${s.simulated ? " · SIMULATED" : ""}` : null,
    canConfirm: fix.alternatives.length > 0,
    confirm: confirmModel(a, confirmations[a.id], clock),
    details: fixDetails(a),
    assetId: a.event.asset_id,
    tankId: a.facility?.tank?.id ?? facilityId.replace("FACILITY", "TANK"),
    pump: pumpFacts(a, insight.flows?.find((f) => f.facility_id === facilityId), insight.budget?.find((b) => b.system_id === a.event.system_id)),
  };
}

// The console's other fix cards, one line each on the dashboard.
export interface OtherFix { alertId: string; facility: string; headline: string; cost: string; when: string; confirmed: boolean }

export function otherFixes(view: ConsoleView, confirmations: Record<string, Confirmed>): OtherFix[] {
  return view.alerts.filter((a) => a.fix).slice(1).map((a) => ({
    alertId: a.id,
    facility: prettyId(a.event.facility_id),
    headline: a.fix!.headline,
    cost: money(a.fix!.plan.cost),
    when: countdown(a.hours_to_limit),
    confirmed: !!confirmations[a.id],
  }));
}

export interface SensorLine {
  key: string;
  icon: string;                          // ▲ or ●, as the console's badge
  word: string;                          // LYING, DEAD, DRIFTING
  what: string;                          // "S5 · TANK C level"
  simulated: boolean;
  evidence: string;
}

export function sensorLines(view: ConsoleView): SensorLine[] {
  return (view.sensors ?? []).map((x) => ({
    key: x.key,
    icon: SENSOR[x.state]?.icon ?? "●",
    word: SENSOR[x.state]?.word ?? x.state.toUpperCase(),
    what: `${pretty(x.asset_id)} ${METRIC_WORD[x.metric] ?? x.metric.replace(/_/g, " ")}`,
    simulated: x.simulated,
    evidence: x.evidence,
  }));
}

export interface GoRow {
  facility_id: string;
  label: string;                         // "S5 · C"
  state: string;                         // the worst line's first words: "PUMP FAILED", "LYING", "INSPECT", "OK"
  tone: Tone;
  top: boolean;                          // the console's top problem
}

const RANK: Record<Tone, number> = { alert: 2, warn: 1, ok: 0 };

// Every facility, the console's top problem first, then pump failures, then sensors and
// inspections, then the quiet ones by name.
export function goToRows(facilities: readonly SiteFacility[], view: ConsoleView | null): GoRow[] {
  const top = view?.alerts.find((a) => a.fix)?.event.facility_id ?? view?.alerts[0]?.event.facility_id ?? null;
  return tankStates(facilities, view)
    .map((s) => {
      const worst = s.lines.find((l) => l.tone === s.tone) ?? s.lines[0];
      return { facility_id: s.facility_id, label: s.short, state: worst.text.split(" · ")[0], tone: s.tone, top: s.facility_id === top };
    })
    .sort((a, b) => Number(b.top) - Number(a.top) || RANK[b.tone] - RANK[a.tone] || a.facility_id.localeCompare(b.facility_id));
}

export interface BoardModel {
  totals: string | null;
  stats: Stats | null;
  calm: string | null;
  top: FixCardModel | null;
  cards: FixCardModel[];                 // every pump failure, one card at a time on the dashboard
  others: OtherFix[];
  sensors: SensorLine[];
  goTo: GoRow[];
  now: number | null;                    // the view's clock (unix s)
}

export function boardModel(view: ConsoleView | null, confirmations: Record<string, Confirmed>, facilities: readonly SiteFacility[], clock: (ms: number) => string, insight: InsightLite = {}): BoardModel {
  if (!view) return { totals: null, stats: null, calm: null, top: null, cards: [], others: [], sensors: [], goTo: goToRows(facilities, null), now: null };
  const totals = totalsLine(view);
  const cards = fixCards(view, confirmations, clock, insight);
  return {
    totals,
    stats: stats(view),
    calm: totals ? null : CALM,
    top: cards[0] ?? null,
    cards,
    others: otherFixes(view, confirmations),
    sensors: sensorLines(view),
    goTo: goToRows(facilities, view),
    now: view.now,
  };
}

// The Go to list in pages that fit the panel.
export function page<T>(rows: readonly T[], i: number, per: number): { rows: T[]; index: number; count: number } {
  const count = Math.max(1, Math.ceil(rows.length / per));
  const index = ((i % count) + count) % count;
  return { rows: rows.slice(index * per, index * per + per), index, count };
}

// Local wall clock, as the console's ConfirmRow prints it.
export function localClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
