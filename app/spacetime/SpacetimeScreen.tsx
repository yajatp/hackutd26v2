"use client";
// /spacetime: the avon database as a judge sees it from beside the console. Its own connection
// (connectAvon from lib/live.ts), its own row callbacks on every public table, and nothing else:
// this page never calls a reducer. The feed and matrix logic is in ./feed.ts.
import { Fragment, useEffect, useState } from "react";
import { connectAvon, avonUri, AVON_DB, type AvonStatus } from "@/lib/live";
import { tables, type DbConnection, type EventContext } from "@/lib/module_bindings";
import { ConnBadge, connState } from "@/app/ui/Badge";
import { Grain } from "@/app/ui/Grain";
import { ScreenHeader } from "@/app/ui/ScreenHeader";
import {
  REDUCERS, TABLES, WRITES, emptyStats, matchReducers, matchWords, nextStats, observe, pushFeed, touchedTables,
  type FeedLine, type Observed, type Op, type ReducerName, type RowChange, type Stats, type TableName, type Txn,
} from "./feed";

// Row callbacks, typed only as far as this page needs them.
interface Watched {
  onInsert(cb: (ctx: EventContext, row: Record<string, unknown>) => void): void;
  onDelete(cb: (ctx: EventContext, row: Record<string, unknown>) => void): void;
  onUpdate(cb: (ctx: EventContext, old: Record<string, unknown>, row: Record<string, unknown>) => void): void;
  count(): bigint | number;
}

const ACCESSOR = {
  config: "config", facility: "facility", alert: "alert", console_meta: "consoleMeta",
  sensor_issue: "sensorIssue", fault: "fault", confirmation: "confirmation",
} as const satisfies Record<TableName, keyof DbConnection["db"]>;

const PRIVATE = ["reading", "dataset_source", "load_lock"];

interface Landed { txn: Txn; reducers: ReducerName[]; tables: TableName[] }

const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour12: false });

export default function SpacetimeScreen() {
  const [status, setStatus] = useState<AvonStatus>("connecting");
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [seen, setSeen] = useState<Observed>({});
  const [last, setLast] = useState<Landed | null>(null);

  useEffect(() => {
    let attached: DbConnection | null = null;
    const pending = new Map<string, Txn>();

    const counts = (c: DbConnection) =>
      Object.fromEntries(TABLES.map((t) => [t, Number((c.db[ACCESSOR[t]] as unknown as Watched).count())])) as Record<TableName, number>;

    const flush = (c: DbConnection) => {
      const txns = [...pending.values()];
      pending.clear();
      if (c !== attached) return;
      const rows = counts(c);
      if (txns.length === 0) {
        setStats((s) => nextStats(s, rows));
        return;
      }
      for (const txn of txns) {
        setFeed((f) => pushFeed(f, txn));
        setSeen((s) => observe(s, txn));
        setStats((s) => nextStats(s, rows, txn));
      }
      const txn = txns[txns.length - 1];
      setLast({ txn, reducers: matchReducers(txn.changes), tables: touchedTables(txn.changes) });
    };

    let scheduled = false;
    const schedule = (c: DbConnection) => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => { scheduled = false; flush(c); });
    };

    const add = (c: DbConnection, ctx: EventContext, table: TableName, op: Op, row: Record<string, unknown>) => {
      // The rows a subscription starts with are the state, not a change: they only update the counts.
      if (ctx.event.tag === "Transaction" || ctx.event.tag === "Reducer") {
        let txn = pending.get(ctx.event.id);
        if (!txn) pending.set(ctx.event.id, (txn = { id: ctx.event.id, atMs: Date.now(), changes: [] }));
        txn.changes.push({ table, op, row } satisfies RowChange);
      }
      schedule(c);
    };

    const attach = (c: DbConnection | null) => {
      if (!c || c === attached) return;
      attached = c;
      for (const t of TABLES) {
        const tbl = c.db[ACCESSOR[t]] as unknown as Watched;
        tbl.onInsert((ctx, row) => add(c, ctx, t, "insert", row));
        tbl.onDelete((ctx, row) => add(c, ctx, t, "delete", row));
        tbl.onUpdate((ctx, _old, row) => add(c, ctx, t, "update", row));
      }
      // connectAvon subscribes to the other six public tables; config is the one it leaves out.
      c.subscriptionBuilder().onApplied(() => schedule(c)).subscribe([tables.config]);
      schedule(c);
    };

    const link = connectAvon({
      uri: avonUri(),
      database: AVON_DB,
      onStatus: (s) => {
        setStatus(s);
        if (s === "connected") attach(link.connection());
      },
      onView: () => { /* the board is the console's job; this page reads the rows itself */ },
    });
    return () => { attached = null; link.close(); };
  }, []);

  return (
    <main className="st-root">
      <Grain />
      <ScreenHeader as="p" current="spacetime" title="SpacetimeDB" status={<ConnBadge state={connState(status)} />} />
      <div className="st-head">
        <div className="st-title">
          <h1>The avon database, live</h1>
        </div>
        <p className="st-lede">
          This page only reads. Press Confirm on the console or tap Fake on Phone 1, and the transaction lands here: the
          rows it changed, and which reducer writes those tables.
        </p>
        {status === "disconnected" && (
          <p className="st-down" role="alert">
            Spacetime is not answering on port 3001. Start the demo on this laptop with <code>npm run demo</code>; this
            page reconnects by itself and keeps what it already showed.
          </p>
        )}
      </div>

      <Matrix seen={seen} last={last} />

      <div className="st-split">
        <section className="st-feed" aria-labelledby="st-feed-h">
          <h2 id="st-feed-h">Row changes, newest first</h2>
          <p className="st-note">
            Another client&rsquo;s reducer call reaches this page as its rows only: the server does not say which reducer
            ran or who called it, so no line names one. The last 200 changes stay.
          </p>
          {feed.length === 0 ? (
            <p className="st-empty">No changes since this page opened. Tap Fake on Phone 1 or press Confirm on the console.</p>
          ) : (
            <ol className="st-lines" aria-live="polite" aria-relevant="additions">
              {feed.map((l, i) => (
                <li key={l.key} className={i > 0 && feed[i - 1].txId !== l.txId ? "st-line st-newtx" : "st-line"} data-tx={l.txId === last?.txn.id ? "last" : undefined}>
                  <time className="st-time">{clock(l.atMs)}</time>
                  <code className="st-table">{l.table}</code>
                  <span className="st-op">{l.op === "many" ? "rebuilt" : l.op}</span>
                  <span className="st-fields">{l.fields.join(", ")}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="st-tables" aria-labelledby="st-tables-h">
          <h2 id="st-tables-h">Public tables</h2>
          <ul>
            {TABLES.map((t) => (
              <li key={t} data-touched={last?.tables.includes(t) ? "yes" : undefined}>
                <code>{t}</code>
                <span className="st-count">{stats[t].rows.toLocaleString("en-US")} {stats[t].rows === 1 ? "row" : "rows"}</span>
                <span className="st-when">{stats[t].lastChangeMs === null ? "no change yet" : `changed ${clock(stats[t].lastChangeMs)}`}</span>
              </li>
            ))}
          </ul>
          <p className="st-note">
            {PRIVATE.join(", ").replace(/, (?=[^,]*$)/, " and ")} are private: no client can subscribe to them, so their
            writes (ingest_batch adds the readings) never show here.
          </p>
        </section>
      </div>
    </main>
  );
}

// Reducers by tables. A ring: the module source writes this table from this reducer. A number:
// transactions this page saw that only that reducer explains. The last transaction lights up.
function Matrix({ seen, last }: { seen: Observed; last: Landed | null }) {
  const lit = (r: ReducerName, t: TableName) => !!last && last.reducers.includes(r) && last.tables.includes(t);
  return (
    <section className="st-matrix" aria-labelledby="st-matrix-h">
      <h2 id="st-matrix-h">Which reducer writes which table</h2>
      <div className="st-grid-wrap">
        <table className="st-grid" key={last?.txn.id ?? "none"}>
          <colgroup>
            <col className="st-col-reducer" />
            <col span={TABLES.length} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Reducer</span></th>
              {TABLES.map((t) => (
                <th key={t} scope="col" data-lit={last?.tables.includes(t) ? "yes" : undefined}>
                  <span className="st-colname">{t}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {REDUCERS.map((r) => (
              <tr key={r} data-lit={last?.reducers.includes(r) ? "yes" : undefined}>
                <th scope="row"><code>{r}</code></th>
                {TABLES.map((t) => {
                  const writes = !!WRITES[r][t];
                  const n = seen[r]?.[t] ?? 0;
                  return (
                    <td key={t} data-writes={writes ? "yes" : undefined} data-lit={lit(r, t) ? "yes" : undefined}
                      aria-label={`${r} ${writes ? "writes" : "does not write"} ${t}${n ? `, seen ${n} times` : ""}`}>
                      {n > 0 ? <span className="st-n">{n}</span> : writes ? <span className="st-ring" aria-hidden="true" /> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="st-caption" aria-live="polite">
        {last ? (
          <>
            At {clock(last.txn.atMs)} a transaction changed{" "}
            {last.tables.map((t, i) => (
              <Fragment key={t}>{i > 0 && (i === last.tables.length - 1 ? " and " : ", ")}<code>{t}</code></Fragment>
            ))}
            . {matchWords(last.reducers)}
          </>
        ) : (
          "A ring means the module source writes that table from that reducer. Numbers count the transactions seen here that only one reducer explains."
        )}
      </p>
    </section>
  );
}
