// One status line for the whole log, the same on every screen and in verify.mjs.
//
// verifyChain alone passes a log whose newest entries were deleted, so the
// witness check always runs too. The witness is what this device saw last.

import { checkWitness, verifyChain, witnessOf, type LogEvent, type Witness } from "../../chain.ts";

export type ChainStatus =
  | { kind: "empty"; text: "NO ENTRIES YET" }
  | { kind: "verified"; text: "LOG VERIFIED"; count: number; head: string }
  | { kind: "rollback"; text: string; at: number }
  | { kind: "tampering"; text: string; at: number };

function sorted(log: readonly LogEvent[]): LogEvent[] {
  return [...log].sort((a, b) => a.seq - b.seq);
}

function rollback(at: number): ChainStatus {
  return { kind: "rollback", text: `ROLLBACK DETECTED AT #${at}`, at };
}

function tampering(at: number): ChainStatus {
  return { kind: "tampering", text: `TAMPERING AT #${at}`, at };
}

export function chainStatus(log: readonly LogEvent[], witness: Witness | null): ChainStatus {
  const s = sorted(log);
  if (s.length === 0) return witness ? rollback(0) : { kind: "empty", text: "NO ENTRIES YET" };
  const v = verifyChain(s);
  if (!v.ok) return tampering(v.breakAt);
  if (witness) {
    const w = checkWitness(s, witness);
    if (!w.ok) return w.kind === "rollback" ? rollback(w.at) : tampering(w.at);
  }
  return { kind: "verified", text: "LOG VERIFIED", count: v.count, head: v.head };
}

// The witness to keep after seeing this log. It only moves forward, and only
// while the log verifies against the witness already held.
export function advanceWitness(log: readonly LogEvent[], witness: Witness | null): Witness | null {
  const st = chainStatus(log, witness);
  if (st.kind !== "verified") return witness;
  const next = witnessOf(sorted(log));
  if (!witness || next.seq > witness.seq) return next;
  return witness;
}

export function parseWitness(x: unknown): Witness | null {
  if (typeof x !== "object" || x === null) return null;
  const o = x as Record<string, unknown>;
  if (typeof o.genesis !== "string" || typeof o.head !== "string") return null;
  if (typeof o.seq !== "number" || !Number.isInteger(o.seq) || o.seq < 0) return null;
  return { genesis: o.genesis, seq: o.seq, head: o.head };
}
