// Reconnect check for lib/darkroom-live.ts, the store behind /box and /witness.
//
//   npx tsx spacetimedb-darkroom/test/reconnect.ts
//
// Runs the real store headless against ws://127.0.0.1:3001 (database 'darkroom'),
// drops its socket from the client side (like Wi-Fi or a phone screen lock), and
// checks that the screen goes back to 'live' after the SDK reconnects by itself,
// and that a write reaches the box again (the server answers 'not a member' for
// this throwaway identity instead of the screen saying 'Not connected to the box.').
// Nothing is written to the log. The shared server is not restarted.

export {};

// A minimal browser window: the SDK listens on it for focus/online/pageshow.
const memory = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = Object.assign(new EventTarget(), {
  location: { hostname: '127.0.0.1' },
  localStorage: {
    getItem: (k: string) => memory.get(k) ?? null,
    setItem: (k: string, v: string) => void memory.set(k, v),
    removeItem: (k: string) => void memory.delete(k),
  },
});

// Keep a handle on every socket the SDK opens, so the test can drop one.
const sockets: WebSocket[] = [];
const NativeWS = globalThis.WebSocket;
globalThis.WebSocket = class TrackedWebSocket extends NativeWS {
  constructor(url: string | URL, protocols?: string | string[]) {
    super(url, protocols);
    sockets.push(this);
  }
} as typeof WebSocket;

const { darkroom } = await import('../../lib/darkroom-live.ts');

const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(2).padStart(6)}s`;
let failures = 0;
function check(ok: boolean, label: string, detail = '') {
  console.log(`${stamp()}  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

let last = '';
darkroom.subscribe(() => {
  const s = darkroom.snapshot();
  const line = `connection=${s.connection} ready=${s.ready} status=${s.status.text}${s.error ? ` error=${s.error}` : ''}`;
  if (line !== last) console.log(`${stamp()}  ${line}`);
  last = line;
});

function waitFor(pred: () => boolean, ms: number): Promise<boolean> {
  return new Promise(resolve => {
    const t = setInterval(() => {
      if (pred()) { clearInterval(t); resolve(true); }
    }, 50);
    setTimeout(() => { clearInterval(t); resolve(pred()); }, ms);
  });
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const first = await waitFor(() => darkroom.snapshot().connection === 'live' && darkroom.snapshot().ready, 10_000);
check(first, 'store connects and subscribes', `${darkroom.snapshot().events.length} log rows`);
if (!first) process.exit(1);
const statusBefore = darkroom.snapshot().status.text;
const socketsBefore = sockets.length;

console.log(`${stamp()}  dropping the socket from the client side`);
sockets[sockets.length - 1].close(1000, 'test drop');

const wentOffline = await waitFor(() => darkroom.snapshot().connection === 'offline', 5_000);
check(wentOffline, 'screen shows offline after the drop');

const back = await waitFor(() => darkroom.snapshot().connection === 'live', 15_000);
check(back, "screen is 'live' again after the SDK reconnects", `sockets opened: ${sockets.length - socketsBefore} new, state=${darkroom.snapshot().connection}`);
check(darkroom.snapshot().error === null, 'error cleared after reconnect', String(darkroom.snapshot().error));

await waitFor(() => darkroom.snapshot().status.text === statusBefore, 5_000);
check(darkroom.snapshot().status.text === statusBefore, 'chain status unchanged by the reconnect', darkroom.snapshot().status.text);

try {
  await darkroom.append('INC-none', 'chat', { text: 'reconnect probe' });
  check(false, 'write reaches the box after reconnect', 'a throwaway identity was allowed to write');
} catch (e) {
  const m = message(e);
  check(!m.includes('Not connected') && m.includes('not a member'), 'write reaches the box after reconnect', m);
}

console.log(failures === 0 ? 'RECONNECT OK' : `RECONNECT FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
