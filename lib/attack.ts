"use client";
// Contract between the Phone 1 remote (/attack) and the backend. The UI uses only useAttack().
// This version keeps state in the page so the screen can be built and tested now; the main
// session swaps the body for Spacetime reducer calls (inject_fault, clear_fault) without
// changing these types.
import { useState } from "react";
import type { FaultKind } from "./rules/faults";

export type { FaultKind };
export type Conn = "connecting" | "connected" | "disconnected";

export interface AttackTarget {
  asset_id: string;     // the tank whose level sensor the fault changes
  facility_id: string;
  system_id: string;
  label: string;        // short name for a button, e.g. "S5 · Facility C tank"
}

export interface ActiveFault {
  asset_id: string;
  kind: FaultKind;
  since_ts: number;     // data time the fault starts
}

export interface AttackApi {
  status: Conn;
  targets: AttackTarget[];
  active: ActiveFault[];
  inject(kind: FaultKind, asset_id: string): Promise<void>;
  clear(asset_id?: string): Promise<void>;   // no asset: clear every fault
}

const DEMO_TARGETS: AttackTarget[] = [
  { asset_id: "TANK_A", facility_id: "FACILITY_A", system_id: "SYS_1", label: "Site 1 · Facility A tank" },
  { asset_id: "TANK_B", facility_id: "FACILITY_B", system_id: "SYS_1", label: "Site 1 · Facility B tank" },
];

export function useAttack(): AttackApi {
  const [active, setActive] = useState<ActiveFault[]>([]);
  return {
    status: "connected",
    targets: DEMO_TARGETS,
    active,
    async inject(kind, asset_id) {
      setActive((a) => [...a.filter((f) => f.asset_id !== asset_id), { asset_id, kind, since_ts: Math.floor(Date.now() / 1000) }]);
    },
    async clear(asset_id) {
      setActive((a) => (asset_id ? a.filter((f) => f.asset_id !== asset_id) : []));
    },
  };
}
