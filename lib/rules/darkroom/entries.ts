// Payload rules for each entry type. The module runs these before it writes,
// so a bad payload never reaches the chain.

import type { Json } from "../../chain.ts";

export const SCOPE_STATES = ["ENCRYPTED", "EXFILTRATED", "ACCESSED", "SUSPECTED"] as const;
export type ScopeState = (typeof SCOPE_STATES)[number];
export const CERTAINTIES = ["SUSPECTED", "CONFIRMED"] as const;
export type Certainty = (typeof CERTAINTIES)[number];

export const LIMITS = { title: 120, system: 80, note: 200, text: 500, name: 40 } as const;

export type PayloadCheck = { ok: true; payload: { [key: string]: Json } } | { ok: false; reason: string };

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function text(o: Record<string, unknown>, key: string, max: number, required: boolean): string | { reason: string } {
  const v = o[key];
  if (v === undefined || v === null) return required ? { reason: `${key} is required` } : "";
  if (typeof v !== "string") return { reason: `${key} must be text` };
  const s = v.trim();
  if (required && s.length === 0) return { reason: `${key} is required` };
  if (s.length > max) return { reason: `${key} is longer than ${max} characters` };
  return s;
}

export function validatePayload(type: string, p: unknown): PayloadCheck {
  if (!isObject(p)) return { ok: false, reason: "payload must be an object" };
  if (type === "chat") {
    const t = text(p, "text", LIMITS.text, true);
    return typeof t === "string" ? { ok: true, payload: { text: t } } : { ok: false, reason: t.reason };
  }
  if (type === "incident_opened") {
    const t = text(p, "title", LIMITS.title, true);
    return typeof t === "string" ? { ok: true, payload: { title: t } } : { ok: false, reason: t.reason };
  }
  if (type === "scope_update") {
    const system = text(p, "system", LIMITS.system, true);
    if (typeof system !== "string") return { ok: false, reason: system.reason };
    const note = text(p, "note", LIMITS.note, false);
    if (typeof note !== "string") return { ok: false, reason: note.reason };
    const state = p.state;
    if (typeof state !== "string" || !(SCOPE_STATES as readonly string[]).includes(state)) {
      return { ok: false, reason: `state must be one of ${SCOPE_STATES.join(", ")}` };
    }
    const certainty = p.certainty;
    if (typeof certainty !== "string" || !(CERTAINTIES as readonly string[]).includes(certainty)) {
      return { ok: false, reason: `certainty must be SUSPECTED or CONFIRMED` };
    }
    return { ok: true, payload: { system, state, certainty, note } };
  }
  return { ok: false, reason: `unknown entry type ${type}` };
}

export function nextIncidentId(n: number): string {
  return `INC-${String(n).padStart(4, "0")}`;
}

export function validName(name: string): string | null {
  const s = name.trim();
  if (s.length === 0 || s.length > LIMITS.name || s.includes("|")) return null;
  return s;
}
