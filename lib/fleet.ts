"use client";
// The live fleet: every oil site's status in one hook, for the US map (app/map) and the front door.
// One read-only connection per site database (lib/sites.ts, siteDatabase in lib/live.ts). It
// subscribes to the small public tables only (console_meta, alert, sensor_issue, fault, facility
// for the count, and lockdown on its own subscription) and never calls a reducer: connectAvon's
// round-trip probe calls rtt_ping every 5 s, so this link copies its retry pattern instead of
// using it. Any drop or failed attempt builds a fresh connection after retryMs, quietly.
import { useEffect, useState } from "react";
import { DbConnection, tables } from "./module_bindings/index.ts";
import type { Alert as AlertRow, ConsoleMeta, Fault, Lockdown as LockdownRow, SensorIssue as SensorIssueRow } from "./module_bindings/types.ts";
import type { Alert } from "./eog/alerts.ts";
import { avonUri, siteDatabase, type AvonStatus } from "./live.ts";
import { SITES } from "./sites.ts";

export interface SiteSummary {
  key: string; name: string; basin: string; city: string; state: string; lat: number; lon: number;
  db: string; status: "connecting" | "connected" | "disconnected";
  datasetId: string | null; facilities: number;
  pumpFailures: number; inspections: number; sensorIssues: number; simulatedFaults: number;
  plans: number; doNothing: number;              // dollars, from console_meta totals
  top: { facilityId: string; text: string } | null;   // the console's top card in one line
  lockdown: boolean;
}

export type SiteInfo = Pick<SiteSummary, "key" | "name" | "basin" | "city" | "state" | "lat" | "lon">;

// What one site database holds, as the link reads it.
export interface FleetRows {
  meta: ConsoleMeta | undefined;
  alerts: readonly AlertRow[];
  issues: readonly SensorIssueRow[];
  faults: readonly Fault[];
  facilities: number;
  lockdown: LockdownRow | undefined;
}

// Wait this long for every site to answer before the map says it is ready anyway.
export const FLEET_TIMEOUT_MS = 8000;

function countdown(h: number | null): string | null {
  if (h === null) return null;
  if (h <= 0) return "at shutdown now";
  const m = Math.round(h * 60);
  return `trips in ${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

const money = (x: number) => "$" + Math.round(x).toLocaleString("en-US");

// The console's top card (app/console/Board.tsx: the first pump failure by rank, else the first
// inspection) in one line, in the console's own words.
function topLine(alerts: readonly AlertRow[]): SiteSummary["top"] {
  const sorted = [...alerts].sort((a, b) => a.rank - b.rank);
  const parsed = sorted.map((r) => ({ row: r, a: safeAlert(r.alertJson) }));
  const first = parsed.find((p) => p.a?.fix) ?? parsed[0];
  if (!first) return null;
  const { row, a } = first;
  if (a?.fix) {
    const parts = [`Do this: ${a.fix.headline}`, money(a.fix.plan.cost), countdown(a.hours_to_limit)].filter(Boolean);
    return { facilityId: row.facilityId, text: parts.join(" · ") };
  }
  return { facilityId: row.facilityId, text: a?.action || row.kind.replace(/_/g, " ") };
}

function safeAlert(json: string): Alert | null {
  try { return JSON.parse(json) as Alert; } catch { return null; }
}

// Pure: one site's rows -> its summary. No rows (a database that never answered, or does not
// exist) is a summary with zeros, never an error.
export function summarize(site: SiteInfo, db: string, status: AvonStatus, rows: FleetRows | null): SiteSummary {
  const base: SiteSummary = {
    key: site.key, name: site.name, basin: site.basin, city: site.city, state: site.state, lat: site.lat, lon: site.lon,
    db, status, datasetId: null, facilities: 0, pumpFailures: 0, inspections: 0, sensorIssues: 0, simulatedFaults: 0,
    plans: 0, doNothing: 0, top: null, lockdown: false,
  };
  if (!rows) return base;
  const pumpFailures = rows.alerts.filter((a) => a.kind === "pump_failure").length;
  return {
    ...base,
    datasetId: rows.meta?.datasetId ?? null,
    facilities: rows.facilities,
    pumpFailures,
    inspections: rows.alerts.length - pumpFailures,
    sensorIssues: rows.issues.length,
    simulatedFaults: rows.faults.length,
    plans: rows.meta?.plans ?? 0,
    doNothing: rows.meta?.doNothing ?? 0,
    top: topLine(rows.alerts),
    lockdown: !!rows.lockdown?.active,
  };
}

// The alert rows and console_meta agree (finish_ingest is not half way through rewriting them).
export function settled(rows: FleetRows): boolean {
  return !rows.meta || rows.alerts.length === rows.meta.alertCount;
}

export interface FleetLinkOptions {
  uri: string;
  database: string;
  retryMs?: number;
  connectTimeoutMs?: number;
  onStatus(status: AvonStatus): void;
  onRows(rows: FleetRows): void;
}

// One site database, read only. Same retry as connectAvon: a fresh connection (same token) after
// retryMs on any drop, failed attempt or attempt that hangs; a refused token comes back as a new identity.
export function linkSite(opts: FleetLinkOptions): { close(): void } {
  const { uri, database, retryMs = 3000, connectTimeoutMs = 8000 } = opts;
  let status: AvonStatus = "connecting";
  let conn: DbConnection | null = null;
  let token: string | undefined;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const setStatus = (s: AvonStatus) => {
    if (s === status || closed) return;
    status = s;
    opts.onStatus(s);
  };
  const retry = (c: DbConnection) => {
    if (closed || c !== conn) return;
    conn = null;
    setStatus("disconnected");
    if (timer) clearTimeout(timer);
    timer = setTimeout(open, retryMs);
    try { c.disconnect(); } catch { /* already closed */ }
  };

  function open() {
    if (closed) return;
    let c: DbConnection;
    try {
      c = DbConnection.builder()
        .withUri(uri)
        .withDatabaseName(database)
        .withToken(token)
        .onConnect((_c, _identity, tok) => {
          if (c !== conn) return;
          if (timer) clearTimeout(timer);
          token = tok;
          setStatus("connected");
        })
        .onDisconnect(() => retry(c))
        .onConnectError((_ctx, err) => {
          if (/40[13]/.test(String(err?.message))) token = undefined;
          retry(c);
        })
        .build();
    } catch {
      setStatus("disconnected");
      timer = setTimeout(open, retryMs);
      return;
    }
    conn = c;
    timer = setTimeout(() => retry(c), connectTimeoutMs);
    let lockdown: LockdownRow | undefined;
    let pending = false;
    let applied = false;
    const read = () => {
      if (pending) return;
      pending = true;
      queueMicrotask(() => {
        pending = false;
        if (c !== conn || closed || !applied) return;
        opts.onRows({
          meta: [...c.db.consoleMeta.iter()][0],
          alerts: [...c.db.alert.iter()],
          issues: [...c.db.sensorIssue.iter()],
          faults: [...c.db.fault.iter()],
          facilities: Number(c.db.facility.count()),
          lockdown,
        });
      });
    };
    for (const tbl of [c.db.alert, c.db.consoleMeta, c.db.sensorIssue, c.db.fault, c.db.facility]) {
      tbl.onInsert(read);
      tbl.onDelete(read);
    }
    c.db.alert.onUpdate(read);
    c.db.consoleMeta.onUpdate(read);
    c.subscriptionBuilder()
      .onApplied(() => { applied = true; read(); })
      .subscribe([tables.consoleMeta, tables.alert, tables.sensorIssue, tables.fault, tables.facility]);
    // Its own subscription, so a site database published before the lockdown table still shows.
    const lock = () => { lockdown = [...c.db.lockdown.iter()][0]; read(); };
    c.db.lockdown.onInsert(lock);
    c.db.lockdown.onUpdate(lock);
    c.db.lockdown.onDelete(lock);
    c.subscriptionBuilder().onApplied(lock).subscribe([tables.lockdown]);
  }

  open();
  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      try { conn?.disconnect(); } catch { /* already closed */ }
      conn = null;
    },
  };
}

function initial(): SiteSummary[] {
  return SITES.map((s) => summarize(s, siteDatabase(s.key), "connecting", null));
}

// Every site in lib/sites.ts, live. `ready` once each site has answered (its board arrived, or
// its connection failed) or FLEET_TIMEOUT_MS passed. Closes every connection on unmount.
export function useFleet(): { sites: SiteSummary[]; ready: boolean } {
  const [sites, setSites] = useState<SiteSummary[]>(initial);
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set());
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const uri = avonUri();
    const answer = (key: string) => setAnswered((prev) => (prev.has(key) ? prev : new Set(prev).add(key)));
    const links = SITES.map((site) => {
      const db = siteDatabase(site.key);
      let status: AvonStatus = "connecting";
      let rows: FleetRows | null = null;
      const push = () => setSites((prev) => prev.map((p) => (p.key === site.key ? summarize(site, db, status, rows) : p)));
      return linkSite({
        uri,
        database: db,
        onStatus: (s) => {
          status = s;
          if (s === "disconnected") answer(site.key);
          push();
        },
        onRows: (r) => {
          if (!settled(r)) return;            // mid-update: keep the last summary
          rows = r;
          answer(site.key);
          push();
        },
      });
    });
    const t = setTimeout(() => setTimedOut(true), FLEET_TIMEOUT_MS);
    return () => {
      clearTimeout(t);
      for (const l of links) l.close();
    };
  }, []);

  return { sites, ready: timedOut || sites.every((s) => answered.has(s.key)) };
}
