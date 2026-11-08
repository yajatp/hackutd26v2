"use client";

import { useRef, useState, type ReactNode } from "react";
import { hhmm, money, type Alert, type ConsoleView, type SensorIssue } from "@/lib/eog/alerts";
import { evidenceFor, evidenceForIssue, type Evidence } from "@/lib/evidence";
import { Badge, SensorBadge, SimulatedBadge } from "@/app/ui/Badge";
import { LineReveal } from "@/app/ui/LineReveal";
import { useAvonConsole } from "@/lib/live";
import { LockdownButton } from "./lockdown/LockdownButton";
import { Arm, Collapse, Tick, useBornLive, useBringIntoView } from "./motion";
import { freshConfirm } from "./tween";

// The alerts view. Renders whatever ConsoleView it is given; where the view comes from
// (Spacetime subscription) is the page's job.

export type Conn = "connecting" | "connected" | "disconnected";

// The night look of /vr (docs/DESIGN.md), as Tailwind utilities on the tokens that
// app/console/layout.tsx gives night values. A state is a rule on the left in its color over a
// faint tint, never a box. The decision is the page's one bold moment: Barlow Condensed 700
// (.decide in console.module.css, a global name so this file imports no CSS).
const WARN = "border-l-[3px] border-warn-line bg-warn-bg py-3 pr-3 pl-4";
const ALERT = "border-l-[3px] border-alert-line bg-alert-bg py-3 pr-3 pl-4";
const DECIDE = "decide";

function countdown(h: number | null): string {
  if (h === null) return "";
  if (h <= 0) return "at shutdown now";
  const m = Math.round(h * 60);
  return `trips in ${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

// Asset IDs inside planner sentences, as a person reads them: "S5_WELL_C2" -> "S5 well C2" (QA bug 12).
export function readableIds(text: string): string {
  return text.replace(/\b(S\d+)_WELL_([A-Z0-9]+)\b/g, "$1 well $2").replace(/\b(S\d+)_(TANK|PUMP|FACILITY)_([A-Z0-9]+)\b/g, (_m, sys: string, kind: string, id: string) => `${sys} ${kind.toLowerCase()} ${id}`);
}

function pretty(id: string): string {
  return id.replace(/^(S\d+)_/, "$1 · ").replace(/_/g, " ");
}

// "Truck arrives 17:10" as a label and a value: the words before the first clock time, then the
// rest. A detail with no time in it stays a sentence (null).
export function splitDetail(d: string): { k: string; v: string } | null {
  const m = d.match(/^(.+?) (\d{1,2}:\d{2}\b.*)$/);
  return m ? { k: m[1], v: m[2] } : null;
}

// The facts under the decision, as one row of label-over-value pairs (the pattern /insight uses).
function factsFor(a: Alert): { pairs: { k: string; v: string }[]; notes: string[] } {
  const fix = a.fix!;
  const pairs: { k: string; v: string }[] = [];
  const notes: string[] = [];
  for (const d of fix.details) {
    const kv = splitDetail(d);
    if (kv) pairs.push(kv); else notes.push(d);
  }
  if (fix.trip_at_unix !== null) pairs.push({ k: "Tank would trip", v: hhmm(fix.trip_at_unix) });
  pairs.push({ k: "Repair done", v: hhmm(fix.repair_done_unix) });
  if (a.event.level_pct !== undefined) pairs.push({ k: "Level now", v: `${a.event.level_pct.toFixed(1)}%` });
  return { pairs, notes };
}

// A facility in the same system, named without the system again ("FACILITY B", not "S5 · FACILITY B").
function sameSystem(id: string, system: string): string {
  return id.startsWith(`${system}_`) ? id.slice(system.length + 1).replace(/_/g, " ") : pretty(id);
}

function stamp(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(5, 16).replace("T", " ");
}

// A block that is news (motion.tsx): its space opens (.mo-open, grid row 0fr to 1fr) so the page
// below slides down instead of jumping, while the block itself slides in (.mo-in). Only the one
// hero of a change (CONFIRMED, THEN CHANGED) also pulses its amber rule once (.mo-hero), and with
// `bring` it is scrolled into view once it has opened, if it ended up below the fold.
// Already on screen at first paint: the same elements, no motion.
// The margin lives on the outer element and the block's own classes on the inner one; the middle
// one has no padding, so the opening space can start from zero height.
function Reveal({ space, className, motion = "mo-in", delay = 0, bring = false, children }: {
  space: string; className: string; motion?: string; delay?: number; bring?: boolean; children: ReactNode;
}) {
  const live = useBornLive();
  const box = useRef<HTMLDivElement>(null);
  useBringIntoView(box, live && bring, delay + 380);
  const wait = live && delay ? { animationDelay: `${delay}ms` } : undefined;
  return (
    <div ref={box} className={`${space} ${live ? "mo-open" : ""} ${bring ? "scroll-mb-8" : ""}`} style={wait}>
      <div style={wait}>
        <div className={`${className} ${live ? motion : ""}`} style={wait}>{children}</div>
      </div>
    </div>
  );
}

// A person carries this from the console to the Darkroom box; nothing is sent over the network.
function SendToDarkroom({ ev, dataset, now }: { ev: Evidence | null; dataset: string; now: number }) {
  const [open, setOpen] = useState(false);
  if (!ev) return null;
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn mo-press mt-3">
        Open an incident in the Darkroom
      </button>
    );
  }
  return <DarkroomRef ev={ev} dataset={dataset} now={now} />;
}

// The reference types itself in once (.mo-typed: a stepped mask and a caret over the full text,
// which is in the DOM from the first frame), then the fingerprint fades in under it.
function DarkroomRef({ ev, dataset, now }: { ev: Evidence; dataset: string; now: number }) {
  const live = useBornLive();
  return (
    <Reveal space="mt-3" className={WARN}>
      <p className="section-title">Carry this to the Darkroom box</p>
      <p className="mt-1 text-sm">
        A sensor that disagrees with physics can mean someone is inside the network. Nothing is sent from here:
        a person types this reference on the Darkroom box, and the box logs who brought it and when.
      </p>
      <p className={`mt-2 font-mono text-3xl font-bold tracking-[0.05em] ${live ? "mo-typed" : ""}`}><span>{ev.ref}</span></p>
      <p className={`mt-1 break-all font-mono text-xs text-muted ${live ? "mo-late" : ""}`}>Fingerprint (SHA-256): {ev.hash}</p>
      <p className={`mt-1 text-sm text-muted ${live ? "mo-late" : ""}`}>
        {ev.record.asset_id} {ev.record.metric} in {dataset} at {hhmm(now)} UTC{ev.record.simulated ? ", a SIMULATED fault" : ""}.
      </p>
    </Reveal>
  );
}

// The tank sensor a card's plan rests on, when the console no longer trusts it.
function badSensor(a: Alert): Alert["tank_sensor"] | null {
  return a.tank_sensor && ["dead", "drifting", "lying"].includes(a.tank_sensor.state) ? a.tank_sensor : null;
}

// The plan as confirmed no longer matches the plan as it reads now.
function planChanged(a: Alert, done: { headline: string; cost: number }): boolean {
  return done.headline !== a.fix!.headline || Math.round(done.cost) !== Math.round(a.fix!.plan.cost);
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// The operator's decision on this card (PLAN.md section 0: the judge works the shift). The server
// keeps the plan as it read when confirmed, so a later fault shows against the judge's own choice.
// On the top card, CONFIRMED, THEN CHANGED is the console's one hero moment: it opens a beat after
// the other warnings, pulses its rule once and is brought into view (Reveal `bring`).
function ConfirmRow({ a, top }: { a: Alert; top: boolean }) {
  const { confirmations, confirm, status } = useAvonConsole();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pressedAt = useRef<number | null>(null);    // when this screen last pressed a confirm
  const fix = a.fix!;
  const done = confirmations[a.id];
  const bad = badSensor(a);
  const changed = done && planChanged(a, done);
  async function go() {
    pressedAt.current = Date.now();
    setBusy(true);
    setError(null);
    try { await confirm(a.id); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }
  if (!done) {
    return (
      <div className="mt-5">
        {/* Compresses on press and stays pressed while the confirm is on its way (.mo-press). */}
        <button className="btn btn-primary mo-press" onClick={go} disabled={busy || status !== "connected"} data-busy={busy || undefined}>
          Confirm this plan
        </button>
        {error && <p className="mt-1 text-sm text-alert">{error}</p>}
      </div>
    );
  }
  if (!bad && !changed) return <ConfirmedLine atMs={done.atMs} pressedAt={pressedAt.current} />;
  return (
    <Reveal space="mt-5" className={`${WARN} text-sm`} motion="mo-hero" delay={200} bring={top}>
      <p className="flex flex-wrap items-center gap-2 font-bold">
        <Badge tone="warn" icon="●">CONFIRMED, THEN CHANGED</Badge>
      </p>
      <p className="mt-1">
        You confirmed <b>{done.headline}</b> ({money(done.cost)}) at {clock(done.atMs)}.
        {bad && <> It rests on a tank sensor that is now <b>{bad.state.toUpperCase()}</b>{bad.simulated ? " (simulated)" : ""}. Check the sensor before the truck rolls.</>}
        {changed && <> The plan now reads <b>{fix.headline}</b> ({money(fix.plan.cost)}).</>}
      </p>
      {bad && <LockdownButton alert={a} />}
      {changed && (
        <button className="btn mo-press mt-2" onClick={go} disabled={busy || status !== "connected"} data-busy={busy || undefined}>Confirm the new plan</button>
      )}
      {error && <p className="mt-1 text-alert">{error}</p>}
    </Reveal>
  );
}

// "✓ CONFIRMED by the night shift at …": when the confirmation was just made, the line fades in
// and the check mark draws itself (an SVG stroke over the ✓, which stays in the DOM as the text
// the e2e reads). An old confirmation that comes back (its warning cleared) just shows.
function ConfirmedLine({ atMs, pressedAt }: { atMs: number; pressedAt: number | null }) {
  const live = useBornLive();
  const [news] = useState(() => live && freshConfirm(Date.now(), atMs, pressedAt));
  return (
    <p className={`mt-5 flex flex-wrap items-center gap-2 text-sm ${news ? "mo-fade" : ""}`}>
      <Badge tone="ok">
        <span aria-hidden="true" className="mo-check" data-draw={news ? "" : undefined}>
          ✓{news && <svg viewBox="0 0 16 16" focusable="false"><path d="M2.5 8.8l3.4 3.4L13.5 4.4" /></svg>}
        </span>
        CONFIRMED
      </Badge> by the night shift at {clock(atMs)}
    </p>
  );
}

// The confirm row's space closes instead of jumping when its warning goes (Collapse); the band
// shows only when what left was the amber CONFIRMED, THEN CHANGED block.
function ConfirmCollapse({ a, top }: { a: Alert; top: boolean }) {
  const done = useAvonConsole().confirmations[a.id];
  const warned = !!done && (!!badSensor(a) || planChanged(a, done));
  return <Collapse band={warned}><ConfirmRow a={a} top={top} /></Collapse>;
}

function FixCardView({ a, top, dataset, now }: { a: Alert; top: boolean; dataset: string; now: number }) {
  const fix = a.fix!;
  const live = useBornLive();
  const big = top ? "text-[2.5rem] sm:text-[3.5rem]" : "text-[1.75rem] sm:text-[2.25rem]";
  const facts = factsFor(a);
  return (
    <section className={`border-alert-line pl-5 sm:pl-7 ${top ? "border-l-[3px]" : "border-l"}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[0.9375rem]">
        <span className="font-semibold text-foreground">{pretty(a.facility.id)} · pump failed</span>
        {a.hours_to_limit !== null && (
          <span className="font-semibold tabular-nums text-[#f87171]"><span aria-hidden="true">▲ </span>{countdown(a.hours_to_limit)}</span>
        )}
      </header>
      <Collapse>
        {a.tank_sensor && badSensor(a) && (
          <Reveal space="mt-4" className={`${WARN} text-sm`}>
            <p className="flex flex-wrap items-center gap-2 font-bold">
              CHECK THE TANK SENSOR FIRST: <SensorBadge state={a.tank_sensor.state} />
              {a.tank_sensor.simulated && <SimulatedBadge />}
            </p>
            <p className="mt-1">{a.tank_sensor.evidence} This plan uses its reading.</p>
            <SendToDarkroom ev={evidenceFor(a, dataset, now)} dataset={dataset} now={now} />
          </Reveal>
        )}
      </Collapse>
      <div className="mt-4 flex items-end justify-between gap-4 sm:gap-6">
        {/* A changed plan, or a card that is news, rises line by line from behind a mask (LineReveal); the words are in the DOM at once. */}
        <p className={`${big} ${DECIDE} min-w-0`}><span className="decide-label mb-2 block text-sm text-muted">Do this:</span> <LineReveal text={fix.headline} onMount={live} /></p>
        <p className={`${big} ${DECIDE} shrink-0 text-right tabular-nums`}><Tick value={fix.plan.cost} format={money} align="right" /></p>
      </div>
      {fix.alternatives.length > 0 && <ConfirmCollapse a={a} top={top} />}
      <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3 tabular-nums">
        {facts.pairs.map((p, i) => (
          <div key={`${i}-${p.k}`}>
            <dt className="text-xs text-muted">{p.k}</dt>
            <dd className="text-[0.9375rem]">{p.v}</dd>
          </div>
        ))}
      </dl>
      {facts.notes.map((n) => <p key={n} className="mt-2 text-sm text-muted">{n}.</p>)}
      {fix.shares_fleet_with.length > 0 && (
        <p className="mt-2 text-sm text-muted">
          Shares {a.event.system_id}&apos;s {fix.fleet} trucks with {fix.shares_fleet_with.map((id) => sameSystem(id, a.event.system_id)).join(", ")}.
        </p>
      )}
      {fix.alternatives.length > 0 && (
        <div className="mt-6">
          <p className="section-title">Why not the others</p>
          {/* Fixed columns, so the prices line up from card to card. */}
          <table className="mt-2 w-full table-fixed border-b border-line-soft text-sm tabular-nums">
            <colgroup><col /><col className="w-[76px] sm:w-[88px]" /><col className="w-[124px] sm:w-[200px]" /></colgroup>
            <tbody>
              {fix.alternatives.map((alt) => (
                <tr key={alt.label} className="border-t border-line-soft">
                  <td className="py-1.5 pr-3">{readableIds(alt.label)}</td>
                  <td className="py-1.5 pr-4 text-right">{money(alt.cost)}</td>
                  <td className="py-1.5 text-muted">{readableIds(alt.why)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[0.8125rem] text-muted">Times come from noisy readings: same decision, start times within about 3 min.</p>
    </section>
  );
}

const METRIC_WORD: Record<string, string> = {
  level_pct: "level", flow_bpd: "flow", discharge_psi: "discharge pressure", status: "status",
  pressure_psi: "pressure", receive_flow_bpd: "receive flow", inflow_bpd: "inflow", water_bpd: "water rate",
};

function SensorsToCheck({ sensors, dataset, now }: { sensors: SensorIssue[]; dataset: string; now: number }) {
  if (sensors.length === 0) return null;
  return <SensorsSection sensors={sensors} dataset={dataset} now={now} />;
}

// When it appears, the block comes down into place as one (.mo-open, .mo-down) and stays quiet:
// the amber pulse is kept for the one hero, CONFIRMED, THEN CHANGED on the top card.
function SensorsSection({ sensors, dataset, now }: { sensors: SensorIssue[]; dataset: string; now: number }) {
  const live = useBornLive();
  return (
    <section className={`mt-10 ${live ? "mo-open" : ""}`}>
      <div className={live ? "mo-down" : undefined}>
        <h2 className="section-title">Sensors to check</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {sensors.map((x) => <SensorLine key={x.key} x={x} dataset={dataset} now={now} />)}
        </ul>
      </div>
    </section>
  );
}

function SensorLine({ x, dataset, now }: { x: SensorIssue; dataset: string; now: number }) {
  return (
    <li className={WARN}>
      <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
        <SensorBadge state={x.state} />
        <span>{pretty(x.asset_id)} {METRIC_WORD[x.metric] ?? x.metric.replace(/_/g, " ")}</span>
        {x.simulated && <SimulatedBadge />}
      </p>
      <p className="mt-1">{x.evidence}</p>
      {x.state === "dead" && <p className="text-sm">Send someone with a replacement sensor; until then, plans use its last reading.</p>}
      {x.state === "lying" && <p className="text-sm">Check the sensor on site first. A reading that disagrees with physics can also mean someone changed it.</p>}
      <SendToDarkroom ev={evidenceForIssue(x, dataset, now)} dataset={dataset} now={now} />
      <LockdownButton issue={x} />
    </li>
  );
}

function InspectionRow({ a }: { a: Alert }) {
  const what = a.event.category === "pipeline_leak" ? "Possible leak" : "Pump wearing out";
  return (
    <li className={WARN}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="font-semibold"><span aria-hidden="true" className="text-warn-line">● </span>{what} · {pretty(a.event.asset_id)}</span>
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
    <p role="alert" className={`mt-4 ${ALERT} font-semibold text-alert`}>
      ▲ DISCONNECTED from the live data. Showing the last data received.
    </p>
  );
}

export function Board({ view, dataset }: { view: ConsoleView; dataset: string }) {
  const failures = view.alerts.filter((a) => a.fix);
  const inspections = view.alerts.filter((a) => !a.fix);
  // <Arm>: what is on the board when it first renders stays still; what arrives later moves.
  return (
    <Arm>
      <Collapse>
        <SensorsToCheck sensors={view.sensors ?? []} dataset={dataset} now={view.now} />
      </Collapse>
      {failures.length > 0 && (
        <p className="mt-10 text-xl leading-snug tabular-nums text-muted">
          {failures.length} pump failure{failures.length > 1 ? "s" : ""}. Doing nothing costs <Tick value={view.totals.do_nothing} format={money} />;
          {" "}{failures.length > 1 ? "these plans cost" : "this plan costs"} <b className="font-semibold text-foreground"><Tick value={view.totals.plans} format={money} /></b>.
        </p>
      )}
      <div className="mt-10 flex flex-col gap-14">
        {failures.map((a, i) => <FixCardView key={a.id} a={a} top={i === 0} dataset={dataset} now={view.now} />)}
      </div>
      {failures.length === 0 && (
        <p className="card mt-10"><span aria-hidden="true">✓ </span>No pump failures right now. Every tank is draining normally.</p>
      )}

      {inspections.length > 0 && (
        <section className="mt-14">
          <h2 className="section-title">Needs a field inspection</h2>
          <ul className="mt-3 flex flex-col gap-3">{inspections.map((a) => <InspectionRow key={a.id} a={a} />)}</ul>
        </section>
      )}

      <details className="mt-14 border-t border-line-soft pt-4 text-sm text-muted">
        <summary className="cursor-pointer">All {view.events.length} problems found in this data</summary>
        <table className="mt-3 w-full tabular-nums [overflow-wrap:anywhere]">
          <thead className="text-left text-sm">
            <tr><th className="py-1.5 pr-3 font-semibold">Problem</th><th className="pr-3 font-semibold">Asset</th><th className="pr-3 font-semibold">Start</th><th className="pr-3 font-semibold">End</th><th className="font-semibold">Status</th></tr>
          </thead>
          <tbody>
            {view.events.map((e) => (
              <tr key={e.asset_id + e.onset_unix + e.category} className="border-t border-line-soft">
                <td className="py-1.5 pr-3">{e.category.replace(/_/g, " ")}</td>
                <td className="pr-3">{e.asset_id}</td>
                <td className="pr-3">{stamp(e.onset_unix)}</td>
                <td className="pr-3">{e.end_unix ? stamp(e.end_unix) : "—"}</td>
                <td>{e.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </Arm>
  );
}
