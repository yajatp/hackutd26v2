// Shapes of EOG's dataset files (network.json, ops.json) and of what the engine produces.
// Field names follow EOG's files and SPEC.md events.json so outputs compare 1:1 with the prototypes.

export interface WellJson { id: string; baseline_water_bpd: number; oil_bpd: number; gas_mcfd: number }

export interface FacilityJson {
  id: string;
  lat: number;
  lon: number;
  wells: WellJson[];
  tank: { id: string; capacity_bbl: number };
  pump: { id: string; max_flow_bpd: number; start_level_pct: number; stop_level_pct: number };
  pipeline: { id: string; max_bpd: number; max_pressure_psi: number };
}

export interface SystemJson {
  id: string;
  center: [number, number];
  truck_yard: [number, number];
  disposal_site: { id: string; lat: number; lon: number; pressure_psi: number };
  facilities: FacilityJson[];
}

export interface NetworkJson {
  defaults: { tank_limits_pct: { warning: number; shutdown: number } };
  systems: SystemJson[];
}

export interface OpsJson {
  prices: { oil_per_bbl: number; gas_per_mcf: number };
  expected_repair_hours: { pump_failure: number };
  emergency_trucking: { truck_capacity_bbl: number; cost_per_trip: number };
  systems: Record<string, {
    emergency_fleet_size: number;
    facilities: Record<string, { response_min: number; cycle_min: number }>;
  }>;
}

export type Category = "pump_failure" | "pump_degradation" | "pipeline_leak";

// One detected problem. Optional fields depend on the category, as in prototypes/detect.py.
export interface DetectedEvent {
  category: Category;
  system_id: string;
  facility_id: string;
  asset_id: string;
  onset_unix: number;
  end_unix: number | null;
  status: "resolved" | "ongoing";
  evidence: string[];
  // pump_failure
  level_onset_pct?: number;
  hours_to_limit_at_onset?: number | null;
  trips_at_unix_pred?: number | null;
  level_pct?: number;              // smoothed level at "now", ongoing failures only
  // countdown at "now" (ongoing pump_failure); null for leaks and degradation
  hours_to_limit?: number | null;
  // slow events (degradation, leak)
  onset_bounds?: [number, number];
  detected_unix?: number;
  end_bounds?: [number, number];
}
