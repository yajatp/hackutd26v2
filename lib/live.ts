"use client";
// Live link to the Avon SpacetimeDB database. The EOG engine runs inside the module's
// finish_ingest reducer; this file only parses files, sends reading rows and rebuilds the
// ConsoleView from the public alert + console_meta rows. When the server is down the status
// says so and the last view stays on screen; there is no browser-only engine path.
// Every 5 s the link calls rtt_ping and times how long its own rtt_probe row takes to come back
// through the subscription (lib/rules/darkroom/rtt.ts); rttMs is the median of the last 5.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DbConnection, tables } from "./module_bindings/index.ts";
import type { Alert as AlertRow, ConsoleMeta, Facility, Fault, SensorIssue as SensorIssueRow } from "./module_bindings/types.ts";
import type { BreachRisk as BreachRow, Budget as BudgetRow, FlowSeries as FlowRow, Scenario as ScenarioRow } from "./module_bindings/types.ts";
import type { SystemBudget } from "./eog/budget.ts";
import type { FlowSeries } from "./eog/flows.ts";
import type { BreachRisk } from "./eog/breach.ts";
import type { Ripple, WhatIfKind } from "./eog/whatif.ts";
import type { Lockdown as LockdownRow } from "./module_bindings/types.ts";
import { loadDataset, type DatasetFiles } from "./eog/load.ts";
import type { Alert, ConsoleView, SensorIssue } from "./eog/alerts.ts";
import type { ActiveFault, AttackTarget, FaultKind } from "./attack.ts";
import type { DetectedEvent } from "./eog/types.ts";
import { datasetToRows, type WideRow } from "../spacetimedb/src/wide.ts";
import { DEFAULT_SITE_KEY } from "./sites.ts";
import { RTT_INTERVAL_MS, RttMeter } from "./rules/darkroom/rtt.ts";

// The hosted copy (Vercel, https) cannot open ws:// to a laptop, so it is built with
// NEXT_PUBLIC_AVON_URI (a wss:// SpacetimeDB, e.g. maincloud) and NEXT_PUBLIC_AVON_DB. The demo LAN
// sets neither and keeps the laptop's own SpacetimeDB.
export const AVON_DB = process.env.NEXT_PUBLIC_AVON_DB || "avon";
export const AVON_PORT = 3001;

export type AvonStatus = "connecting" | "connected" | "disconnected";

export interface AvonSource { datasetId: string; builtAtMs: number }

export interface AvonConsole {
  status: AvonStatus;
  view: ConsoleView | null;
  source: AvonSource | null;                      // which dataset the view was built from, and when
  load(files: DatasetFiles, datasetId: string): Promise<void>;
  // The loaded site's facilities with their map position (3D twin, maps).
  facilities: SiteFacility[];
  // Plans the operator confirmed, by alert id: the headline and cost as they read at that moment.
  confirmations: Record<string, Confirmed>;
  confirm(alertId: string): Promise<void>;
  // Phone 1 remote: the loaded site's tanks, the simulated faults on them, and the reducers.
  targets: AttackTarget[];
  faults: ActiveFault[];
  inject(kind: FaultKind, assetId: string): Promise<void>;
  clear(assetId?: string): Promise<void>;
  // /insight: the night's budget, rate in vs rate out, potential breaches and what-if runs, all
  // written by the module (budget, flow_series, breach_risk, scenario). Empty on a database
  // published before these tables existed.
  insight: Insight;
  whatIf(kind: WhatIfKind, assetId: string): Promise<void>;
  computeBreaches(): Promise<void>;
  // LOCKDOWN (docs/LOCKDOWN.md): the lockdown row (null before the first one, or on a database
  // without the table), and the two reducers.
  lockdown: LockdownState | null;
  enterLockdown(reason: string, evidenceRef: string, tank: string): Promise<void>;
  endLockdown(): Promise<void>;
}

export interface ScenarioRun {
  id: string;                                      // the row's u64 id
  atMs: number;
  datasetId: string;
  kind: WhatIfKind;
  assetId: string;
  facilityId: string;
  title: string;
  summary: string;
  costDelta: number;
  mine: boolean;                                   // asked by this screen
  ripple: Ripple;
}

export interface Insight {
  budget: SystemBudget[];                          // by system id
  flows: FlowSeries[];                             // by facility id
  breaches: BreachRisk[];                          // most dollars at stake first
  scenarios: ScenarioRun[];                        // newest first
}

export const EMPTY_INSIGHT: Insight = { budget: [], flows: [], breaches: [], scenarios: [] };

// The insight tables as plain engine shapes (lib/eog). Pure, for tests and the page.
export function insightFromRows(budget: readonly BudgetRow[], flows: readonly FlowRow[], breaches: readonly BreachRow[], scenarios: readonly ScenarioRow[], me = ""): Insight {
  return {
    budget: [...budget].sort((a, b) => a.systemId.localeCompare(b.systemId)).map((b) => ({
      system_id: b.systemId, facilities: b.facilities, fleet: b.fleet, trucks_used: b.trucksUsed, trips: b.trips,
      failures: b.failures, plans: b.plans, do_nothing: b.doNothing, truck_cost: b.truckCost, shut_in_cost: b.shutInCost,
      at_risk_per_hour: b.atRiskPerHour, revenue_per_hour: b.revenuePerHour,
    })),
    flows: [...flows].sort((a, b) => a.facilityId.localeCompare(b.facilityId)).map((f) => ({
      facility_id: f.facilityId, system_id: f.systemId, tank_id: f.tankId, capacity_bbl: f.capacityBbl, step_s: f.stepS,
      points: f.endTs.map((end_ts, i) => ({
        end_ts, inflow_bpd: f.inflowBpd[i], outflow_bpd: f.outflowBpd[i], level_pct: f.levelPct[i],
        physics_pts: f.physicsPts[i], reported_pts: f.reportedPts[i],
      })),
    })),
    breaches: [...breaches].sort((a, b) => a.rank - b.rank).map((b) => JSON.parse(b.detailJson) as BreachRisk),
    scenarios: [...scenarios].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)).map((r) => ({
      id: String(r.id), atMs: Number(r.at.microsSinceUnixEpoch) / 1000, datasetId: r.datasetId,
      kind: r.kind as WhatIfKind, assetId: r.assetId, facilityId: r.facilityId, title: r.title, summary: r.summary,
      costDelta: r.costDelta, mine: me !== "" && r.requestedBy.toHexString() === me, ripple: JSON.parse(r.resultJson) as Ripple,
    })),
  };
}


// The lockdown row as the screens read it. active false once ended (the row is kept).
export interface LockdownState {
  active: boolean;
  startedAtMs: number;
  startedBy: string;                               // identity, hex
  reason: string;
  evidenceRef: string;                             // AV-XXXX-XXXX
  tank: string;                                    // asset id of the suspect sensor
  endedAtMs: number | null;
}

export function lockdownFromRow(r: LockdownRow | undefined): LockdownState | null {
  if (!r) return null;
  return {
    active: r.active,
    startedAtMs: Number(r.startedAt.microsSinceUnixEpoch) / 1000,
    startedBy: r.startedBy.toHexString(),
    reason: r.reason,
    evidenceRef: r.evidenceRef,
    tank: r.tank,
    endedAtMs: r.endedAt ? Number(r.endedAt.microsSinceUnixEpoch) / 1000 : null,
  };
}

// Same host as the page, so phones on the LAN reach the laptop's Spacetime. Plain ws://, so
// the page must be served over http (as on the demo LAN). A hosted build points elsewhere (above).
export function avonUri(): string {
  return process.env.NEXT_PUBLIC_AVON_URI || `ws://${window.location.hostname}:${AVON_PORT}`;
}

// The ConsoleView that finish_ingest built, from the rows it wrote. Returns undefined while
// the alert rows and console_meta disagree (mid-update), so callers keep the previous view.
export function viewFromRows(alerts: readonly AlertRow[], meta: ConsoleMeta | undefined, issues: readonly SensorIssueRow[] = []): ConsoleView | null | undefined {
  if (!meta) return null;
  if (alerts.length !== meta.alertCount) return undefined;
  const sorted = [...alerts].sort((a, b) => a.rank - b.rank);
  return {
    now: meta.now,
    alerts: sorted.map((r) => JSON.parse(r.alertJson) as Alert),
    sensors: [...issues].sort((a, b) => a.rank - b.rank).map((r) => JSON.parse(r.issueJson) as SensorIssue),
    events: JSON.parse(meta.eventsJson) as DetectedEvent[],
    totals: { do_nothing: meta.doNothing, plans: meta.plans },
  };
}

// The one place a Spacetime bigint (Timestamp micros) becomes a number.
function sourceOf(meta: ConsoleMeta | undefined): AvonSource | null {
  return meta ? { datasetId: meta.datasetId, builtAtMs: Number(meta.builtAt.microsSinceUnixEpoch) / 1000 } : null;
}

export interface Confirmed { headline: string; cost: number; atMs: number }

export interface SiteFacility {
  facility_id: string; system_id: string; lat: number; lon: number;
  tank_id: string; pump_id: string; capacity_bbl: number; well_ids: string[];
}

export interface AvonLinkOptions {
  uri: string;
  database?: string;
  retryMs?: number;                                // wait between connection attempts while the server is down
  connectTimeoutMs?: number;                       // give up on an attempt that neither connects nor fails
  onStatus(status: AvonStatus): void;
  onView(view: ConsoleView | null, source: AvonSource | null): void;
  onAttack?(targets: AttackTarget[], faults: ActiveFault[]): void;
  onFacilities?(facilities: SiteFacility[]): void;
  onConfirmations?(c: Record<string, Confirmed>): void;
  onRtt?(ms: number | null): void;
  onInsight?(i: Insight): void;
  onLockdown?(l: LockdownState | null): void;
}

// "<SYS>_FACILITY_C" -> "<SYS> · Facility C tank"
function tankLabel(f: Facility): string {
  const rest = f.facilityId.startsWith(f.systemId + "_") ? f.facilityId.slice(f.systemId.length + 1) : f.facilityId;
  const nice = rest.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(\w)$/, (c) => c.toUpperCase());
  return `${f.systemId} · ${nice} tank`;
}

// Tanks whose pump has failed come first, in console order: their level is moving, so a fault
// there shows on the console at once (review finding 3). The rest follow by name.
export function attackFromRows(facilities: readonly Facility[], faults: readonly Fault[], alerts: readonly AlertRow[] = []): { targets: AttackTarget[]; faults: ActiveFault[] } {
  const rank = new Map<string, number>();
  for (const a of alerts) if (a.kind === "pump_failure" && !rank.has(a.facilityId)) rank.set(a.facilityId, a.rank);
  const order = (f: Facility) => rank.get(f.facilityId) ?? Number.MAX_SAFE_INTEGER;
  return {
    targets: [...facilities]
      .sort((a, b) => order(a) - order(b) || a.facilityId.localeCompare(b.facilityId))
      .map((f) => ({ asset_id: f.tankId, facility_id: f.facilityId, system_id: f.systemId, label: tankLabel(f) })),
    faults: [...faults]
      .sort((a, b) => a.assetId.localeCompare(b.assetId))
      .map((f) => ({ asset_id: f.assetId, kind: f.kind as FaultKind, since_ts: f.fromTs })),
  };
}

export interface AvonLink { connection(): DbConnection | null; close(): void }

// Keeps one subscribed connection alive. Any drop or failed attempt builds a fresh connection
// after retryMs (same identity token). We do not use the SDK's automatic reconnect: in a test
// on 2.14.1 its retry hung after the server restarted, while a fresh connection worked at once.
export function connectAvon(opts: AvonLinkOptions): AvonLink {
  const { uri, database = AVON_DB, retryMs = 2000, connectTimeoutMs = 8000 } = opts;
  let status: AvonStatus = "connecting";
  let conn: DbConnection | null = null;
  let token: string | undefined;
  let live = false;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let probe: ReturnType<typeof setInterval> | undefined;
  const rtt = new RttMeter(Math.floor(Math.random() * 2 ** 32), (ms) => opts.onRtt?.(ms));
  const stopProbe = () => {
    if (probe) clearInterval(probe);
    probe = undefined;
    rtt.reset();
  };

  const setStatus = (s: AvonStatus) => {
    if (s === status) return;
    status = s;
    opts.onStatus(s);
  };
  const retry = (c: DbConnection) => {
    if (closed || c !== conn) return;
    conn = null;
    live = false;
    stopProbe();
    setStatus("disconnected");
    if (timer) clearTimeout(timer);
    timer = setTimeout(open, retryMs);
    try { c.disconnect(); } catch { /* already closed */ }
  };

  function open() {
    if (closed) return;
    let me = "";
    const c: DbConnection = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((_c, identity, tok) => {
        if (c !== conn) return;
        if (timer) clearTimeout(timer);
        token = tok;
        me = identity.toHexString();
        live = true;
        setStatus("connected");
      })
      .onDisconnect(() => retry(c))
      .onConnectError((_ctx, err) => {
        if (/40[13]/.test(String(err?.message))) token = undefined;   // token refused: come back as a new identity
        retry(c);
      })
      .build();
    conn = c;
    timer = setTimeout(() => retry(c), connectTimeoutMs);
    // Many row callbacks arrive per transaction; rebuild once after they settle.
    let pending = false;
    const rebuild = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (c !== conn) return;
        const meta = [...c.db.consoleMeta.iter()][0];
        const view = viewFromRows([...c.db.alert.iter()], meta, [...c.db.sensorIssue.iter()]);
        if (view !== undefined) opts.onView(view, sourceOf(meta));
        const a = attackFromRows([...c.db.facility.iter()], [...c.db.fault.iter()], [...c.db.alert.iter()]);
        opts.onAttack?.(a.targets, a.faults);
        opts.onFacilities?.([...c.db.facility.iter()].map((f) => ({
          facility_id: f.facilityId, system_id: f.systemId, lat: f.lat, lon: f.lon,
          tank_id: f.tankId, pump_id: f.pumpId, capacity_bbl: f.capacityBbl, well_ids: [...f.wellIds],
        })).sort((x, y) => x.facility_id.localeCompare(y.facility_id)));
        const conf: Record<string, Confirmed> = {};
        for (const r of c.db.confirmation.iter()) {
          conf[r.alertId] = { headline: r.headline, cost: r.cost, atMs: Number(r.confirmedAt.microsSinceUnixEpoch) / 1000 };
        }
        opts.onConfirmations?.(conf);
      });
    };
    c.db.alert.onInsert(rebuild);
    c.db.alert.onDelete(rebuild);
    c.db.alert.onUpdate(rebuild);
    c.db.consoleMeta.onInsert(rebuild);
    c.db.consoleMeta.onDelete(rebuild);
    c.db.consoleMeta.onUpdate(rebuild);
    for (const tbl of [c.db.sensorIssue, c.db.fault, c.db.facility, c.db.confirmation]) {
      tbl.onInsert(rebuild);
      tbl.onDelete(rebuild);
    }
    c.subscriptionBuilder().onApplied(rebuild).subscribe([tables.alert, tables.consoleMeta, tables.sensorIssue, tables.fault, tables.facility, tables.confirmation]);
    // The probe has its own subscription, so a database without rtt_probe still shows the board.
    c.db.rttProbe.onInsert((_ctx, row) => {
      if (c === conn && row.sender.toHexString() === me) rtt.arrived(row.nonce, performance.now());
    });
    // /insight tables on their own subscription too: a site database published before they existed
    // fails only this one, and the board above is untouched.
    if (opts.onInsight) {
      let due = false;
      const insight = () => {
        if (due) return;
        due = true;
        queueMicrotask(() => {
          due = false;
          if (c !== conn) return;
          opts.onInsight!(insightFromRows([...c.db.budget.iter()], [...c.db.flowSeries.iter()], [...c.db.breachRisk.iter()], [...c.db.scenario.iter()], me));
        });
      };
      for (const tbl of [c.db.budget, c.db.flowSeries, c.db.breachRisk, c.db.scenario]) {
        tbl.onInsert(insight);
        tbl.onDelete(insight);
      }
      c.subscriptionBuilder().onApplied(insight).subscribe([tables.budget, tables.flowSeries, tables.breachRisk, tables.scenario]);
    }
    c.subscriptionBuilder().onApplied(() => {
      if (c !== conn) return;
      stopProbe();
      const ping = () => {
        if (c === conn && live) c.reducers.rttPing({ nonce: rtt.sent(performance.now()) }).catch(() => {});
      };
      ping();
      probe = setInterval(ping, RTT_INTERVAL_MS);
    }).subscribe([tables.rttProbe]);
    // LOCKDOWN has its own subscription too, for the same reason (a database published before it).
    const lockdownChanged = () => { if (c === conn) opts.onLockdown?.(lockdownFromRow([...c.db.lockdown.iter()][0])); };
    c.db.lockdown.onInsert(lockdownChanged);
    c.db.lockdown.onUpdate(lockdownChanged);
    c.db.lockdown.onDelete(lockdownChanged);
    c.subscriptionBuilder().onApplied(lockdownChanged).subscribe([tables.lockdown]);
  }

  open();
  return {
    connection: () => (live ? conn : null),
    close() {
      closed = true;
      live = false;
      stopProbe();
      if (timer) clearTimeout(timer);
      conn?.disconnect();
      conn = null;
    },
  };
}

// A plain connection for scripts: resolves once connected, rejects if the first connect fails.
export function openAvon(uri: string, database = AVON_DB): Promise<DbConnection> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .onConnect((c) => resolve(c as DbConnection))
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });
}

export interface IngestTimings {
  parseMs: number;
  loadMs: number;
  ingestMs: number;
  finishMs: number;
  totalMs: number;
  rows: number;
  batches: number;
  facilities: number;
  timestamps: number;
}

// Parse (lib/eog/load.ts) -> load_dataset -> ingest_batch x N (at most `inflight` at once) -> finish_ingest.
export async function sendDataset(
  conn: DbConnection, files: DatasetFiles, datasetId: string,
  { batch = 1000, inflight = 4 }: { batch?: number; inflight?: number } = {},
): Promise<IngestTimings> {
  const t0 = performance.now();
  const ds = loadDataset(files);
  const rows: WideRow[] = datasetToRows(ds);
  const t1 = performance.now();
  await conn.reducers.loadDataset({ networkJson: files.network, opsJson: files.ops, datasetId });
  const t2 = performance.now();
  const batches: WideRow[][] = [];
  for (let i = 0; i < rows.length; i += batch) batches.push(rows.slice(i, i + batch));
  let next = 0;
  const worker = async () => {
    while (next < batches.length) await conn.reducers.ingestBatch({ rows: batches[next++] });
  };
  await Promise.all(Array.from({ length: Math.min(inflight, batches.length) }, worker));
  const t3 = performance.now();
  await conn.reducers.finishIngest({});
  const t4 = performance.now();
  let facilities = 0;
  for (const s of ds.network.systems) facilities += s.facilities.length;
  return {
    parseMs: t1 - t0, loadMs: t2 - t1, ingestMs: t3 - t2, finishMs: t4 - t3, totalMs: t4 - t0,
    rows: rows.length, batches: batches.length, facilities, timestamps: ds.ts.length,
  };
}

const AvonContext = createContext<AvonConsole | null>(null);
const AvonRttContext = createContext<number | null>(null);

// One database per oil site. `?site=eagleford` on any Avon page (console, Phone 1, the model,
// the station) opens that site's database, `avon-eagleford` (or `<hosted db>-eagleford`); no
// parameter or ?site=permian keeps the default site. The US map links to sites this way.
export function siteDatabase(site: string | null | undefined, base: string = AVON_DB): string {
  const key = (site ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  return key && key !== DEFAULT_SITE_KEY ? `${base}-${key}` : base;
}

function siteFromUrl(): string | null {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("site");
}

export function AvonProvider({ children, uri, database }: { children: ReactNode; uri?: string; database?: string }) {
  const [db] = useState(() => database ?? siteDatabase(siteFromUrl()));
  const [status, setStatus] = useState<AvonStatus>("connecting");
  const [rttMs, setRttMs] = useState<number | null>(null);
  const [view, setView] = useState<ConsoleView | null>(null);
  const [source, setSource] = useState<AvonSource | null>(null);
  const [targets, setTargets] = useState<AttackTarget[]>([]);
  const [faults, setFaults] = useState<ActiveFault[]>([]);
  const [facilities, setFacilities] = useState<SiteFacility[]>([]);
  const [confirmations, setConfirmations] = useState<Record<string, Confirmed>>({});
  const [insight, setInsight] = useState<Insight>(EMPTY_INSIGHT);
  const [lockdown, setLockdown] = useState<LockdownState | null>(null);
  const link = useRef<AvonLink | null>(null);

  useEffect(() => {
    const l = connectAvon({
      uri: uri ?? avonUri(),
      database: db,
      onStatus: setStatus,
      onView: (v, s) => { setView(v); setSource(s); },
      onAttack: (t, f) => { setTargets(t); setFaults(f); },
      onFacilities: setFacilities,
      onConfirmations: setConfirmations,
      onRtt: setRttMs,
      onInsight: setInsight,
      onLockdown: setLockdown,
    });
    link.current = l;
    return () => { l.close(); if (link.current === l) link.current = null; };
  }, [uri, db]);

  const loading = useRef(false);
  const load = useCallback(async (files: DatasetFiles, datasetId: string) => {
    const conn = link.current?.connection();
    if (!conn) throw new Error("Spacetime is disconnected: start it with npm run st:start");
    if (loading.current) throw new Error("A site is already loading on this screen; wait for it to finish.");
    loading.current = true;
    try {
      await sendDataset(conn, files, datasetId);
    } finally {
      loading.current = false;
    }
  }, []);

  const inject = useCallback(async (kind: FaultKind, assetId: string) => {
    const conn = link.current?.connection();
    if (!conn) throw new Error("Spacetime is disconnected");
    await conn.reducers.injectFault({ assetId, kind });
  }, []);

  const clear = useCallback(async (assetId?: string) => {
    const conn = link.current?.connection();
    if (!conn) throw new Error("Spacetime is disconnected");
    await conn.reducers.clearFault({ assetId: assetId ?? "" });
  }, []);

  const confirm = useCallback(async (alertId: string) => {
    const conn = link.current?.connection();
    if (!conn) throw new Error("Spacetime is disconnected");
    await conn.reducers.confirmPlan({ alertId });
  }, []);

  const whatIf = useCallback(async (kind: WhatIfKind, assetId: string) => {
    const conn = link.current?.connection();
    if (!conn) throw new Error("Spacetime is disconnected");
    await conn.reducers.whatIf({ kind, assetId });
  }, []);

  const computeBreaches = useCallback(async () => {
    const conn = link.current?.connection();
    if (!conn) throw new Error("Spacetime is disconnected");
    await conn.reducers.computeBreaches({});
  }, []);

  const enterLockdown = useCallback(async (reason: string, evidenceRef: string, tank: string) => {
    const conn = link.current?.connection();
    if (!conn) throw new Error("Spacetime is disconnected");
    await conn.reducers.enterLockdown({ reason, evidenceRef, tank });
  }, []);

  const endLockdown = useCallback(async () => {
    const conn = link.current?.connection();
    if (!conn) throw new Error("Spacetime is disconnected");
    await conn.reducers.endLockdown({});
  }, []);

  const value = useMemo<AvonConsole>(
    () => ({ status, view, source, load, facilities, confirmations, confirm, targets, faults, inject, clear, insight, whatIf, computeBreaches, lockdown, enterLockdown, endLockdown }),
    [status, view, source, load, facilities, confirmations, confirm, targets, faults, inject, clear, insight, whatIf, computeBreaches, lockdown, enterLockdown, endLockdown],
  );
  // The round trip has its own context, so a new sample every 5 s re-renders only the badge.
  return createElement(AvonContext.Provider, { value }, createElement(AvonRttContext.Provider, { value: rttMs }, children));
}

// Live round trip to the avon database in ms (median of the last 5 pings), null until measured.
export function useAvonRtt(): number | null {
  return useContext(AvonRttContext);
}

export function useAvonConsole(): AvonConsole {
  const v = useContext(AvonContext);
  if (!v) throw new Error("useAvonConsole() must be inside <AvonProvider>");
  return v;
}

// The same, or null outside <AvonProvider>: for parts that also render without a live site.
export function useAvonConsoleOrNull(): AvonConsole | null {
  return useContext(AvonContext);
}

// LOCKDOWN for any Avon screen inside <AvonProvider> (/twin, /vr, /insight): the row and the reducers.
// `active` is true only while the site is locked down.
export function useLockdown(): { lockdown: LockdownState | null; active: boolean; enterLockdown: AvonConsole["enterLockdown"]; endLockdown: AvonConsole["endLockdown"] } {
  const { lockdown, enterLockdown, endLockdown } = useAvonConsole();
  return { lockdown, active: !!lockdown?.active, enterLockdown, endLockdown };
}
