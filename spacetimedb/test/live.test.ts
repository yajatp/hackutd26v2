// Client side: lib/module_bindings receives the alert rows, and lib/live.ts reports
// 'disconnected' (keeping its last view) when the server it talks to stops.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, connect as tcpConnect } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DbConnection } from "../../lib/module_bindings/index.ts";
import { connectAvon, sendDataset, type AvonStatus } from "../../lib/live.ts";
import type { ConsoleView } from "../../lib/eog/alerts.ts";
import { HISTORY } from "../../lib/eog/testdata.ts";
import { count, DB, ROOT, SPACETIME, URI } from "./local.ts";

const ENGINE = ["detect.ts", "planner.ts"].every((f) => existsSync(join(ROOT, "lib", "eog", f)));
const STANDALONE = join(homedir(), ".local", "share", "spacetime", "bin", "2.14.1", "spacetimedb-standalone");
const JWT_DIR = join(homedir(), ".config", "spacetime");   // same keys as the CLI, so its publish token works
const MOCK = join(HISTORY, "mock_test_2026-10-10T1530");

async function waitFor(cond: () => boolean, ms: number, what: string): Promise<number> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 25));
  }
  return Date.now() - t0;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const c = tcpConnect(port, "127.0.0.1");
    c.once("connect", () => { c.destroy(); resolve(true); });
    c.once("error", () => resolve(false));
  });
}

test("a lib/module_bindings subscription to SELECT * FROM alert receives every alert row", async () => {
  const want = count("alert");
  if (ENGINE) assert.ok(want > 0, "run scripts/ingest.mjs first: no alert rows");
  const conn = await new Promise<DbConnection>((resolve, reject) => {
    DbConnection.builder().withUri(URI).withDatabaseName(DB)
      .onConnect((c) => resolve(c as DbConnection))
      .onConnectError((_c, e) => reject(e))
      .build();
  });
  try {
    await new Promise<void>((resolve, reject) => {
      conn.subscriptionBuilder().onApplied(() => resolve()).onError(() => reject(new Error("subscription failed")))
        .subscribe("SELECT * FROM alert");
    });
    const got = [...conn.db.alert.iter()].length;
    console.log(`alert rows: subscription ${got}, spacetime sql ${want}`);
    assert.equal(got, want);
  } finally {
    conn.disconnect();
  }
});

test("stopping the server turns lib/live.ts status to 'disconnected' within 10 s and keeps the last view", {
  skip: !existsSync(STANDALONE) && `no ${STANDALONE}`,
}, async (t) => {
  // A throwaway server (temp data dir) on a free 127.0.0.1 port, so the real one on 3001 keeps running.
  const port = await freePort();
  const dir = mkdtempSync(join(tmpdir(), "avon-throwaway-"));
  const servers: ChildProcess[] = [];
  const startServer = async () => {
    const srv = spawn(STANDALONE, ["start", "--data-dir", dir, "--jwt-key-dir", JWT_DIR,
      "--listen-addr", `127.0.0.1:${port}`, "--non-interactive"], { stdio: "ignore" });
    servers.push(srv);
    const t0 = Date.now();
    while (!(await listening(port))) {
      if (Date.now() - t0 > 15000) throw new Error(`throwaway server did not listen on ${port}`);
      await new Promise((r) => setTimeout(r, 100));
    }
    return srv;
  };
  t.after(() => { for (const s of servers) if (s.exitCode === null && s.signalCode === null) s.kill("SIGKILL"); });
  const srv = await startServer();
  execFileSync(SPACETIME, ["publish", "-s", `http://127.0.0.1:${port}`, DB, "-y", "--module-path", join(ROOT, "spacetimedb")],
    { stdio: ["ignore", "pipe", "pipe"] });

  const statuses: AvonStatus[] = [];
  let view: ConsoleView | null = null;
  const link = connectAvon({
    uri: `ws://127.0.0.1:${port}`,
    onStatus: (s) => statuses.push(s),
    onView: (v) => { view = v; },
  });
  t.after(() => link.close());
  await waitFor(() => statuses.at(-1) === "connected", 10000, "connected");

  if (ENGINE) {
    const r = (f: string) => readFileSync(join(MOCK, f), "utf8");
    await sendDataset(link.connection()!, { network: r("network.json"), ops: r("ops.json"), telemetry: r("telemetry.csv") }, "throwaway");
    await waitFor(() => view !== null, 10000, "the view");
  }
  const last = view;

  srv.kill("SIGKILL");
  await new Promise((r) => srv.once("exit", r));
  const took = await waitFor(() => statuses.at(-1) === "disconnected", 10000, "disconnected");
  console.log(`disconnected ${took} ms after the server stopped`);
  assert.deepEqual(statuses.slice(0, 2), ["connected", "disconnected"]);
  await new Promise((r) => setTimeout(r, 3000));            // stays down a while: retries fail
  assert.equal(statuses.at(-1), "disconnected");
  assert.equal(view, last, "the last view stays on screen");
  if (ENGINE) assert.ok(view, "a view was showing before the stop");
  assert.equal(link.connection(), null, "load() refuses while disconnected");

  // Server back (same data dir): the link reconnects by itself.
  await startServer();
  const back = await waitFor(() => statuses.at(-1) === "connected", 15000, "reconnected");
  console.log(`statuses: ${statuses.join(" -> ")}; reconnected ${back} ms after the restart`);
  assert.ok(link.connection(), "load() works again");
});
