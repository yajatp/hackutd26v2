// Potential breaches: for every tank, what a spoofed level sensor (held flat, lib/rules/faults.ts
// fake_flat) would hide tonight, and what believing it would cost against the truth. Ranked by the
// dollars at stake. Built on the what-if ripple (whatif.ts), which reruns the engine on a faked copy
// for a failed pump and plans a silent stop for a running one. Pure TypeScript.
import type { ConsoleView } from "./alerts.ts";
import type { Dataset } from "./load.ts";
import { whatIf, type Flag, type Ripple } from "./whatif.ts";

export interface BreachRisk {
  tank_id: string;
  facility_id: string;
  system_id: string;
  mode: "failed" | "running";       // failed: the pump is down and the lie skews its plan; running: the lie hides a stop
  exposure: number;                 // believed_cost - honest_cost
  believed_cost: number;
  honest_cost: number;
  real_trip_unix: number | null;    // when the tank really trips if the lie is believed
  shown_trip_unix: number | null;   // failed: the countdown the console would show; running: none (it sees no failure)
  hidden_min: number | null;        // how much warning the lie takes away
  wells: string[];                  // shut in by that trip
  lost_per_hour: number;
  honest_plan: string | null;
  lie_plan: string | null;          // failed only: the plan the lie produces
  flags: Flag[];                    // when the console's sensor check flags it (minutes after now; negative: already)
  summary: string;
}

export function breachOf(r: Ripple, tankId: string): BreachRisk {
  const failed = r.lie !== null;
  const realTrip = failed ? r.lie!.real_trip_unix : r.trip_unix;
  const shown = failed ? r.lie!.trip_unix : null;
  let hidden: number | null = null;
  if (failed && shown !== null && r.trip_unix !== null) hidden = (shown - r.trip_unix) / 60;
  else if (!failed && realTrip !== null) hidden = (realTrip - r.now) / 60;
  return {
    tank_id: tankId,
    facility_id: r.facility_id,
    system_id: r.system_id,
    mode: failed ? "failed" : "running",
    exposure: r.exposure ?? 0,
    believed_cost: r.believed_cost ?? 0,
    honest_cost: r.honest_cost ?? 0,
    real_trip_unix: realTrip,
    shown_trip_unix: shown,
    hidden_min: hidden,
    wells: realTrip !== null ? r.wells.map((w) => w.id) : [],
    lost_per_hour: r.lost_per_hour,
    honest_plan: r.plan?.headline ?? null,
    lie_plan: failed ? r.lie!.plan?.headline ?? null : null,
    flags: r.flags,
    summary: r.summary,
  };
}

// Every tank, most dollars at stake first; ties by the warning lost, then by name.
export function breachRisks(ds: Dataset, view: ConsoleView): BreachRisk[] {
  const out: BreachRisk[] = [];
  for (const s of ds.network.systems) for (const f of s.facilities) {
    out.push(breachOf(whatIf(ds, view, "sensor_spoof", f.tank.id), f.tank.id));
  }
  return out.sort((a, b) => b.exposure - a.exposure || (b.hidden_min ?? -1) - (a.hidden_min ?? -1) || a.tank_id.localeCompare(b.tank_id));
}
