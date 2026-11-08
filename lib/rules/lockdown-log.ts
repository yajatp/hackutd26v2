// The console's live `SpacetimeDB.log` during LOCKDOWN (docs/LOCKDOWN.md, "The look"): one line per
// reducer whose rows land, worked out by comparing two snapshots of what the subscription holds.
// Pure TypeScript.

export interface LogSnapshot {
  faults: { asset_id: string; kind: string }[];
  confirmations: Record<string, { headline: string; cost: number; atMs: number }>;
  lockdown: { active: boolean; startedAtMs: number; endedAtMs: number | null; evidenceRef: string; tank: string } | null;
}

export interface LogLine {
  atMs: number | null;          // null when the row carries no wall-clock time (a fault seen at page open)
  reducer: string;              // enter_lockdown, end_lockdown, inject_fault, clear_fault, confirm_plan
  detail: string;
}

export const LOG_MAX = 40;

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// Lines for what changed from `prev` to `next`. `prev` null: the rows already there when the log opened.
export function logLines(prev: LogSnapshot | null, next: LogSnapshot, nowMs: number): LogLine[] {
  const out: LogLine[] = [];
  const before = new Map((prev?.faults ?? []).map((f) => [f.asset_id, f.kind]));
  const after = new Map(next.faults.map((f) => [f.asset_id, f.kind]));
  for (const [asset, kind] of after) {
    if (before.get(asset) !== kind) out.push({ atMs: prev ? nowMs : null, reducer: "inject_fault", detail: `${kind} ${asset}` });
  }
  for (const asset of before.keys()) {
    if (!after.has(asset)) out.push({ atMs: nowMs, reducer: "clear_fault", detail: asset });
  }
  const was = prev?.confirmations ?? {};
  for (const [id, c] of Object.entries(next.confirmations)) {
    if (!was[id] || was[id].atMs !== c.atMs) out.push({ atMs: c.atMs, reducer: "confirm_plan", detail: `${id} ${c.headline} ${money(c.cost)}` });
  }
  const p = prev?.lockdown ?? null;
  const n = next.lockdown;
  if (n?.active && (!p?.active || p.startedAtMs !== n.startedAtMs)) {
    out.push({ atMs: n.startedAtMs, reducer: "enter_lockdown", detail: `${n.evidenceRef} ${n.tank}` });
  }
  if (p?.active && n && !n.active) out.push({ atMs: n.endedAtMs ?? nowMs, reducer: "end_lockdown", detail: n.evidenceRef });
  return out.sort((a, b) => (a.atMs ?? 0) - (b.atMs ?? 0));
}

// Appends and keeps the newest LOG_MAX lines.
export function appendLog(log: LogLine[], lines: LogLine[]): LogLine[] {
  if (lines.length === 0) return log;
  const all = [...log, ...lines];
  return all.length > LOG_MAX ? all.slice(all.length - LOG_MAX) : all;
}

export function logTime(ms: number | null): string {
  if (ms === null) return "--:--:--.---";
  const d = new Date(ms);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
