// The /spacetime feed and matrix, as pure functions over row changes (no SDK, no React), so
// they run under `npx tsx --test app/spacetime/*.test.ts`.
//
// What the SDK gives a read-only client (spacetimedb 2.14.1, dist/index.mjs, "TransactionUpdate"):
// another client's reducer call arrives as tag "Transaction" with only the changed rows. No
// reducer name, no caller, no server time. tag "Reducer" (with the name) exists only for calls
// this same connection made, and this page never calls one. So the feed shows no reducer name.
// The matrix matches each transaction against what each reducer writes in
// spacetimedb/src/index.ts, and says it is a match, not a name the server sent.

export const TABLES = ["config", "facility", "alert", "console_meta", "sensor_issue", "fault", "confirmation"] as const;
export type TableName = (typeof TABLES)[number];

export const REDUCERS = ["load_dataset", "ingest_batch", "finish_ingest", "inject_fault", "clear_fault", "confirm_plan"] as const;
export type ReducerName = (typeof REDUCERS)[number];

export type Op = "insert" | "update" | "delete";

// One row callback: the new row for insert and update, the removed row for delete.
export interface RowChange { table: TableName; op: Op; row: Record<string, unknown> }

// Every row callback of one server message shares one ctx.event.id.
export interface Txn { id: string; atMs: number; changes: RowChange[] }

export interface FeedLine {
  key: string;
  txId: string;
  atMs: number;
  table: TableName;
  op: Op | "many";              // "many": a coalesced rebuild, the counts are in `fields`
  fields: string[];
}

export const FEED_MAX = 200;
export const COALESCE_AT = 4;   // this many changes to one table in one transaction become one line

// What each reducer can do to each public table, from spacetimedb/src/index.ts. `must`: a call
// that lands always changes this table (console_meta.builtAt and config.loadedAt are new every
// time). A row deleted and inserted again unchanged is no change at all, so most tables are
// optional. Private tables (reading, dataset_source, load_lock) never reach a client.
interface Write { ops: readonly Op[]; must?: true }
const ANY: readonly Op[] = ["insert", "update", "delete"];
const BOARD = {
  alert: { ops: ANY },
  console_meta: { ops: ["insert", "update"], must: true },
  sensor_issue: { ops: ANY },
} as const satisfies Partial<Record<TableName, Write>>;

export const WRITES: Record<ReducerName, Partial<Record<TableName, Write>>> = {
  load_dataset: {
    config: { ops: ["insert", "update"], must: true },
    facility: { ops: ANY },
    fault: { ops: ["delete"] },
    confirmation: { ops: ["delete"] },
  },
  ingest_batch: { config: { ops: ["update"], must: true } },
  finish_ingest: { ...BOARD },
  inject_fault: { fault: { ops: ["insert", "update"], must: true }, ...BOARD },
  clear_fault: { fault: { ops: ["delete"] }, ...BOARD },
  confirm_plan: { confirmation: { ops: ["insert", "update"], must: true } },
};

// The reducers that could have produced exactly these changes. One name: only that reducer
// writes this. Two or more: the changes alone cannot tell them apart. None: something the
// module source does not explain.
export function matchReducers(changes: readonly RowChange[]): ReducerName[] {
  if (changes.length === 0) return [];
  const touched = touchedTables(changes);
  return REDUCERS.filter((r) => {
    const w = WRITES[r];
    for (const c of changes) if (!w[c.table]?.ops.includes(c.op)) return false;
    for (const t of TABLES) if (w[t]?.must && !touched.includes(t)) return false;
    return true;
  });
}

// Tables in TABLES order.
export function touchedTables(changes: readonly RowChange[]): TableName[] {
  const seen = new Set(changes.map((c) => c.table));
  return TABLES.filter((t) => seen.has(t));
}

const money = (n: unknown) =>
  typeof n === "number" && Number.isFinite(n) ? `$${Math.round(n).toLocaleString("en-US")}` : "";

// A data timestamp (unix seconds) as the console reads it, in UTC.
function dataTime(ts: unknown): string {
  if (typeof ts !== "number" || ts <= 0) return "";
  return new Date(ts * 1000).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function parsed(json: unknown): Record<string, unknown> | null {
  if (typeof json !== "string") return null;
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

// The 1 to 3 fields a person cares about, per table.
export function fieldsOf(table: TableName, row: Record<string, unknown>): string[] {
  let out: string[];
  switch (table) {
    case "config":
      out = [str(row.datasetId), row.nowTs ? `now ${dataTime(row.nowTs)}` : "no readings yet"];
      break;
    case "facility":
      out = [str(row.facilityId), str(row.tankId)];
      break;
    case "alert":
      out = [`#${str(row.rank)}`, str(row.kind).replace(/_/g, " "), str(row.assetId)];
      break;
    case "console_meta":
      out = [`${str(row.alertCount)} alerts`, money(row.plans) && `plans ${money(row.plans)}`];
      break;
    case "sensor_issue": {
      const s = parsed(row.issueJson);
      out = s ? [str(s.asset_id), str(s.state), s.simulated ? "SIMULATED" : ""] : [`#${str(row.rank)}`];
      break;
    }
    case "fault":
      out = [str(row.assetId), str(row.kind).replace(/_/g, " ")];
      break;
    case "confirmation":
      out = [str(row.headline), money(row.cost)];
      break;
  }
  return out.filter(Boolean).slice(0, 3);
}

const VERB: Record<Op, string> = { update: "replaced", insert: "added", delete: "removed" };

// "14 rows replaced", "12 rows replaced, 2 added"
export function countWords(changes: readonly RowChange[]): string {
  const n: Record<Op, number> = { update: 0, insert: 0, delete: 0 };
  for (const c of changes) n[c.op]++;
  const parts = (["update", "insert", "delete"] as const).filter((op) => n[op] > 0).map((op) => `${n[op]} ${VERB[op]}`);
  if (parts.length === 0) return "";
  parts[0] = parts[0].replace(" ", changes.length === 1 && parts.length === 1 ? " row " : " rows ");
  return parts.join(", ");
}

// One transaction as feed lines, tables in TABLES order, newest first within the feed.
export function linesOf(txn: Txn): FeedLine[] {
  const lines: FeedLine[] = [];
  for (const table of touchedTables(txn.changes)) {
    const mine = txn.changes.filter((c) => c.table === table);
    if (mine.length >= COALESCE_AT) {
      lines.push({ key: `${txn.id}:${table}`, txId: txn.id, atMs: txn.atMs, table, op: "many", fields: [countWords(mine)] });
      continue;
    }
    mine.forEach((c, i) => {
      lines.push({ key: `${txn.id}:${table}:${i}`, txId: txn.id, atMs: txn.atMs, table, op: c.op, fields: fieldsOf(table, c.row) });
    });
  }
  return lines;
}

// Newest first, at most `max` lines.
export function pushFeed(feed: readonly FeedLine[], txn: Txn, max = FEED_MAX): FeedLine[] {
  return [...linesOf(txn), ...feed].slice(0, max);
}

// What actually happened, per reducer and table: how many transactions matched only that
// reducer and changed that table. Ambiguous matches are not counted.
export type Observed = Partial<Record<ReducerName, Partial<Record<TableName, number>>>>;

export function observe(seen: Observed, txn: Txn): Observed {
  const m = matchReducers(txn.changes);
  if (m.length !== 1) return seen;
  const r = m[0];
  const row = { ...seen[r] };
  for (const t of touchedTables(txn.changes)) row[t] = (row[t] ?? 0) + 1;
  return { ...seen, [r]: row };
}

export interface TableStat { rows: number; lastChangeMs: number | null }
export type Stats = Record<TableName, TableStat>;

export function emptyStats(): Stats {
  return Object.fromEntries(TABLES.map((t) => [t, { rows: 0, lastChangeMs: null }])) as Stats;
}

// Row counts come from the client cache after the transaction; last change from the transaction.
export function nextStats(prev: Stats, rows: Record<TableName, number>, txn?: Txn): Stats {
  const touched = new Set(txn ? touchedTables(txn.changes) : []);
  return Object.fromEntries(TABLES.map((t) => [t, {
    rows: rows[t],
    lastChangeMs: txn && touched.has(t) ? txn.atMs : prev[t].lastChangeMs,
  }])) as Stats;
}

// The sentence under the matrix for the last transaction.
export function matchWords(reducers: readonly ReducerName[]): string {
  if (reducers.length === 1) return `Only ${reducers[0]} writes these tables this way.`;
  if (reducers.length === 0) return "No reducer in the module source writes these tables this way.";
  const names = reducers.length === 2 ? reducers.join(" or ") : `${reducers.slice(0, -1).join(", ")} or ${reducers.at(-1)}`;
  return `${names}: the row changes alone cannot tell them apart.`;
}
