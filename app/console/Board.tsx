"use client";

import { useState } from "react";
import { hhmm, money, type Alert, type ConsoleView, type SensorIssue } from "@/lib/eog/alerts";
import { evidenceFor, evidenceForIssue, type Evidence } from "@/lib/evidence";
import { Badge, SensorBadge, SimulatedBadge } from "@/app/ui/Badge";
import { useAvonConsole } from "@/lib/live";

// The alerts view. Renders whatever ConsoleView it is given; where the view comes from
// (Spacetime subscription) is the page's job.

export type Conn = "connecting" | "connected" | "disconnected";

function countdown(h: number | null): string {
  if (h === null) return "";
  if (h <= 0) return "at shutdown now";
  const m = Math.round(h * 60);
  return `trips in ${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function pretty(id: string): string {
  return id.replace(/^(S\d+)_/, "$1 · ").replace(/_/g, " ");
}

function stamp(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(5, 16).replace("T", " ");
}

// A person carries this from the console to the Darkroom box; nothing is sent over the network.
function SendToDarkroom({ ev, dataset, now }: { ev: Evidence | null; dataset: string; now: number }) {
  const [open, setOpen] = useState(false);
  if (!ev) return null;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn mt-2">
        Open an incident in the Darkroom
      </button>
    );
  }
  return (
    <div className="card mt-2 p-3">
      <p className="section-title">Carry this to the Darkroom box</p>
      <p className="mt-1 text-sm">
        A sensor that disagrees with physics can mean someone is inside the network. Nothing is sent from here:
        a person types this reference on the Darkroom box, and the box logs who brought it and when.
      </p>
      <p className="mt-2 font-mono text-3xl font-bold tracking-wider">{ev.ref}</p>
      <p className="mt-1 break-all font-mono text-xs text-muted">Fingerprint (SHA-256): {ev.hash}</p>
      <p className="mt-1 text-sm text-muted">
        {ev.record.asset_id} {ev.record.metric} · {dataset} at {hhmm(now)} UTC{ev.record.simulated ? " · SIMULATED fault" : ""}
      </p>
    </div>
  );
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// The operator's decision on this card (PLAN.md section 0: the judge works the shift). The server
// keeps the plan as it read when confirmed, so a later fault shows against the judge's own choice.
function ConfirmRow({ a }: { a: Alert }) {
  const { confirmations, confirm, status } = useAvonConsole();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fix = a.fix!;
  const done = confirmations[a.id];
  const bad = a.tank_sensor && ["dead", "drifting", "lying"].includes(a.tank_sensor.state) ? a.tank_sensor : null;
  const changed = done && (done.headline !== fix.headline || Math.round(done.cost) !== Math.round(fix.plan.cost));
  async function go() {
    setBusy(true);
    setError(null);
    try { await confirm(a.id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  if (!done) {
    return (
      <div className="mt-3">
        <button className="btn btn-primary" onClick={go} disabled={busy || status !== "connected"}>
          Confirm this plan
        </button>
        {error && <p className="mt-1 text-sm text-alert">{error}</p>}
      </div>
    );
  }
  if (!bad && !changed) {
    return (
      <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="ok" icon="✓">CONFIRMED</Badge> by the night shift at {clock(done.atMs)}
      </p>
    );
  }
  return (
    <div className="mt-3 rounded-md border-2 border-warn-line bg-warn-bg p-3 text-sm">
      <p className="flex flex-wrap items-center gap-2 font-bold">
        <Badge tone="warn" icon="●">CONFIRMED, THEN CHANGED</Badge>
      </p>
      <p className="mt-1">
        You confirmed <b>{done.headline}</b> ({money(done.cost)}) at {clock(done.atMs)}.
        {bad && <> It rests on a tank sensor that is now <b>{bad.state.toUpperCase()}</b>{bad.simulated ? " (simulated)" : ""}. Check the sensor before the truck rolls.</>}
        {changed && <> The plan now reads <b>{fix.headline}</b> ({money(fix.plan.cost)}).</>}
      </p>
      {changed && (
        <button className="btn mt-2" onClick={go} disabled={busy || status !== "connected"}>Confirm the new plan</button>
      )}
      {error && <p className="mt-1 text-alert">{error}</p>}
    </div>
  );
}

function FixCardView({ a, top, dataset, now }: { a: Alert; top: boolean; dataset: string; now: number }) {
  const fix = a.fix!;
  const big = top ? "text-3xl" : "text-xl";
  return (
    <section className={`rounded-lg p-4 ${top ? "border-2 border-alert-line bg-alert-bg" : "border border-alert-line/50 bg-surface"}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm font-semibold uppercase tracking-wide">
        <span>{pretty(a.facility.id)} · pump failed</span>
        {a.hours_to_limit !== null && (
          <span className="tabular-nums text-alert"><span aria-hidden="true">▲ </span>{countdown(a.hours_to_limit)}</span>
        )}
      </header>
      {a.tank_sensor && ["dead", "drifting", "lying"].includes(a.tank_sensor.state) && (
        <div className="mt-3 rounded-md border-2 border-warn-line bg-warn-bg p-3 text-sm">
          <p className="flex flex-wrap items-center gap-2 font-bold">
            CHECK THE TANK SENSOR FIRST: <SensorBadge state={a.tank_sensor.state} />
            {a.tank_sensor.simulated && <SimulatedBadge />}
          </p>
          <p className="mt-1">{a.tank_sensor.evidence} This plan uses its reading.</p>
          <SendToDarkroom ev={evidenceFor(a, dataset, now)} dataset={dataset} now={now} />
        </div>
      )}
      <div className="mt-3 flex items-baseline justify-between gap-4">
        <p className={`${big} font-bold leading-tight`}><span className="text-muted">Do this:</span> {fix.headline}</p>
        <p className={`${big} font-bold tabular-nums`}>{money(fix.plan.cost)}</p>
      </div>
      {fix.alternatives.length > 0 && <ConfirmRow a={a} />}
      <p className="mt-1 text-sm tabular-nums">
        {[...fix.details,
          fix.trip_at_unix !== null ? `tank would trip ${hhmm(fix.trip_at_unix)}` : null,
          `repair done ${hhmm(fix.repair_done_unix)}`,
          a.event.level_pct !== undefined ? `level now ${a.event.level_pct.toFixed(1)}%` : null,
        ].filter(Boolean).join(" · ")}
      </p>
      {fix.shares_fleet_with.length > 0 && (
        <p className="text-sm text-muted">
          Shares {a.event.system_id}&apos;s {fix.fleet} trucks with {fix.shares_fleet_with.map(pretty).join(", ")}.
        </p>
      )}
      {fix.alternatives.length > 0 && (
        <div className="mt-3">
          <p className="section-title">Why not the others</p>
          <table className="mt-1 w-full text-sm tabular-nums">
            <tbody>
              {fix.alternatives.map((alt) => (
                <tr key={alt.label} className="border-t border-line-soft">
                  <td className="py-1 pr-3">{alt.label}</td>
                  <td className="py-1 pr-3 text-right">{money(alt.cost)}</td>
                  <td className="py-1 text-muted">{alt.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-sm text-muted">Times come from noisy readings: same decision, start times within about 3 min.</p>
    </section>
  );
}

const METRIC_WORD: Record<string, string> = {
  level_pct: "level", flow_bpd: "flow", discharge_psi: "discharge pressure", status: "status",
  pressure_psi: "pressure", receive_flow_bpd: "receive flow", inflow_bpd: "inflow", water_bpd: "water rate",
};

function SensorsToCheck({ sensors, dataset, now }: { sensors: SensorIssue[]; dataset: string; now: number }) {
  if (sensors.length === 0) return null;
  return (
    <section className="mt-4">
      <h2 className="section-title">Sensors to check</h2>
      <ul className="mt-2 flex flex-col gap-2">
        {sensors.map((x) => (
          <li key={x.key} className="rounded-lg border-2 border-warn-line bg-warn-bg p-3">
            <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
              <SensorBadge state={x.state} />
              <span>{pretty(x.asset_id)} {METRIC_WORD[x.metric] ?? x.metric.replace(/_/g, " ")}</span>
              {x.simulated && <SimulatedBadge />}
            </p>
            <p className="mt-1">{x.evidence}</p>
            {x.state === "dead" && <p className="text-sm">Send someone with a replacement sensor; until then, plans use its last reading.</p>}
            {x.state === "lying" && <p className="text-sm">Check the sensor on site first. A reading that disagrees with physics can also mean someone changed it.</p>}
            <SendToDarkroom ev={evidenceForIssue(x, dataset, now)} dataset={dataset} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function InspectionRow({ a }: { a: Alert }) {
  const what = a.event.category === "pipeline_leak" ? "Possible leak" : "Pump wearing out";
  return (
    <li className="rounded-lg border border-warn-line/60 bg-surface p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="font-semibold"><span aria-hidden="true">● </span>{what} · {pretty(a.event.asset_id)}</span>
        <span className="text-sm tabular-nums text-muted">first seen about {hhmm(a.event.onset_unix)}</span>
      </div>
      <p className="text-sm">{a.action}</p>
      {a.pump_off_since !== undefined && (
        <p className="text-sm">
          Can&apos;t confirm it&apos;s fixed: the pump has been off since {hhmm(a.pump_off_since)}, and this only shows while it runs.
        </p>
      )}
      <p className="text-sm text-muted">{a.event.evidence.join("; ")}</p>
    </li>
  );
}

// The header's ConnBadge shows every state; this banner only explains a lost connection.
export function ConnBanner({ conn }: { conn: Conn }) {
  if (conn !== "disconnected") return null;
  return (
    <p role="alert" className="mt-4 rounded-lg border-2 border-alert-line bg-alert-bg p-3 font-semibold text-alert">
      ▲ DISCONNECTED from the live data. Showing the last data received.
    </p>
  );
}

export function Board({ view, dataset }: { view: ConsoleView; dataset: string }) {
  const failures = view.alerts.filter((a) => a.fix);
  const inspections = view.alerts.filter((a) => !a.fix);
  return (
    <>
      <SensorsToCheck sensors={view.sensors ?? []} dataset={dataset} now={view.now} />
      {failures.length > 0 && (
        <p className="mt-6 tabular-nums">
          {failures.length} pump failure{failures.length > 1 ? "s" : ""} · doing nothing costs {money(view.totals.do_nothing)} ·
          these plans cost <b>{money(view.totals.plans)}</b>
        </p>
      )}
      <div className="mt-3 flex flex-col gap-4">
        {failures.map((a, i) => <FixCardView key={a.id} a={a} top={i === 0} dataset={dataset} now={view.now} />)}
      </div>
      {failures.length === 0 && (
        <p className="card mt-6"><span aria-hidden="true">✓ </span>No pump failures right now. Every tank is draining normally.</p>
      )}

      {inspections.length > 0 && (
        <section className="mt-6">
          <h2 className="section-title">Needs a field inspection</h2>
          <ul className="mt-2 flex flex-col gap-2">{inspections.map((a) => <InspectionRow key={a.id} a={a} />)}</ul>
        </section>
      )}

      <details className="mt-8 text-sm">
        <summary className="cursor-pointer text-muted">All {view.events.length} problems found in this data</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead className="text-left text-sm text-muted">
            <tr><th className="py-1">Problem</th><th>Asset</th><th>Start</th><th>End</th><th>Status</th></tr>
          </thead>
          <tbody>
            {view.events.map((e) => (
              <tr key={e.asset_id + e.onset_unix + e.category} className="border-t border-line-soft">
                <td className="py-1">{e.category.replace(/_/g, " ")}</td>
                <td>{e.asset_id}</td>
                <td>{stamp(e.onset_unix)}</td>
                <td>{e.end_unix ? stamp(e.end_unix) : "—"}</td>
                <td>{e.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
