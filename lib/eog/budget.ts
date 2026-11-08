// The night's money and trucks, per system, from the console the engine built: what the plans
// cost against doing nothing, the trucks the plans call against the system's emergency fleet
// (ops.json), and the production at stake while pumps are down. Pure TypeScript.
import type { Alert, ConsoleView } from "./alerts.ts";
import type { Dataset } from "./load.ts";
import { planNetwork } from "./planner.ts";

export interface SystemBudget {
  system_id: string;
  facilities: number;
  fleet: number;                  // ops.json emergency_fleet_size
  trucks_used: number;            // trucks the chosen plans call
  trips: number;                  // truck trips the chosen plans make
  failures: number;               // pump failures on the console
  plans: number;                  // what the chosen plans cost
  do_nothing: number;             // what letting those tanks trip costs
  truck_cost: number;
  shut_in_cost: number;           // revenue given up by planned shut-ins
  at_risk_per_hour: number;       // production lost per hour if every failing tank trips
  revenue_per_hour: number;       // the whole system's production per hour
}

// The do-nothing cost of one pump-failure card, as totals.do_nothing counts it.
export function doNothingOf(a: Alert): number {
  if (!a.fix) return 0;
  if (a.fix.plan.kind === "do_nothing") return a.fix.plan.cost;
  return a.fix.alternatives.find((x) => x.label === "Do nothing")?.cost ?? 0;
}

export function budgetOf(ds: Dataset, view: ConsoleView): SystemBudget[] {
  const net = planNetwork(ds.network, ds.ops);
  return ds.network.systems.map((s) => {
    const cards = view.alerts.filter((a) => a.event.system_id === s.id && a.fix);
    const b: SystemBudget = {
      system_id: s.id,
      facilities: s.facilities.length,
      fleet: net.fleet[s.id] ?? 0,
      trucks_used: 0, trips: 0, failures: cards.length, plans: 0, do_nothing: 0, truck_cost: 0, shut_in_cost: 0,
      at_risk_per_hour: 0,
      revenue_per_hour: s.facilities.reduce((u, f) => u + net.facilities[f.id].wells.reduce((w, x) => w + x.rev_per_day, 0) / 24, 0),
    };
    for (const a of cards) {
      const p = a.fix!.plan;
      b.trucks_used += p.trucks;
      b.trips += p.trucks * p.trips_per_truck;
      b.plans += p.cost;
      b.do_nothing += doNothingOf(a);
      b.truck_cost += p.truck_cost;
      b.shut_in_cost += p.shut_in_cost;
      b.at_risk_per_hour += a.lost_revenue_per_hour;
    }
    return b;
  });
}
