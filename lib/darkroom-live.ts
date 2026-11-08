// Live connection to the Darkroom database for the /box and /witness screens.
//
// One connection per page, to ws://<the page's host>:3001, database 'darkroom'.
// u64 values become plain numbers here, at the boundary, so screens never see bigint.
// The device witness {genesis, seq, head} lives in localStorage and only moves
// forward while the log verifies (lib/rules/darkroom/status.ts).

import { useSyncExternalStore } from "react";
import { DbConnection, tables } from "./darkroom_bindings";
import { GENESIS_PREV, type Json, type LogEvent, type Witness } from "./chain";
import { rowToEvent } from "./rules/darkroom/replay";
import type { WriteType } from "./rules/darkroom/roles";
import { advanceWitness, chainStatus, parseWitness, type ChainStatus } from "./rules/darkroom/status";

export const DARKROOM_DB = "darkroom";
export const SPACETIME_PORT = 3001;

export interface MemberView {
  identity: string;
  name: string;
  role: string;
  active: boolean;
}

export interface DarkroomSnapshot {
  connection: "connecting" | "live" | "offline";
  ready: boolean;
  identity: string | null;
  events: LogEvent[];
  members: MemberView[];
  me: MemberView | null;
  head: { seq: number; hash: string; count: number } | null;
  status: ChainStatus;
  witness: Witness | null;
  error: string | null;
}

const INITIAL: DarkroomSnapshot = {
  connection: "connecting",
  ready: false,
  identity: null,
  events: [],
  members: [],
  me: null,
  head: null,
  status: { kind: "empty", text: "NO ENTRIES YET" },
  witness: null,
  error: null,
};

function storageKey(kind: "token" | "witness"): string {
  return `darkroom.${kind}.v1:${window.location.hostname}:${SPACETIME_PORT}/${DARKROOM_DB}`;
}

function load(kind: "token" | "witness"): string | null {
  try {
    return window.localStorage.getItem(storageKey(kind));
  } catch {
    return null;
  }
}

function save(kind: "token" | "witness", value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(storageKey(kind));
    else window.localStorage.setItem(storageKey(kind), value);
  } catch {
    // Private mode or storage off: the screen still works, it just forgets on reload.
  }
}

function loadWitness(): Witness | null {
  const raw = load("witness");
  if (!raw) return null;
  try {
    return parseWitness(JSON.parse(raw));
  } catch {
    return null;
  }
}

class DarkroomStore {
  private snapshot: DarkroomSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private conn: DbConnection | null = null;
  private started = false;
  private subscribed = false;
  private pending = false;
  private witness: Witness | null = null;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    if (!this.started) this.start();
    return () => {
      this.listeners.delete(fn);
    };
  };

  getSnapshot = () => this.snapshot;

  private set(patch: Partial<DarkroomSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const fn of this.listeners) fn();
  }

  private start() {
    this.started = true;
    this.witness = loadWitness();
    this.snapshot = { ...this.snapshot, witness: this.witness };
    this.connect();
  }

  private connect() {
    const uri = `ws://${window.location.hostname}:${SPACETIME_PORT}`;
    this.set({ connection: "connecting" });
    this.conn = DbConnection.builder()
      .withUri(uri)
      .withDatabaseName(DARKROOM_DB)
      .withToken(load("token") ?? undefined)
      .withAutomaticReconnect()
      .onConnect((conn, identity, token) => {
        save("token", token);
        this.set({ connection: "live", identity: identity.toHexString(), error: null });
        if (!this.subscribed) {
          this.subscribed = true;
          this.watch(conn as DbConnection);
        }
        this.later();
      })
      // After a drop the SDK reconnects by itself and fires this instead of onConnect.
      // The subscription is replayed by the SDK; the table callbacks stay registered.
      .onAutomaticReconnect((_conn, identity, token) => {
        save("token", token);
        this.set({ connection: "live", identity: identity.toHexString(), error: null });
        this.later();
      })
      .onDisconnect((_ctx, error) => {
        this.set({ connection: "offline", error: error ? error.message : null });
      })
      .onConnectError((_ctx, error, nextAttempt) => {
        this.set({ connection: "offline", error: `Cannot reach the box at ${uri}: ${error.message}` });
        // The SDK does not retry a first connection that never opened; try again ourselves.
        if (nextAttempt === undefined && !this.subscribed) setTimeout(() => this.connect(), 2000);
      })
      .build();
  }

  private watch(conn: DbConnection) {
    const later = () => this.later();
    conn.db.eventLog.onInsert(later);
    conn.db.eventLog.onDelete(later);
    conn.db.eventLog.onUpdate(later);
    conn.db.chainHead.onInsert(later);
    conn.db.chainHead.onDelete(later);
    conn.db.chainHead.onUpdate(later);
    conn.db.member.onInsert(later);
    conn.db.member.onDelete(later);
    conn.db.member.onUpdate(later);
    conn
      .subscriptionBuilder()
      .onApplied(() => {
        this.snapshot = { ...this.snapshot, ready: true };
        this.later();
      })
      .subscribe([tables.eventLog, tables.chainHead, tables.member]);
  }

  private later() {
    if (this.pending) return;
    this.pending = true;
    queueMicrotask(() => {
      this.pending = false;
      this.recompute();
    });
  }

  private recompute() {
    const conn = this.conn;
    if (!conn) return;
    const events = [...conn.db.eventLog.iter()].map(rowToEvent).sort((a, b) => a.seq - b.seq);
    const members: MemberView[] = [...conn.db.member.iter()].map(m => ({
      identity: m.identity.toHexString(),
      name: m.name,
      role: m.role,
      active: m.active,
    }));
    const h = [...conn.db.chainHead.iter()][0];
    const head = h ? { seq: Number(h.seq), hash: h.hash, count: Number(h.count) } : null;
    const identity = this.snapshot.identity;
    const me = members.find(m => m.identity === identity && m.active) ?? null;
    let status = this.snapshot.status;
    if (this.snapshot.ready) {
      status = chainStatus(events, this.witness);
      const next = advanceWitness(events, this.witness);
      if (next !== this.witness) {
        this.witness = next;
        save("witness", next ? JSON.stringify(next) : null);
      }
    }
    this.set({ events, members, me, head, status, witness: this.witness });
  }

  private requireConn(): DbConnection {
    if (!this.conn || this.snapshot.connection !== "live") throw new Error("Not connected to the box.");
    if (this.snapshot.status.kind === "rollback" || this.snapshot.status.kind === "tampering") {
      throw new Error("Writing is stopped: the record on the box no longer matches what this screen saw.");
    }
    return this.conn;
  }

  async openIncident(title: string) {
    await this.requireConn().reducers.openIncident({ title });
  }

  // The server rejects a write if another screen wrote first; retry with the new head.
  async append(incidentId: string, type: Exclude<WriteType, "incident_opened">, payload: Json) {
    const conn = this.requireConn();
    for (let attempt = 0; ; attempt++) {
      const h = [...conn.db.chainHead.iter()][0];
      const expectedSeq = h ? h.seq + BigInt(1) : BigInt(0);
      const expectedPrev = h ? h.hash : GENESIS_PREV;
      try {
        await conn.reducers.appendEvent({ expectedSeq, expectedPrev, incidentId, type, payloadJson: JSON.stringify(payload) });
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (attempt < 2 && msg.includes("stale head")) {
          await new Promise(r => setTimeout(r, 150));
          continue;
        }
        throw new Error(msg);
      }
    }
  }

  // Demo reset only: this device forgets what it saw and enrolls again on the next update.
  forgetWitness() {
    this.witness = null;
    save("witness", null);
    this.later();
  }
}

let store: DarkroomStore | null = null;
function getStore(): DarkroomStore {
  if (!store) store = new DarkroomStore();
  return store;
}

const noop = () => () => {};

export function useDarkroom(): DarkroomSnapshot {
  return useSyncExternalStore(
    typeof window === "undefined" ? noop : getStore().subscribe,
    () => getStore().getSnapshot(),
    () => INITIAL,
  );
}

export const darkroom = {
  openIncident: (title: string) => getStore().openIncident(title),
  append: (incidentId: string, type: Exclude<WriteType, "incident_opened">, payload: Json) => getStore().append(incidentId, type, payload),
  forgetWitness: () => getStore().forgetWitness(),
  // For headless checks (spacetimedb-darkroom/test/reconnect.ts); screens use useDarkroom.
  subscribe: (fn: () => void) => getStore().subscribe(fn),
  snapshot: () => getStore().getSnapshot(),
};
