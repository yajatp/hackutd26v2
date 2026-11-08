// Live latency probe, used by both databases (avon and darkroom) and both live links.
// A client calls rtt_ping(nonce); the reducer writes (sender, nonce, server time) to the public
// rtt_probe table; the client times the gap until its own row comes back through its
// subscription. That is the full path every screen update takes. Pure: no timers here.

export const RTT_INTERVAL_MS = 5000;   // one ping every 5 s
export const RTT_SAMPLES = 5;          // the badge shows the median of the last 5
export const RTT_KEEP_ROWS = 50;       // the reducer keeps only the newest 50 rows
const RTT_GIVE_UP_MS = 30_000;         // a ping with no row after this is forgotten

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Row ids the reducer deletes so only the newest `keep` remain (ids grow with every insert).
export function rttRowsToDelete(ids: readonly bigint[], keep = RTT_KEEP_ROWS): bigint[] {
  if (ids.length <= keep) return [];
  return [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, ids.length - keep);
}

// Times pings by nonce. sent() before calling rtt_ping, arrived() when this client's row shows up.
export class RttMeter {
  private pending = new Map<number, number>();
  private samples: number[] = [];
  private next: number;

  constructor(firstNonce: number, private readonly onChange: (ms: number | null) => void) {
    this.next = firstNonce >>> 0;
  }

  sent(nowMs: number): number {
    for (const [n, t] of this.pending) if (nowMs - t > RTT_GIVE_UP_MS) this.pending.delete(n);
    const nonce = this.next;
    this.next = (this.next + 1) >>> 0;
    this.pending.set(nonce, nowMs);
    return nonce;
  }

  arrived(nonce: number, nowMs: number) {
    const t = this.pending.get(nonce);
    if (t === undefined) return;
    this.pending.delete(nonce);
    this.samples = [...this.samples, nowMs - t].slice(-RTT_SAMPLES);
    this.onChange(this.value());
  }

  value(): number | null {
    return median(this.samples);
  }

  reset() {
    this.pending.clear();
    if (this.samples.length === 0) return;
    this.samples = [];
    this.onChange(null);
  }
}
