// The evidence a person carries from the Avon console to the Darkroom box. Nothing crosses the
// network: the console shows a short reference and the full fingerprint, a person types the
// reference into the box, and the box logs it with who collected it and when. Anyone can later
// rebuild the record from the same data folder and check the fingerprint matches.
// Pure TypeScript (no Node or DOM APIs).
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { canonical, type Json } from "./chain.ts";
import type { Alert } from "./eog/alerts.ts";

export interface EvidenceRecord {
  kind: "sensor_disagrees_with_physics" | "sensor_silent" | "sensor_drifting";
  source: string;               // where it was collected, e.g. "Avon console"
  dataset: string;              // folder name the readings came from
  data_ts: number;              // data time ("now" of the folder)
  facility_id: string;
  asset_id: string;             // the sensor's asset
  metric: string;
  state: string;                // dead | drifting | lying
  evidence: string;             // the sentence the console showed
  simulated: boolean;           // injected for the demo
}

export interface Evidence { record: EvidenceRecord; hash: string; ref: string }

const KIND: Record<string, EvidenceRecord["kind"]> = {
  lying: "sensor_disagrees_with_physics", dead: "sensor_silent", drifting: "sensor_drifting",
};

// A short code to read aloud and type: AV- plus the first 8 hex characters of the fingerprint.
export function refOf(hash: string): string {
  return `AV-${hash.slice(0, 4).toUpperCase()}-${hash.slice(4, 8).toUpperCase()}`;
}

export function hashRecord(r: EvidenceRecord): string {
  return bytesToHex(sha256(utf8ToBytes(canonical(r as unknown as Json))));
}

// Evidence for a fix card whose tank sensor is in trouble; null when the sensor is fine.
export function evidenceFor(a: Alert, dataset: string, data_ts: number, source = "Avon console"): Evidence | null {
  const s = a.tank_sensor;
  if (!s || !KIND[s.state]) return null;
  const record: EvidenceRecord = {
    kind: KIND[s.state], source, dataset, data_ts,
    facility_id: a.facility.id, asset_id: a.facility.tank.id, metric: "level_pct",
    state: s.state, evidence: s.evidence, simulated: s.simulated,
  };
  const hash = hashRecord(record);
  return { record, hash, ref: refOf(hash) };
}

// What the box checks when a person types a reference: it must match the fingerprint's start.
export function refMatches(ref: string, hash: string): boolean {
  return ref.trim().toUpperCase().replace(/\s/g, "") === refOf(hash);
}
