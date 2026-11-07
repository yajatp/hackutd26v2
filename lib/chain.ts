// Append-only, hash-chained incident log.
//
// Status is never stored: every screen rebuilds state by replaying this log.
// The chain alone catches an edited entry. It cannot catch an attacker with
// root who recomputes every hash after editing, or who deletes the newest
// entries. Witnesses (each device remembers the newest {seq, head} it saw)
// catch both, which is the answer to "the attacker owns the box".

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface LogEvent {
  seq: number;
  prev_hash: string;
  incident_id: string;
  ts: string;
  actor: string;
  type: string;
  payload: Json;
  hash: string;
}

export type UnhashedEvent = Omit<LogEvent, "hash">;
export type NewEvent = Pick<LogEvent, "incident_id" | "ts" | "actor" | "type" | "payload">;

export const GENESIS_PREV = "0".repeat(64);

// Deterministic encoding: sorted object keys, no whitespace. Two devices that
// build the same event in a different field order must get the same hash.
export function canonical(value: Json): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical: non-finite number");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map(k => {
    const v = value[k];
    if (v === undefined) throw new Error(`canonical: undefined at key ${k}`);
    return `${JSON.stringify(k)}:${canonical(v)}`;
  }).join(",")}}`;
}

export function hashEvent(e: UnhashedEvent): string {
  const body: Json = {
    seq: e.seq,
    prev_hash: e.prev_hash,
    incident_id: e.incident_id,
    ts: e.ts,
    actor: e.actor,
    type: e.type,
    payload: e.payload,
  };
  return bytesToHex(sha256(utf8ToBytes(canonical(body))));
}

export function appendEvent(log: readonly LogEvent[], e: NewEvent): LogEvent {
  const last = log[log.length - 1];
  const unhashed: UnhashedEvent = { ...e, seq: log.length, prev_hash: last ? last.hash : GENESIS_PREV };
  return { ...unhashed, hash: hashEvent(unhashed) };
}

export type ChainResult =
  | { ok: true; count: number; head: string }
  | { ok: false; breakAt: number; reason: "seq" | "link" | "hash" };

export function verifyChain(log: readonly LogEvent[]): ChainResult {
  let prev = GENESIS_PREV;
  for (let i = 0; i < log.length; i++) {
    const e = log[i];
    if (e.seq !== i) return { ok: false, breakAt: i, reason: "seq" };
    if (e.prev_hash !== prev) return { ok: false, breakAt: i, reason: "link" };
    const { hash, ...rest } = e;
    if (hashEvent(rest) !== hash) return { ok: false, breakAt: i, reason: "hash" };
    prev = hash;
  }
  return { ok: true, count: log.length, head: prev };
}

// What a device remembers: the genesis it enrolled against and the newest entry it saw.
export interface Witness {
  genesis: string;
  seq: number;
  head: string;
}

export type WitnessResult =
  | { ok: true }
  | { ok: false; kind: "genesis" | "rollback" | "rewritten"; at: number };

export function checkWitness(log: readonly LogEvent[], w: Witness): WitnessResult {
  if (log.length === 0 || log[0].hash !== w.genesis) return { ok: false, kind: "genesis", at: 0 };
  if (log.length - 1 < w.seq) return { ok: false, kind: "rollback", at: log.length };
  if (log[w.seq].hash !== w.head) return { ok: false, kind: "rewritten", at: w.seq };
  return { ok: true };
}

export function witnessOf(log: readonly LogEvent[]): Witness {
  if (log.length === 0) throw new Error("witnessOf: empty log");
  const last = log[log.length - 1];
  return { genesis: log[0].hash, seq: last.seq, head: last.hash };
}
