import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { optionsFor, planJoint, planLabel, planNetwork, planSequential, type Failure, type Plan } from "./planner.ts";
import { answerKey, hasData, loadFolder } from "./testdata.ts";

interface Expected {
  event_id: string; kind: string; trucks: number; trips_per_truck: number;
  shut_ins: { well_id: string; start_after_min: number }[]; cost: number; label: string;
}
interface Case {
  source: string; system: string; fleet_free: number;
  failures: { event_id: string; facility_id: string; level_pct: number; horizon_min: number }[];
  expected: Expected[];
}

const FIX = JSON.parse(readFileSync(join(import.meta.dirname, "__fixtures__", "fixtures.json"), "utf8")) as
  { key_cases: Case[]; random_cases: Case[] };

const net = () => { const ds = loadFolder("full_week"); return planNetwork(ds.network, ds.ops); };

function mismatch(p: Plan, e: Expected): string | null {
  const why: string[] = [];
  if (p.kind !== e.kind) why.push(`kind ${p.kind} vs ${e.kind}`);
  if (p.trucks !== e.trucks) why.push(`trucks ${p.trucks} vs ${e.trucks}`);
  if (p.trips_per_truck !== e.trips_per_truck) why.push(`trips ${p.trips_per_truck} vs ${e.trips_per_truck}`);
  const ps = p.shut_ins.map((s) => `${s.well_id}@${s.start_min}`).join(",");
  const es = e.shut_ins.map((s) => `${s.well_id}@${s.start_after_min}`).join(",");
  if (ps !== es) why.push(`shut_ins ${ps} vs ${es}`);
  if (Math.abs(p.cost - e.cost) > 0.01) why.push(`cost ${p.cost} vs ${e.cost}`);
  if (planLabel(p) !== e.label) why.push(`label "${planLabel(p)}" vs "${e.label}"`);
  return why.length ? `${e.event_id}: ${why.join("; ")}` : null;
}

test("91 fixture cases from prototypes/planner.py match exactly", { skip: !hasData("full_week") }, () => {
  const n = net();
  const cases = [...FIX.key_cases, ...FIX.random_cases];
  const bad: string[] = [];
  let good = 0;
  for (const c of cases) {
    const fails: Failure[] = c.failures.map((f) => ({
      event_id: f.event_id, facility: n.facilities[f.facility_id], level_pct: f.level_pct, horizon_min: f.horizon_min,
    }));
    const { plans } = planJoint(fails, n, c.fleet_free);
    const errs = c.expected.map((e, i) => mismatch(plans[i], e)).filter((x): x is string => x !== null);
    if (errs.length) bad.push(`${c.source}/${c.system}: ${errs.join(" | ")}`);
    else good++;
  }
  console.log(`planner fixtures: ${good}/${cases.length}`);
  assert.equal(cases.length, 91);
  assert.deepEqual(bad, []);
});

test("README opening scene: $905 truck beats $1,958.33 shut-in and $5,016.00 do nothing", { skip: !hasData("full_week") }, () => {
  const n = net();
  const fac = Object.values(n.facilities).find((f) => f.id === "S1_FACILITY_C")!;
  const f: Failure = { event_id: "EVENT_9", facility: fac, level_pct: 50, horizon_min: n.repair_min };
  const opts = optionsFor(f, n, n.fleet[fac.system]);
  const dn = opts.find((o) => o.kind === "do_nothing")!;
  const cheapest = (k: string) => opts.filter((o) => o.kind === k).sort((a, b) => a.cost - b.cost)[0];
  assert.ok(Math.abs(dn.cost - 5016) < 0.01, `do nothing ${dn.cost}`);
  const shut = cheapest("shut_in");
  assert.equal(shut.shut_ins[0].well_id, "S1_WELL_C2");
  assert.ok(Math.abs(shut.cost - 1958.33) < 0.01, `shut-in ${shut.cost}`);
  const truck = cheapest("trucks");
  assert.deepEqual([truck.trucks, truck.trips_per_truck, truck.cost], [1, 1, 905]);
  const pick = planJoint([f], n, n.fleet[fac.system]).plans[0];
  assert.equal(planLabel(pick), "1 truck, 1 trip (~$905)");
});

// validate.py parse_ref + compare: same trucks, trips, wells, start within 1 min, cost within $5.
function matchesKey(p: Plan, ref: string): string | null {
  if (ref.startsWith("none")) return p.kind === "none_needed" ? null : `key says none; planner ${p.kind}`;
  const why: string[] = [];
  const m = /(\d+) trucks?, (\d+) trips?/.exec(ref);
  const trucks = m ? +m[1] : 0, trips = m ? +m[2] : 0;
  if (p.trucks !== trucks) why.push(`trucks ${p.trucks} vs ${trucks}`);
  if (p.trucks && p.trips_per_truck !== trips) why.push(`trips ${p.trips_per_truck} vs ${trips}`);
  const kw = new Map([...ref.matchAll(/shut in (\S+) at \+(\d+) min/g)].map((x) => [x[1], +x[2]]));
  const pw = new Map(p.shut_ins.map((s) => [s.well_id, s.start_min]));
  if ([...kw.keys()].sort().join() !== [...pw.keys()].sort().join()) why.push(`wells ${[...pw.keys()]} vs ${[...kw.keys()]}`);
  else for (const [w, s] of kw) if (Math.abs(pw.get(w)! - s) > 1) why.push(`${w} start ${pw.get(w)} vs ${s}`);
  const c = /~\$([\d,]+)/.exec(ref);
  if (c && Math.abs(p.cost - Number(c[1].replace(/,/g, ""))) > 5) why.push(`cost ${p.cost} vs ${c[1]}`);
  return why.length ? why.join("; ") : null;
}

test("full_week, planned at each onset in order: 13 of 13 match the answer key", { skip: !hasData("full_week") }, () => {
  const n = net();
  const key = answerKey("full_week") as { id: string; category: string; facility: string; level_pct: number; onset_unix: number; reference_action: string }[];
  const t0 = Math.min(...key.map((e) => e.onset_unix));
  const pf = key.filter((e) => e.category === "pump_failure");
  const plans = new Map(planSequential(pf.map((e) => ({
    onset_min: (e.onset_unix - t0) / 60,
    failure: { event_id: e.id, facility: n.facilities[e.facility], level_pct: e.level_pct, horizon_min: n.repair_min },
  })), n).map((p) => [p.event_id, p]));
  const bad = pf.map((e) => { const w = matchesKey(plans.get(e.id)!, e.reference_action); return w ? `${e.id}: ${w}` : null; })
    .filter((x) => x !== null);
  assert.equal(pf.length, 13);
  assert.deepEqual(bad, []);
});
