// What the site twin shows, as plain data: where each tank sits on the table and what its
// label, color, fill and detail panel say. Everything comes from the live view
// (useAvonConsole().facilities and .view); nothing here knows a facility by name.
// Words match the console (app/console/Board.tsx) so the two screens never disagree.
import { money, prettyId, type Alert, type ConsoleView, type SensorIssue } from "@/lib/eog/alerts";
import type { SiteFacility } from "@/lib/live";

export const TABLE_M = 1;          // the site's longest side, in meters on the table
export const NEUTRAL_FILL = 0.5;   // drawn when no alert reports the tank's level
const CLUSTER_MARGIN_M = 0.07;

export type Tone = "alert" | "warn" | "ok";
export interface StateLine { text: string; tone: Tone }

export interface PlacedTank { facility_id: string; system_id: string; x: number; z: number }
export interface Cluster { system_id: string; x: number; z: number; r: number }

export interface TankState {
  facility_id: string;
  system_id: string;
  tank_id: string;
  name: string;                    // "S5 Facility C"
  short: string;                   // "S5 · C", for labels
  tone: Tone;                      // the worst line: the tank's color
  sensor: Tone | null;             // "warn" when a sensor on this facility is dead, drifting or lying
  lines: StateLine[];              // the label, sensor first as on the console
  fill: number | null;             // 0..1 from an alert's level_pct; null = not reported
  evidence: string[];
  fix: { headline: string; cost: number } | null;
  bring: string[];                 // what the crew takes to the site
}

// "S5_FACILITY_C" in system "S5" -> "S5 · C", for the tank labels. Other naming is kept.
export function shortName(facility_id: string, system_id: string): string {
  const rest = facility_id.startsWith(system_id + "_") ? facility_id.slice(system_id.length + 1) : facility_id;
  const tail = rest.replace(/^FACILITY_?/i, "").replace(/_/g, " ") || rest;
  return `${system_id} · ${tail}`;
}

// Same as the console's fix card header.
export function countdown(h: number | null): string {
  if (h === null) return "";
  if (h <= 0) return "at shutdown now";
  const m = Math.round(h * 60);
  return `trips in ${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// Lat/lon to table meters: min/max normalized so the longest side is TABLE_M, centered.
// East is +x, north is -z (away from someone standing at the table's south edge).
// Longitude is scaled by cos(latitude) so the site keeps its shape.
export function layoutSite(facilities: readonly SiteFacility[], size = TABLE_M): { tanks: PlacedTank[]; clusters: Cluster[] } {
  if (facilities.length === 0) return { tanks: [], clusters: [] };
  const lats = facilities.map((f) => f.lat), lons = facilities.map((f) => f.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const midLat = (minLat + maxLat) / 2, midLon = (minLon + maxLon) / 2;
  const k = Math.cos((midLat * Math.PI) / 180);
  const span = Math.max((maxLon - minLon) * k, maxLat - minLat);
  const scale = span > 0 ? size / span : 1;
  const tanks = facilities.map((f) => ({
    facility_id: f.facility_id,
    system_id: f.system_id,
    x: (f.lon - midLon) * k * scale,
    z: (midLat - f.lat) * scale,
  }));
  const bySystem = new Map<string, PlacedTank[]>();
  for (const t of tanks) bySystem.set(t.system_id, [...(bySystem.get(t.system_id) ?? []), t]);
  const clusters = [...bySystem].map(([system_id, ts]) => {
    const x = ts.reduce((s, t) => s + t.x, 0) / ts.length;
    const z = ts.reduce((s, t) => s + t.z, 0) / ts.length;
    const r = Math.max(...ts.map((t) => Math.hypot(t.x - x, t.z - z))) + CLUSTER_MARGIN_M;
    return { system_id, x, z, r };
  }).sort((a, b) => a.system_id.localeCompare(b.system_id));
  return { tanks, clusters };
}

const SENSOR_WORD: Record<string, string> = { dead: "DEAD", lying: "LYING", drifting: "DRIFTING" };

// What a crew takes for each sensor state; the dead and lying lines are the console's words.
const SENSOR_BRING: Record<string, string> = {
  dead: "A replacement sensor. Until then, plans use its last reading.",
  lying: "Check the sensor on site first. A reading that disagrees with physics can also mean someone changed it.",
  drifting: "Check the sensor on site and recalibrate it; its reading is moving away from physics.",
};

const RANK: Record<Tone, number> = { alert: 2, warn: 1, ok: 0 };

function sensorIssuesFor(facility_id: string, view: ConsoleView, alerts: Alert[]): { state: string; evidence: string; simulated: boolean }[] {
  const listed = (view.sensors ?? []).filter((s: SensorIssue) => s.facility_id === facility_id && s.state in SENSOR_WORD);
  if (listed.length > 0) return listed;
  // A pump failure carries the health of the tank sensor its plan is built on.
  return alerts.flatMap((a) => (a.tank_sensor && a.tank_sensor.state in SENSOR_WORD ? [a.tank_sensor] : []));
}

export function tankStates(facilities: readonly SiteFacility[], view: ConsoleView | null): TankState[] {
  return facilities.map((f) => {
    const base = {
      facility_id: f.facility_id, system_id: f.system_id, tank_id: f.tank_id,
      name: prettyId(f.facility_id), short: shortName(f.facility_id, f.system_id),
    };
    if (!view) {
      return { ...base, tone: "ok", sensor: null, lines: [{ text: "NO DATA", tone: "ok" }], fill: null, evidence: [], fix: null, bring: [] };
    }
    const alerts = view.alerts.filter((a) => a.event.facility_id === f.facility_id);
    const issues = sensorIssuesFor(f.facility_id, view, alerts);
    const lines: StateLine[] = [];
    const evidence: string[] = [];
    const bring: string[] = [];
    let fix: TankState["fix"] = null;
    let fill: number | null = null;

    for (const s of issues.slice(0, 1)) lines.push({ text: SENSOR_WORD[s.state] + (s.simulated ? " · SIMULATED" : ""), tone: "warn" });
    for (const s of issues) {
      evidence.push(s.evidence);
      if (!bring.includes(SENSOR_BRING[s.state])) bring.push(SENSOR_BRING[s.state]);
    }
    for (const a of alerts) {
      if (a.event.category === "pump_failure") {
        const when = countdown(a.hours_to_limit);
        lines.push({ text: when ? `PUMP FAILED · ${when}` : "PUMP FAILED", tone: "alert" });
        if (a.fix) {
          fix = { headline: a.fix.headline, cost: a.fix.plan.cost };
          bring.push(`The plan: ${a.fix.headline} (${money(a.fix.plan.cost)}).`);
        }
      } else {
        const what = a.event.category === "pipeline_leak" ? "possible leak" : "pump wearing out";
        lines.push({ text: `INSPECT · ${what}`, tone: "warn" });
        bring.push(`A field inspection crew for ${a.event.asset_id}.`);
      }
      evidence.push(a.event.evidence.join("; "));
      if (a.event.level_pct !== undefined && fill === null) {
        fill = Math.min(1, Math.max(0, a.event.level_pct / 100));
        evidence.push(`Level now ${a.event.level_pct.toFixed(1)}%.`);
      }
    }
    if (lines.length === 0) {
      lines.push({ text: "OK", tone: "ok" });
      bring.push("Nothing. No open problem at this facility.");
    }
    const tone = lines.reduce<Tone>((w, l) => (RANK[l.tone] > RANK[w] ? l.tone : w), "ok");
    return { ...base, tone, sensor: issues.length > 0 ? "warn" : null, lines, fill, evidence: evidence.filter(Boolean), fix, bring };
  });
}

// The tank the judge should look at first: the console's top fix card, else its top alert,
// else the first sensor it lists.
export function topFacility(view: ConsoleView | null): string | null {
  if (!view) return null;
  const a = view.alerts.find((x) => x.fix) ?? view.alerts[0];
  if (a) return a.event.facility_id;
  return (view.sensors ?? []).find((s) => s.facility_id)?.facility_id ?? null;
}

// The rows of a tank's label in the headset: its short name, then each state line. A long line
// breaks after its first " · " so labels stay narrow; the words are the console's, unchanged.
export interface LabelRow { text: string; tone: Tone | "name" }
const BREAK_AFTER = 18;

export function labelRows(s: TankState): LabelRow[] {
  const rows: LabelRow[] = [{ text: s.short, tone: "name" }];
  for (const l of s.lines) {
    const i = l.text.indexOf(" · ");
    if (l.text.length > BREAK_AFTER && i > 0) rows.push({ text: l.text.slice(0, i + 2), tone: l.tone }, { text: l.text.slice(i + 3), tone: l.tone });
    else rows.push({ text: l.text, tone: l.tone });
  }
  return rows;
}

// A label's box in meters. The VR labels are drawn to exactly this size (TwinCanvas), so the
// stacking below matches what the judge sees. One row is about 1.8 cm letters.
export const LABEL_ROW_M = 0.024;
export const LABEL_PAD_M = 0.006;

export function labelSize(s: TankState | undefined): { w: number; h: number } {
  const rows = s ? labelRows(s).length : 2;
  return { w: !s || s.tone === "ok" ? 0.12 : 0.24, h: 2 * LABEL_PAD_M + rows * LABEL_ROW_M };
}

// How far above its tank each VR label floats, so labels of nearby tanks stack instead of
// covering each other. Problem labels are placed first and stay closest to their tanks. It uses
// distances on the table only, so the stacking holds from every side as the model turns.
export function labelLifts(tanks: readonly PlacedTank[], states: readonly TankState[]): Map<string, number> {
  const st = new Map(states.map((s) => [s.facility_id, s]));
  const rank = (id: string) => RANK[st.get(id)?.tone ?? "ok"];
  const order = [...tanks].sort((a, b) => rank(b.facility_id) - rank(a.facility_id) || a.facility_id.localeCompare(b.facility_id));
  const placed: { x: number; z: number; w: number; h: number; lift: number }[] = [];
  const out = new Map<string, number>();
  for (const t of order) {
    const { w, h } = labelSize(st.get(t.facility_id));
    let lift = 0;
    for (let moved = true; moved;) {
      moved = false;
      for (const p of placed) {
        const near = Math.hypot(p.x - t.x, p.z - t.z) < (p.w + w) / 2;
        if (near && lift < p.lift + p.h && p.lift < lift + h) {
          lift = p.lift + p.h + 0.005;
          moved = true;
        }
      }
    }
    placed.push({ x: t.x, z: t.z, w, h, lift });
    out.set(t.facility_id, lift);
  }
  return out;
}
