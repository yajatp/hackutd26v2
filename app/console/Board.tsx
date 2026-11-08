// The alerts view. Renders whatever ConsoleView it is given; where the view comes from
// (Spacetime subscription) is the page's job.
import { hhmm, money, type Alert, type ConsoleView } from "@/lib/eog/alerts";

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

function FixCardView({ a, top }: { a: Alert; top: boolean }) {
  const fix = a.fix!;
  const big = top ? "text-2xl" : "text-xl";
  return (
    <section className={`rounded-lg border p-4 ${top ? "border-red-500 bg-red-500/5" : "border-red-500/40"}`}>
      <header className="flex items-baseline justify-between gap-4 text-sm font-semibold uppercase tracking-wide">
        <span>{pretty(a.facility.id)} · pump failed</span>
        <span className="tabular-nums text-red-600 dark:text-red-400">{countdown(a.hours_to_limit)}</span>
      </header>
      {a.tank_sensor && ["dead", "drifting", "lying"].includes(a.tank_sensor.state) && (
        <div className="mt-3 rounded border-2 border-amber-500 bg-amber-500/10 p-2 text-sm">
          <p className="font-bold">
            CHECK THE TANK SENSOR FIRST: {a.tank_sensor.state.toUpperCase()}
            {a.tank_sensor.simulated && (
              <span className="ml-2 rounded bg-current/10 px-1.5 py-0.5 text-xs font-semibold tracking-wide">SIMULATED</span>
            )}
          </p>
          <p>{a.tank_sensor.evidence} This plan uses its reading.</p>
        </div>
      )}
      <div className="mt-3 flex items-baseline justify-between gap-4">
        <p className={`${big} font-bold`}><span className="opacity-60">Do this:</span> {fix.headline}</p>
        <p className={`${big} font-bold tabular-nums`}>{money(fix.plan.cost)}</p>
      </div>
      <p className="mt-1 text-sm tabular-nums opacity-80">
        {[...fix.details,
          fix.trip_at_unix !== null ? `tank would trip ${hhmm(fix.trip_at_unix)}` : null,
          `repair done ${hhmm(fix.repair_done_unix)}`,
          a.event.level_pct !== undefined ? `level now ${a.event.level_pct.toFixed(1)}%` : null,
        ].filter(Boolean).join(" · ")}
      </p>
      {fix.shares_fleet_with.length > 0 && (
        <p className="text-sm opacity-80">
          Shares {a.event.system_id}&apos;s {fix.fleet} trucks with {fix.shares_fleet_with.map(pretty).join(", ")}.
        </p>
      )}
      {fix.alternatives.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-60">Why not the others</p>
          <table className="mt-1 w-full text-sm tabular-nums">
            <tbody>
              {fix.alternatives.map((alt) => (
                <tr key={alt.label} className="border-t border-current/10">
                  <td className="py-1 pr-3">{alt.label}</td>
                  <td className="py-1 pr-3 text-right">{money(alt.cost)}</td>
                  <td className="py-1 opacity-70">{alt.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs opacity-60">Times come from noisy readings: same decision, start times within about 3 min.</p>
    </section>
  );
}

function InspectionRow({ a }: { a: Alert }) {
  const what = a.event.category === "pipeline_leak" ? "Possible leak" : "Pump wearing out";
  return (
    <li className="rounded-lg border border-amber-500/50 p-3">
      <div className="flex items-baseline justify-between gap-4">
        <span className="font-semibold">{what} · {pretty(a.event.asset_id)}</span>
        <span className="text-xs tabular-nums opacity-60">first seen about {hhmm(a.event.onset_unix)}</span>
      </div>
      <p className="text-sm">{a.action}</p>
      {a.pump_off_since !== undefined && (
        <p className="text-sm">
          Can&apos;t confirm it&apos;s fixed: the pump has been off since {hhmm(a.pump_off_since)}, and this only shows while it runs.
        </p>
      )}
      <p className="text-xs opacity-60">{a.event.evidence.join("; ")}</p>
    </li>
  );
}

export function ConnBanner({ conn }: { conn: Conn }) {
  if (conn === "connected") return null;
  return conn === "disconnected"
    ? <p className="mt-4 rounded border border-red-500 bg-red-500/10 p-2 text-sm font-semibold text-red-600 dark:text-red-400">
        DISCONNECTED from Spacetime. Showing the last data received.
      </p>
    : <p className="mt-4 text-sm opacity-60">Connecting to Spacetime…</p>;
}

export function Board({ view }: { view: ConsoleView }) {
  const failures = view.alerts.filter((a) => a.fix);
  const inspections = view.alerts.filter((a) => !a.fix);
  return (
    <>
      {failures.length > 0 && (
        <p className="mt-6 text-sm tabular-nums">
          {failures.length} pump failure{failures.length > 1 ? "s" : ""} · doing nothing costs {money(view.totals.do_nothing)} ·
          these plans cost <b>{money(view.totals.plans)}</b>
        </p>
      )}
      <div className="mt-3 flex flex-col gap-4">
        {failures.map((a, i) => <FixCardView key={a.id} a={a} top={i === 0} />)}
      </div>
      {failures.length === 0 && (
        <p className="mt-6 rounded-lg border border-current/15 p-4">No pump failures right now. Every tank is draining normally.</p>
      )}

      {inspections.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wide opacity-60">Needs a field inspection</h2>
          <ul className="mt-2 flex flex-col gap-2">{inspections.map((a) => <InspectionRow key={a.id} a={a} />)}</ul>
        </section>
      )}

      <details className="mt-8 text-sm">
        <summary className="cursor-pointer opacity-70">All {view.events.length} problems found in this data</summary>
        <table className="mt-2 w-full tabular-nums">
          <thead className="text-left text-xs uppercase opacity-60">
            <tr><th className="py-1">Problem</th><th>Asset</th><th>Start</th><th>End</th><th>Status</th></tr>
          </thead>
          <tbody>
            {view.events.map((e) => (
              <tr key={e.asset_id + e.onset_unix + e.category} className="border-t border-current/10">
                <td className="py-1">{e.category.replace("_", " ")}</td>
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
