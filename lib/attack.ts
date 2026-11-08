"use client";
// Contract between the Phone 1 remote (/attack) and the backend. The UI uses only useAttack().
// The data comes from the avon Spacetime database: the loaded site's tanks, the simulated faults
// on them, and the inject_fault / clear_fault reducers (each rebuilds the console with the
// faults applied to a copy of the readings; the data itself never changes).
import { useAvonConsole } from "./live";
import type { FaultKind } from "./rules/faults";

export type { FaultKind };
export type Conn = "connecting" | "connected" | "disconnected";

export interface AttackTarget {
  asset_id: string;     // the tank whose level sensor the fault changes
  facility_id: string;
  system_id: string;
  label: string;        // short name for a button, e.g. "North · Facility C tank"
}

export interface ActiveFault {
  asset_id: string;
  kind: FaultKind;
  since_ts: number;     // data time the fault starts
}

// What the console actually shows for a tank's level sensor right now (from the live
// sensor_issue rows), so the phone never claims an effect the engine did not produce.
export interface Verdict { state: string; simulated: boolean }

export interface AttackApi {
  status: Conn;
  targets: AttackTarget[];
  active: ActiveFault[];
  verdicts: Record<string, Verdict>;     // by tank asset id; missing = the console shows it as fine
  inject(kind: FaultKind, asset_id: string): Promise<void>;
  clear(asset_id?: string): Promise<void>;   // no asset: clear every fault
}

// Needs <AvonProvider> above it (app/attack/layout.tsx).
export function useAttack(): AttackApi {
  const avon = useAvonConsole();
  const verdicts: Record<string, Verdict> = {};
  for (const x of avon.view?.sensors ?? []) {
    if (x.metric === "level_pct") verdicts[x.asset_id] = { state: x.state, simulated: x.simulated };
  }
  return { status: avon.status, targets: avon.targets, active: avon.faults, verdicts, inject: avon.inject, clear: avon.clear };
}
