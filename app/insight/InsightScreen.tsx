"use client";
// /insight: the night at a glance for the people paying for it. Four parts, every number from a
// public table the avon module writes inside its reducers (spacetimedb/src/index.ts):
//   budget       plans against doing nothing, trucks against each system's fleet
//   flow_series  rate in vs rate out per tank, last 24 h
//   breach_risk  what a spoofed level sensor would hide on each tank, in dollars
//   scenario     what_if ripples: one event, every consequence in time order
// Night design (docs/DESIGN.md): red and amber only for state, hairline lists, one bold moment
// (the saving, drawn as the share of the do-nothing cost the plans avoid).
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useAvonConsole, useAvonRtt, type ScenarioRun, type SiteFacility } from "@/lib/live";
import type { BreachRisk } from "@/lib/eog/breach";
import type { SystemBudget } from "@/lib/eog/budget";
import type { ConsoleView } from "@/lib/eog/alerts";
import type { FlowSeries } from "@/lib/eog/flows";
import { WHAT_IF_KINDS, type WhatIfKind } from "@/lib/eog/whatif";
import { ConnBadge, connState } from "@/app/ui/Badge";
import { Grain } from "@/app/ui/Grain";
import { LineReveal } from "@/app/ui/LineReveal";
import { LiveClock } from "@/app/ui/LiveClock";
import { ScreenHeader } from "@/app/ui/ScreenHeader";
import FlowChart from "./FlowChart";
import RippleChart from "./RippleChart";
import { assetFor, BRANCH_TAG, clock, failureSpans, inMin, KIND_LABEL, money, orderFlows, plain, pretty, sharedMax, signedMoney, siteFor, systemsText, tplus } from "./format";

type Look = "list" | "wall";

// ?site= (which database) and ?look= (layout) from the URL, without a hydration mismatch.
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  window.addEventListener("popstate", fn);
  return () => { listeners.delete(fn); window.removeEventListener("popstate", fn); };
};
const search = () => window.location.search;
function setParam(k: string, v: string | null) {
  const u = new URL(window.location.href);
  if (v === null) u.searchParams.delete(k); else u.searchParams.set(k, v);
  window.history.replaceState(null, "", u);
  listeners.forEach((f) => f());
}

const sum = (xs: number[]) => xs.reduce((u, x) => u + x, 0);
const DEFAULT_SHUTDOWN_PCT = 92;     // network.json defaults; the module's ripples carry the site's own

export default function InsightScreen() {
  const avon = useAvonConsole();
  const rtt = useAvonRtt();
  const { status, view, source, insight, facilities } = avon;
  const qs = useSyncExternalStore(subscribe, search, () => "");
  const params = new URLSearchParams(qs);
  const siteKey = params.get("site");
  const look: Look = params.get("look") === "wall" ? "wall" : "list";
  const keep = siteKey ? `?site=${encodeURIComponent(siteKey)}` : "";
  const site = siteFor(siteKey, source?.datasetId);
  const shutdown = insight.scenarios.find((s) => s.ripple.projection)?.ripple.projection?.shutdown_pct ?? DEFAULT_SHUTDOWN_PCT;
  const whatIfRef = useRef<HTMLElement | null>(null);
  const [request, setRequest] = useState<{ kind: WhatIfKind; facilityId: string; n: number } | null>(null);

  const runRipple = (kind: WhatIfKind, facilityId: string) => {
    setRequest((r) => ({ kind, facilityId, n: (r?.n ?? 0) + 1 }));
    whatIfRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  const empty = status === "connected" && view && insight.flows.length === 0;
  return (
    <main className="in-root" data-look={look}>
      <Grain />
      {/* The one Avon header; its tabs carry ?site= along, as the two links they replace did. */}
      <ScreenHeader as="p" current="insight" title="Insight" search={keep}
        clock={<LiveClock dataUnix={view?.now ?? null} />} status={<ConnBadge state={connState(status)} ms={rtt} />} />
      <div className="in-head">
        <div className="in-title">
          <h1>Tonight, in dollars</h1>
        </div>
        <p className="in-lede">
          {view
            ? <><strong title={source ? `Dataset ${source.datasetId}` : undefined}>{site ? `${site.name}, ${site.basin}` : "This site"}</strong>, at {clock(view.now)}. What tonight&apos;s pump failures cost, what the plans save, and what a faked sensor could hide.</>
            : "What tonight's pump failures cost, what the plans save, and what a faked sensor could hide."}
        </p>
        {status === "disconnected" ? <p className="in-note in-down">SpacetimeDB is not answering; showing the last numbers.</p> : null}
        <div className="in-bar">
          <div className="in-switch" role="group" aria-label="Layout">
            <button type="button" aria-pressed={look === "list"} onClick={() => setParam("look", null)}>One column</button>
            <button type="button" aria-pressed={look === "wall"} onClick={() => setParam("look", "wall")}>Wall</button>
          </div>
        </div>
        {status === "connected" && !view ? <p className="in-note" role="status">No site is loaded. Load one on the console, then this page fills in.</p> : null}
        {empty ? <p className="in-note" role="status">This database was published before the insight tables existed. Publish the avon module and reload the site.</p> : null}
      </div>

      <div className="in-layout">
        <div className="in-col-a">
          <Budget budget={insight.budget} view={view} />
          <Breaches breaches={insight.breaches} now={view?.now ?? 0} onRipple={(f) => runRipple("sensor_spoof", f)} onCompute={avon.computeBreaches} ready={!!view} />
          <section className="in-section" ref={whatIfRef} aria-labelledby="in-whatif-h">
            <WhatIf facilities={facilities} view={view} scenarios={insight.scenarios} datasetId={source?.datasetId ?? ""} run={avon.whatIf} request={request} />
          </section>
        </div>
        <div className="in-col-b">
          <Flows flows={insight.flows} view={view} shutdown={shutdown} />
        </div>
      </div>

      <footer className="in-foot">
        <p>
          Every number here is computed inside the <code>avon</code> SpacetimeDB module and read live from its public tables:
          {" "}<code>finish_ingest</code> writes <code>budget</code>, <code>flow_series</code> and <code>breach_risk</code> when a site loads;
          {" "}<code>what_if</code> writes one <code>scenario</code> row per run. The EOG engine runs inside those reducers.
        </p>
      </footer>
    </main>
  );
}

// ---------- budget ----------

function Budget({ budget, view }: { budget: SystemBudget[]; view: ConsoleView | null }) {
  const plans = view?.totals.plans ?? sum(budget.map((b) => b.plans));
  const nothing = view?.totals.do_nothing ?? sum(budget.map((b) => b.do_nothing));
  const saved = Math.max(0, nothing - plans);
  const risk = sum(budget.map((b) => b.at_risk_per_hour));
  // Systems keep their trucks to themselves, so spare capacity is per system: the busiest first.
  const busy = budget
    .filter((b) => b.failures > 0 || b.trucks_used > 0)
    .sort((a, b) => (a.fleet - a.trucks_used) - (b.fleet - b.trucks_used) || b.failures - a.failures || a.system_id.localeCompare(b.system_id));
  const quiet = budget.filter((b) => !busy.includes(b));
  const quietFree = sum(quiet.map((b) => b.fleet - b.trucks_used));
  const failing = busy.filter((b) => b.failures > 0);
  const failingTanks = sum(failing.map((b) => b.failures));
  const who = failing.length
    ? `the ${failingTanks === 1 ? "failing tank" : `${failingTanks} failing tanks`} in ${systemsText(failing.map((b) => b.system_id))} trip${failingTanks === 1 ? "s" : ""}`
    : "the failing tanks trip";
  const planPct = nothing > 0 ? Math.min(100, (plans / nothing) * 100) : 0;
  return (
    <section className="in-section in-budget" aria-labelledby="in-budget-h">
      <h2 id="in-budget-h">The night&apos;s budget</h2>
      {/* The saving rises from behind a mask, the number's line then the words' (LineReveal), when it changes. */}
      <p className="in-hero">
        <span className="in-num"><LineReveal text={money(saved)} /></span> <LineReveal text="saved by the plans" cue={money(saved)} delay={60} />
      </p>
      {nothing > 0 ? (
        <figure className="in-saving" role="img" aria-label={`The plans cost ${money(plans)}. If nobody acts the night costs ${money(nothing)}. Saved ${money(saved)}.`}>
          <div className="in-saving-labels" aria-hidden="true">
            <span className="in-saving-l" style={planPct >= 30 ? { right: `${100 - planPct}%`, textAlign: "right" } : { left: 0 }}>
              <span className="in-saving-k">Plans</span> <span className="in-saving-v">{money(plans)}</span>
            </span>
            <span className="in-saving-r">
              <span className="in-saving-k">Saved</span> <span className="in-saving-v">{money(saved)}</span>
            </span>
          </div>
          <div className="in-saving-track" aria-hidden="true">
            <span className="in-saving-plan" style={{ width: `${planPct}%` }} />
            <span className="in-saving-saved" style={{ left: `${planPct}%` }} />
          </div>
          <div className="in-saving-span" aria-hidden="true" />
          <figcaption className="in-saving-cap">
            <span className="in-saving-v">{money(nothing)}</span> if nobody acts: {who} and the wells stay shut in until the repair.
          </figcaption>
        </figure>
      ) : (
        <p className="in-note">No pump failures tonight, so nothing to plan.</p>
      )}
      <dl className="in-facts">
        <div>
          <dt>Spare trucks</dt>
          <dd className="in-spare">
            {busy.map((b) => {
              const spare = b.fleet - b.trucks_used;
              return <span key={b.system_id} className={spare <= 0 ? "in-amber-t" : undefined}><strong>{b.system_id}</strong> {spare} of {b.fleet} spare</span>;
            })}
            {quiet.length ? <span className="in-dim">{systemsText(quiet.map((b) => b.system_id))}: {quietFree} free</span> : null}
          </dd>
        </div>
        <div><dt>Production at risk</dt><dd><span className="in-num-s">{money(risk)}</span>/h if the failing tanks trip</dd></div>
      </dl>
      {budget.length ? (
        <table className="in-table in-budget-table">
          <caption className="sr-only">Budget by system</caption>
          <thead>
            <tr><th scope="col">System</th><th scope="col">Trucks called</th><th scope="col" className="in-r">Plans</th><th scope="col" className="in-r in-wide">If nobody acts</th><th scope="col" className="in-r">At risk</th></tr>
          </thead>
          <tbody>
            {busy.map((b) => (
              <tr key={b.system_id} data-busy={b.failures > 0 || undefined}>
                <th scope="row">{b.system_id}<span className="in-sub-inline"> {b.failures} of {b.facilities} tanks failing</span></th>
                <td>
                  <span className="in-pips" aria-label={`${b.trucks_used} of ${b.fleet} trucks called`}>
                    {Array.from({ length: b.fleet }, (_, i) => <span key={i} className={i < b.trucks_used ? "in-pip in-pip-on" : "in-pip"} />)}
                  </span>
                  <span className={b.trucks_used >= b.fleet ? "in-amber-t" : undefined}> {b.trucks_used} of {b.fleet}</span>
                </td>
                <td className="in-r">{money(b.plans)}</td>
                <td className="in-r in-wide">{money(b.do_nothing)}</td>
                <td className="in-r">{b.at_risk_per_hour ? `${money(b.at_risk_per_hour)}/h` : ""}</td>
              </tr>
            ))}
            {quiet.length ? (
              <tr className="in-quietrow">
                <th scope="row" colSpan={5}>{systemsText(quiet.map((b) => b.system_id))}: no failures, {quietFree} trucks free</th>
              </tr>
            ) : null}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

// ---------- rate in vs rate out ----------

function Flows({ flows, view, shutdown }: { flows: FlowSeries[]; view: ConsoleView | null; shutdown: number }) {
  const ordered = useMemo(() => orderFlows(flows, view), [flows, view]);
  const max = useMemo(() => sharedMax(flows), [flows]);
  const stateOf = (fid: string): { word: string; tone: "red" | "amber" } | null => {
    const a = view?.alerts.find((x) => x.facility.id === fid);
    if (a?.event.category === "pump_failure") return { word: a.hours_to_limit === 0 ? "Tripped" : "Pump failed", tone: "red" };
    if (a) return { word: a.event.category === "pipeline_leak" ? "Leak" : "Pump worn", tone: "amber" };
    const s = view?.sensors.find((x) => x.facility_id === fid);
    if (s) return { word: `Sensor ${s.state}`, tone: "amber" };
    return null;
  };
  return (
    <section className="in-section in-flows" aria-labelledby="in-flows-h">
      <h2 id="in-flows-h">Rate in vs rate out</h2>
      <p className="in-note">Water into each tank against what its pump sends down the line, in barrels per day: hourly means over the last 24 h, one scale for every tank. Where in beats out the tank fills; <span className="in-key in-key-down" /> red marks hours the pump had failed. The strip under each chart is the tank level against the {shutdown}% trip.</p>
      <p className="in-note">Margin of error: the worst hour&apos;s gap between the level change the sensor reported and the change physics expects from in minus out.</p>
      <p className="in-legend" aria-hidden="true">
        <span><span className="in-key in-key-in" />in</span> <span><span className="in-key in-key-out" />out</span> <span><span className="in-key in-key-fill" />filling</span> <span><span className="in-key in-key-down" />filling, pump failed</span> <span><span className="in-key in-key-level" />level</span>
      </p>
      {ordered.length === 0 ? <p className="in-empty">No flows yet.</p> : (
        <div className="in-multiples">
          {ordered.map((f) => (
            <FlowChart key={f.facility_id} series={f} max={max} spans={failureSpans(view, f.facility_id)} shutdownPct={shutdown} title={pretty(f.facility_id)} state={stateOf(f.facility_id)} />
          ))}
        </div>
      )}
      {ordered.length ? (
        <details className="in-details">
          <summary>Show the last hour as numbers</summary>
          <table className="in-table">
            <thead><tr><th scope="col">Facility</th><th scope="col" className="in-r">In, bpd</th><th scope="col" className="in-r">Out, bpd</th><th scope="col" className="in-r">Level</th><th scope="col" className="in-r">Physics</th><th scope="col" className="in-r">Sensor</th></tr></thead>
            <tbody>
              {ordered.map((f) => { const p = f.points[f.points.length - 1]; return (
                <tr key={f.facility_id}><th scope="row">{pretty(f.facility_id)}</th><td className="in-r">{Math.round(p.inflow_bpd).toLocaleString("en-US")}</td><td className="in-r">{Math.round(p.outflow_bpd).toLocaleString("en-US")}</td><td className="in-r">{p.level_pct.toFixed(1)}%</td><td className="in-r">{p.physics_pts >= 0 ? "+" : ""}{p.physics_pts.toFixed(1)} pts</td><td className="in-r">{p.reported_pts >= 0 ? "+" : ""}{p.reported_pts.toFixed(1)} pts</td></tr>
              ); })}
            </tbody>
          </table>
        </details>
      ) : null}
    </section>
  );
}

// ---------- potential breaches ----------

// When the console's sensor check catches the fake, and whether that is after the real trip.
function caught(b: BreachRisk, now: number): { text: string; late: boolean } {
  const f = b.flags[b.flags.length - 1];
  const tripMin = b.real_trip_unix !== null ? (b.real_trip_unix - now) / 60 : null;
  if (!f) return { text: tripMin !== null ? "never" : "not flagged", late: tripMin !== null };
  if (f.after_min <= 0) return { text: "already", late: false };
  const late = tripMin !== null && f.after_min >= tripMin;
  return { text: `${Math.round(f.after_min)} min${late ? ", after the trip" : ""}`, late };
}

function Breaches({ breaches, now, onRipple, onCompute, ready }: { breaches: BreachRisk[]; now: number; onRipple(facilityId: string): void; onCompute(): Promise<void>; ready: boolean }) {
  const [all, setAll] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const top = breaches[0]?.exposure ?? 0;
  const shown = all ? breaches : breaches.slice(0, 5);
  return (
    <section className="in-section" aria-labelledby="in-breach-h">
      <h2 id="in-breach-h">Potential breaches</h2>
      <p className="in-lead2">We fake each tank&apos;s level sensor and replan. Ranked by what trusting the fake would cost.</p>
      <p className="in-note">On a running pump the fake hides a stop with no fault code: the console sees nothing until its physics check flags the sensor. On a failed pump it moves the countdown and the plan. Amber marks a tank that would trip before the check catches the fake. Select a tank to see its ripple.</p>
      {breaches.length === 0 ? (
        <p className="in-empty">
          No breach rows yet.{" "}
          {ready ? <button type="button" className="in-link" onClick={() => onCompute().catch((e) => setErr(String(e?.message ?? e)))}>Work them out now</button> : null}
          {err ? <span role="alert"> {err}</span> : null}
        </p>
      ) : (
        <table className="in-table in-btable">
          <caption className="sr-only">Tanks ranked by the cost of trusting a faked level sensor</caption>
          <thead>
            <tr>
              <th scope="col" className="in-c-rank">#</th>
              <th scope="col">Tank</th>
              <th scope="col" className="in-c-cost">Cost of trusting the fake</th>
              <th scope="col" className="in-c-trip">Real trip</th>
              <th scope="col" className="in-c-wells">Wells shut in</th>
              <th scope="col" className="in-c-caught">Caught after</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((b, i) => {
              const c = caught(b, now);
              const tripMin = b.real_trip_unix !== null ? (b.real_trip_unix - now) / 60 : null;
              return (
                <tr key={b.tank_id} className="in-brow" onClick={() => onRipple(b.facility_id)}>
                  <td className="in-c-rank in-dim">{i + 1}</td>
                  <th scope="row">
                    <button type="button" className="in-rowbtn" onClick={(e) => { e.stopPropagation(); onRipple(b.facility_id); }} aria-label={`${pretty(b.facility_id)} tank: run the ripple`}>
                      {pretty(b.facility_id)}
                    </button>
                    <span className={b.mode === "failed" ? "in-sub in-red-t" : "in-sub in-dim"}>{b.mode === "failed" ? "pump failed" : "pump running"}</span>
                  </th>
                  <td className="in-c-cost" title={`Trusting it: ${money(b.believed_cost)}. Acting on the truth: ${money(b.honest_cost)}.`}>
                    <span className="in-bcost">
                      <span className="in-bcost-v">{money(b.exposure)}</span>
                      <span className="in-track" aria-hidden="true"><span className="in-track-bar" style={{ width: `${top > 0 ? (b.exposure / top) * 100 : 0}%` }} /></span>
                    </span>
                  </td>
                  <td className="in-c-trip">{tripMin !== null ? <>{clock(b.real_trip_unix!)} <span className="in-dim">{inMin(tripMin)}</span></> : <span className="in-dim">none tonight</span>}</td>
                  <td className="in-c-wells">{b.wells.length ? <>{b.wells.length} wells<span className="in-sub in-dim">{money(b.lost_per_hour)}/h lost</span></> : <span className="in-dim">none</span>}</td>
                  <td className={c.late ? "in-c-caught in-amber-t" : c.text === "already" ? "in-c-caught in-dim" : "in-c-caught"}>{c.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {breaches.length > 5 ? (
        <button type="button" className="in-link in-more" onClick={() => setAll((v) => !v)}>{all ? "Show the top 5" : `Show all ${breaches.length} tanks`}</button>
      ) : null}
    </section>
  );
}

// ---------- what if ----------

interface WhatIfProps {
  facilities: SiteFacility[];
  view: ConsoleView | null;
  scenarios: ScenarioRun[];
  datasetId: string;
  run(kind: WhatIfKind, assetId: string): Promise<void>;
  request: { kind: WhatIfKind; facilityId: string; n: number } | null;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function WhatIf({ facilities, view, scenarios, datasetId, run, request }: WhatIfProps) {
  const ordered = useMemo(() => [...facilities].sort((a, b) => a.facility_id.localeCompare(b.facility_id)), [facilities]);
  const failing = new Set(view?.alerts.filter((a) => a.fix).map((a) => a.facility.id) ?? []);
  const firstCalm = ordered.find((f) => !failing.has(f.facility_id))?.facility_id ?? ordered[0]?.facility_id ?? "";
  // null: the control follows the run on the card, until the viewer changes it.
  const [kind, setKind] = useState<WhatIfKind | null>(null);
  const [fid, setFid] = useState<string | null>(null);
  const [pending, setPending] = useState<{ kind: WhatIfKind; asset: string; after: bigint } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const mine = scenarios.filter((s) => s.datasetId === datasetId);
  const maxId = scenarios.reduce((m, s) => (BigInt(s.id) > m ? BigInt(s.id) : m), BigInt(0));

  const go = (k: WhatIfKind, f: string) => {
    const fac = facilities.find((x) => x.facility_id === f);
    if (!fac) return;
    const asset = assetFor(k, fac);
    setKind(k);
    setFid(f);
    setErr(null);
    setPicked(null);
    setPending({ kind: k, asset, after: maxId });
    run(k, asset).catch((e) => { setErr(String(e?.message ?? e)); setPending(null); });
  };
  // A press on a breach row: take its facility and event, then run once per press.
  const goRef = useRef(go);
  useEffect(() => { goRef.current = go; });
  useEffect(() => {
    if (request) goRef.current(request.kind, request.facilityId);
  }, [request]);

  const match = pending ? mine.find((s) => s.mine && s.kind === pending.kind && s.assetId === pending.asset && BigInt(s.id) > pending.after) : undefined;
  const shown = match
    ?? (picked ? mine.find((s) => s.id === picked) : undefined)
    ?? (pending ? undefined : mine.find((s) => s.mine) ?? mine[0]);
  const waiting = pending !== null && !match;
  const formKind: WhatIfKind = kind ?? shown?.ripple.kind ?? "pump_fail";
  const formFid = fid ?? shown?.ripple.facility_id ?? firstCalm;
  const stale = !!shown && !waiting && (shown.ripple.kind !== formKind || shown.ripple.facility_id !== formFid);

  return (
    <>
      <h2 id="in-whatif-h">What if</h2>
      <p className="in-note">Pick a facility and an event. The engine replans the whole system around it and lists every consequence in time order.</p>
      <form className="in-form" onSubmit={(e) => { e.preventDefault(); go(formKind, formFid); }}>
        <label className="in-field">
          <span>Facility</span>
          <select value={formFid} onChange={(e) => setFid(e.target.value)} disabled={!ordered.length}>
            {[...new Set(ordered.map((f) => f.system_id))].map((sys) => (
              <optgroup key={sys} label={sys}>
                {ordered.filter((f) => f.system_id === sys).map((f) => (
                  <option key={f.facility_id} value={f.facility_id}>{pretty(f.facility_id)}{failing.has(f.facility_id) ? " (pump failed)" : ""}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <fieldset className="in-field in-kinds">
          <legend>Event</legend>
          {WHAT_IF_KINDS.map((k) => (
            <label key={k} className="in-kind">
              <input type="radio" name="in-kind" value={k} checked={formKind === k} onChange={() => setKind(k)} />
              <span>{KIND_LABEL[k]}</span>
            </label>
          ))}
        </fieldset>
        <button type="submit" className="in-btn in-btn-go" disabled={!formFid || waiting}>{waiting ? "Working it out" : "Run the ripple"}</button>
      </form>
      {err ? <p className="in-err" role="alert">{err}</p> : null}
      {stale && shown ? (
        <p className="in-stale" role="status">
          Below is the last run: {pretty(shown.ripple.facility_id)}, {lowerFirst(KIND_LABEL[shown.ripple.kind])}. Press Run the ripple for {pretty(formFid)}, {lowerFirst(KIND_LABEL[formKind])}.
        </p>
      ) : null}
      {shown
        ? <div className={stale ? "in-ripple-wrap in-is-stale" : "in-ripple-wrap"}><RippleView run={shown} /></div>
        : waiting
          ? <p className="in-empty" role="status">The avon module is working out the ripple.</p>
          : <p className="in-empty">No run yet on this site.</p>}
      {mine.length > 1 ? (
        <div className="in-history">
          <h3>Earlier runs</h3>
          <ul>
            {mine.slice(0, 8).map((s) => (
              <li key={s.id}>
                <button type="button" className="in-link" aria-current={shown?.id === s.id || undefined}
                  onClick={() => { setPicked(s.id); setPending(null); setKind(s.ripple.kind); setFid(s.ripple.facility_id); }}>
                  {plain(s.title)}
                </button>
                <span className="in-dim"> {signedMoney(s.costDelta)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}

function RippleView({ run }: { run: ScenarioRun }) {
  const r = run.ripple;
  const sensor = r.kind === "sensor_spoof" || r.kind === "sensor_dead";
  const when = new Date(run.atMs).toLocaleString("en-US", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" });
  return (
    <article className="in-ripple" aria-live="polite">
      <h3 title={`what_if run ${run.id}, ${when}, one row in the scenario table`}>{plain(r.title)}</h3>
      <p className="in-ripple-sum">{plain(r.summary)}</p>
      <dl className="in-facts in-ripple-facts">
        {sensor ? (
          <>
            <div><dt>At stake</dt><dd><span className="in-num-s">{money(r.exposure ?? 0)}</span></dd></div>
            <div><dt>Trusting the sensor</dt><dd>{money(r.believed_cost ?? 0)}</dd></div>
            <div><dt>Acting on the truth</dt><dd>{money(r.honest_cost ?? 0)}</dd></div>
          </>
        ) : (
          <>
            <div><dt>Trips if nobody acts</dt><dd><span className="in-num-s">{r.trip_unix !== null ? clock(r.trip_unix) : "never"}</span>{r.trip_unix !== null ? ` ${tplus((r.trip_unix - r.now) / 60)}` : ""}</dd></div>
            <div><dt>The plan</dt><dd>{r.plan ? money(r.plan.cost) : "none"}</dd></div>
            <div><dt>Night</dt><dd>{money(r.night_before)} to {money(r.night_after)} <span className="in-dim">({signedMoney(r.cost_delta)})</span></dd></div>
          </>
        )}
        <div><dt>{r.system_id} trucks</dt><dd>{r.trucks_after} of {r.fleet}{r.trucks_after !== r.trucks_before ? <span className="in-dim"> (was {r.trucks_before})</span> : null}</dd></div>
      </dl>
      {r.projection ? <RippleChart p={r.projection} now={r.now} /> : null}
      {r.changes.length ? (
        <div className="in-changes">
          <h4>Plans that change because they share the {r.system_id} trucks</h4>
          <ul>
            {r.changes.map((c) => (
              <li key={c.facility_id}>
                <strong>{pretty(c.facility_id)}</strong>: {plain(c.before.headline)} ({money(c.before.cost)}) <span className="in-dim">becomes</span> {plain(c.after.headline)} ({money(c.after.cost)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <ol className="in-timeline">
        {r.steps.map((s, i) => (
          <li key={i} className={`in-step in-step-${s.tone}`} data-branch={s.branch}>
            <span className="in-step-t">{tplus(s.t_min)}</span>
            <span className="in-step-clock">{clock(s.at_unix)}</span>
            <span className="in-step-tag"><span className={`in-tag in-tag-${s.branch}`}>{BRANCH_TAG[s.branch] ?? s.branch}</span></span>
            <span className="in-step-dot" aria-hidden="true" />
            <span className="in-step-text">
              {s.facility_id !== r.facility_id && !s.text.startsWith(pretty(s.facility_id)) ? <strong>{pretty(s.facility_id)}. </strong> : null}
              {plain(s.text)}
            </span>
          </li>
        ))}
      </ol>
      {r.notes.length ? <p className="in-note">{r.notes.map(plain).join(" ")}</p> : null}
    </article>
  );
}
