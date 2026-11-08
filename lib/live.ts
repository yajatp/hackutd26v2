"use client";
// Live link to the Avon SpacetimeDB database. The EOG engine runs inside the module's
// finish_ingest reducer; this file only parses files, sends reading rows and rebuilds the
// ConsoleView from the public alert + console_meta rows. When the server is down the status
// says so and the last view stays on screen; there is no browser-only engine path.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DbConnection, tables } from "./module_bindings/index.ts";
import type { Alert as AlertRow, ConsoleMeta } from "./module_bindings/types.ts";
import { loadDataset, type DatasetFiles } from "./eog/load.ts";
import type { Alert, ConsoleView } from "./eog/alerts.ts";
import type { DetectedEvent } from "./eog/types.ts";
import { datasetToRows, type WideRow } from "../spacetimedb/src/wide.ts";

export const AVON_DB = "avon";
export const AVON_PORT = 3001;

export type AvonStatus = "connecting" | "connected" | "disconnected";

export interface AvonSource { datasetId: string; builtAtMs: number }

export interface AvonConsole {
  status: AvonStatus;
  view: ConsoleView | null;
  source: AvonSource | null;                      // which dataset the view was built from, and when
  load(files: DatasetFiles, datasetId: string): Promise<void>;
}

// Same host as the page, so phones on the LAN reach the laptop's Spacetime. Plain ws://, so
// the page must be served over http (as on the demo LAN).
export function avonUri(): string {
  return `ws://${window.location.hostname}:${AVON_PORT}`;
}

// The ConsoleView that finish_ingest built, from the rows it wrote. Returns undefined while
// the alert rows and console_meta disagree (mid-update), so callers keep the previous view.
export function viewFromRows(alerts: readonly AlertRow[], meta: ConsoleMeta | undefined): ConsoleView | null | undefined {
  if (!meta) return null;
  if (alerts.length !== meta.alertCount) return undefined;
  const sorted = [...alerts].sort((a, b) => a.rank - b.rank);
  return {
    now: meta.now,
    alerts: sorted.map((r) => JSON.parse(r.alertJson) as Alert),
    events: JSON.parse(meta.eventsJson) as DetectedEvent[],
    totals: { do_nothing: meta.doNothing, plans: meta.plans },
  };
}

// The one place a Spacetime bigint (Timestamp micros) becomes a number.
function sourceOf(meta: ConsoleMeta | undefined): AvonSource | null {
  return meta ? { datasetId: meta.datasetId, builtAtMs: Number(meta.builtAt.microsSinceUnixEpoch) / 1000 } : null;
}

export interface AvonLinkOptions {
  uri: string;
  database?: string;
  retryMs?: number;                                // wait between connection attempts while the server is down
  connectTimeoutMs?: number;                       // give up on an attempt that neither connects nor fails
  onStatus(status: AvonStatus): void;
  onView(view: ConsoleView | null, source: AvonSource | null): void;
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

  const setStatus = (s: AvonStatus) => {
    if (s === status) return;
    status = s;
    opts.onStatus(s);
  };
  const retry = (c: DbConnection) => {
    if (closed || c !== conn) return;
    conn = null;
    live = false;
    setStatus("disconnected");
    if (timer) clearTimeout(timer);
    timer = setTimeout(open, retryMs);
    try { c.disconnect(); } catch { /* already closed */ }
  };

  function open() {
    if (closed) return;
    const c: DbConnection = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(database)
      .withToken(token)
      .onConnect((_c, _identity, tok) => {
        if (c !== conn) return;
        if (timer) clearTimeout(timer);
        token = tok;
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
        const view = viewFromRows([...c.db.alert.iter()], meta);
        if (view !== undefined) opts.onView(view, sourceOf(meta));
      });
    };
    c.db.alert.onInsert(rebuild);
    c.db.alert.onDelete(rebuild);
    c.db.alert.onUpdate(rebuild);
    c.db.consoleMeta.onInsert(rebuild);
    c.db.consoleMeta.onDelete(rebuild);
    c.db.consoleMeta.onUpdate(rebuild);
    c.subscriptionBuilder().onApplied(rebuild).subscribe([tables.alert, tables.consoleMeta]);
  }

  open();
  return {
    connection: () => (live ? conn : null),
    close() {
      closed = true;
      live = false;
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

export function AvonProvider({ children, uri, database = AVON_DB }: { children: ReactNode; uri?: string; database?: string }) {
  const [status, setStatus] = useState<AvonStatus>("connecting");
  const [view, setView] = useState<ConsoleView | null>(null);
  const [source, setSource] = useState<AvonSource | null>(null);
  const link = useRef<AvonLink | null>(null);

  useEffect(() => {
    const l = connectAvon({
      uri: uri ?? avonUri(),
      database,
      onStatus: setStatus,
      onView: (v, s) => { setView(v); setSource(s); },
    });
    link.current = l;
    return () => { l.close(); if (link.current === l) link.current = null; };
  }, [uri, database]);

  const load = useCallback(async (files: DatasetFiles, datasetId: string) => {
    const conn = link.current?.connection();
    if (!conn) throw new Error("Spacetime is disconnected: start it with npm run st:start");
    await sendDataset(conn, files, datasetId);
  }, []);

  const value = useMemo<AvonConsole>(() => ({ status, view, source, load }), [status, view, source, load]);
  return createElement(AvonContext.Provider, { value }, children);
}

export function useAvonConsole(): AvonConsole {
  const v = useContext(AvonContext);
  if (!v) throw new Error("useAvonConsole() must be inside <AvonProvider>");
  return v;
}
