// EOG problem detector, ported line for line from prototypes/detect.py (same thresholds, same
// output). Pure TypeScript: no Node or DOM APIs, no clock, so it runs in the browser, in tests
// and in a SpacetimeDB reducer.
//
//   pump_failure     pump status 2, or not running with the level above its start setpoint.
//   pump_degradation while running, flow and discharge pressure both below baseline (ramp onset).
//   pipeline_leak    while running, pipeline pressure low and receive flow below pump flow (step onset).
// Thresholds are in noise units measured from the dataset itself; nothing is keyed to asset or system names.
import { seriesOf, type Dataset } from "./load.ts";
import type { DetectedEvent, NetworkJson } from "./types.ts";

const W = 12;           // running samples in the rolling window (1 h of pump-on time)
const T_ON = 1.5;       // trigger: window mean z below -T_ON
const T_OFF = 0.5;      // clear: recent running samples back above -T_OFF
const K_CLEAR = 3;
const LOOKBACK_H = 48;  // hinge-fit lookback
const STEP = 300;

const endPick = (lo: number, hi: number) => Math.floor(Math.floor((lo + hi) / 2) / STEP) * STEP;

// Python list indexing: a negative index counts from the end.
const at = <T>(a: ArrayLike<T>, i: number): T => a[i < 0 ? a.length + i : i];

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const n = s.length;
  if (n === 0) return 0;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

type Robust = [number, number];   // [median, robust sd]

function robust(v: number[]): Robust {
  const m = median(v);
  const mad = median(v.map((x) => Math.abs(x - m)));
  return [m, Math.max(1.4826 * mad, 1e-9)];
}

export interface Calibration { dis: Robust; pp: Robust; flow: Robust; recv: Robust }

// Network-wide baseline offsets and noise, from pump-running samples.
export function calibrate(ds: Dataset): Calibration {
  const dis: number[] = [], pp: number[] = [], fr: number[] = [], rl: number[] = [];
  for (const s of ds.network.systems) {
    const disp = s.disposal_site.pressure_psi;
    for (const f of s.facilities) {
      const S = seriesOf(ds, f.pump.id, "status");
      const flow = seriesOf(ds, f.pump.id, "flow_bpd");
      const discharge = seriesOf(ds, f.pump.id, "discharge_psi");
      const pipe = seriesOf(ds, f.pipeline.id, "pressure_psi");
      const recv = seriesOf(ds, f.pipeline.id, "receive_flow_bpd");
      const mx = f.pump.max_flow_bpd;
      for (let i = 0; i < ds.ts.length; i++) {
        if (S[i] !== 1) continue;
        const fl = flow[i];
        if (fl <= 0) continue;
        dis.push(discharge[i] - disp);
        pp.push(pipe[i] - disp);
        fr.push(fl / mx);
        rl.push((recv[i] - fl) / fl);
      }
    }
  }
  return { dis: robust(dis), pp: robust(pp), flow: robust(fr), recv: robust(rl) };
}

// Model z = 0 before t0 and z = a + b(t - t0) after (a = 0 for a ramp). Returns the t0 with the
// least squared error over a 5-minute grid; ties go to the latest t0.
function hingeFit(pts: [number, number][], rampOnly: boolean): number | null {
  if (pts.length === 0) return null;
  let bestSse = Infinity, bestT0 = pts[0][0];
  const tFirst = pts[0][0], tLast = pts[pts.length - 1][0];
  for (let t0 = tFirst; t0 < tLast + 1; t0 += STEP) {
    let preSq = 0;
    const xs: number[] = [], ys: number[] = [];
    for (const [t, z] of pts) {
      if (t < t0) preSq += z * z;
      else { xs.push((t - t0) / 3600); ys.push(z); }
    }
    const n = xs.length;
    if (n < 3) continue;
    let sse = preSq;
    if (rampOnly) {
      let sxx = 0, sxy = 0;
      for (let q = 0; q < n; q++) { sxx += xs[q] * xs[q]; sxy += xs[q] * ys[q]; }
      let b = sxx > 0 ? sxy / sxx : 0;
      if (b > 0) b = 0;
      let e = 0;
      for (let q = 0; q < n; q++) { const r = ys[q] - b * xs[q]; e += r * r; }
      sse += e;
    } else {
      let sx = 0, sy = 0;
      for (let q = 0; q < n; q++) { sx += xs[q]; sy += ys[q]; }
      const mx = sx / n, my = sy / n;
      let sxx = 0, sxy = 0;
      for (let q = 0; q < n; q++) { sxx += (xs[q] - mx) ** 2; sxy += (xs[q] - mx) * (ys[q] - my); }
      const b = sxx > 0 ? sxy / sxx : 0;
      const a = my - b * mx;
      let e = 0;
      for (let q = 0; q < n; q++) { const r = ys[q] - a - b * xs[q]; e += r * r; }
      sse += e;
    }
    if (sse <= bestSse + 1e-9) { bestSse = sse; bestT0 = t0; }
  }
  return bestT0;
}

function systemsOf(net: NetworkJson) {
  return net.systems.flatMap((s) => s.facilities.map((f) => ({ s, f })));
}

export function detect(ds: Dataset): DetectedEvent[] {
  const cal = calibrate(ds);
  const lim = ds.network.defaults.tank_limits_pct;
  const ts = ds.ts;
  const n = ts.length;
  const events: DetectedEvent[] = [];

  for (const { s, f } of systemsOf(ds.network)) {
    const disp = s.disposal_site.pressure_psi;
    const pid = f.pump.id, lid = f.pipeline.id;
    const mx = f.pump.max_flow_bpd, cap = f.tank.capacity_bbl;
    const S = seriesOf(ds, pid, "status");
    const L = seriesOf(ds, f.tank.id, "level_pct");
    const inflow = seriesOf(ds, f.id, "inflow_bpd");
    const flow = seriesOf(ds, pid, "flow_bpd");
    const start = f.pump.start_level_pct;

    // ---------- pump_failure ----------
    // Countdown at tick k: least-squares level over the last <= 6 samples of this run, mean
    // inflow over the same samples, failed pump flow 0.
    const htl = (k: number, first: number): [number | null, number] => {
      const a = Math.max(first, k - 5);
      const xs: number[] = [];
      for (let q = a; q <= k; q++) xs.push(q);
      const ys = xs.map((q) => L[q]);
      const inf = xs.reduce((sum, q) => sum + inflow[q], 0) / xs.length;
      let lvl: number;
      if (xs.length >= 3) {
        const mxx = xs.reduce((u, x) => u + x, 0) / xs.length;
        const myy = ys.reduce((u, y) => u + y, 0) / ys.length;
        let num = 0, den = 0;
        for (let q = 0; q < xs.length; q++) { num += (xs[q] - mxx) * (ys[q] - myy); den += (xs[q] - mxx) ** 2; }
        lvl = myy + (num / den) * (k - mxx);
      } else lvl = L[k];
      const rate = (inf - 0.0) / 24.0 / cap * 100.0;   // pts/h
      if (L[k] >= lim.shutdown - 0.01 || lvl >= lim.shutdown) return [0.0, L[k]];
      return [rate > 0 ? (lim.shutdown - lvl) / rate : null, lvl];
    };
    const failing = (q: number) => S[q] === 2 || (S[q] !== 1 && L[q] > start + 1.5);
    let i = 0;
    while (i < n) {
      if (!failing(i)) { i++; continue; }
      const fault = S[i] === 2;
      let j = i;
      while (j < n && failing(j)) j++;
      const ev: DetectedEvent = {
        category: "pump_failure", system_id: s.id, facility_id: f.id, asset_id: pid,
        onset_unix: ts[i], end_unix: j < n ? ts[j] : null, status: j < n ? "resolved" : "ongoing",
        evidence: [fault ? "pump status = 2 (fault)" : "level above start setpoint but pump not running"],
        level_onset_pct: L[i],
      };
      const [h0] = htl(i, i);
      ev.hours_to_limit_at_onset = h0;
      ev.trips_at_unix_pred = h0 !== null ? ts[i] + h0 * 3600 : null;
      if (j >= n) {
        const [hn, lv] = htl(n - 1, i);
        ev.level_pct = Number(lv.toFixed(2));
        ev.hours_to_limit = hn;
      }
      events.push(ev);
      i = j;
    }

    // ---------- slow events: degradation and leak ----------
    const discharge = seriesOf(ds, pid, "discharge_psi");
    const pipe = seriesOf(ds, lid, "pressure_psi");
    const recv = seriesOf(ds, lid, "receive_flow_bpd");
    const runIdx: number[] = [];
    for (let k = 0; k < n; k++) if (S[k] === 1 && flow[k] > 0) runIdx.push(k);
    const zD: number[] = [], zL: number[] = [];
    for (const k of runIdx) {
      const fl = flow[k];
      const zf = (fl / mx - cal.flow[0]) / cal.flow[1];
      const zd = (discharge[k] - disp - cal.dis[0]) / cal.dis[1];
      const zp = (pipe[k] - disp - cal.pp[0]) / cal.pp[1];
      const zr = ((recv[k] - fl) / fl - cal.recv[0]) / cal.recv[1];
      zD.push((zf + zd) / 2);
      zL.push((zp + zr) / 2);
    }

    const lanes: [DetectedEvent["category"], number[], string, boolean][] = [
      ["pump_degradation", zD, pid, true],
      ["pipeline_leak", zL, lid, false],
    ];
    for (const [cat, z, asset, rampOnly] of lanes) {
      let active: DetectedEvent | null = null;
      let win: number[] = [];
      // end: between the last clearly anomalous running sample and the next one
      const close = (lastBad: number) => {
        const endHi = ts[at(runIdx, lastBad + 1)];
        const endLo = ts[at(runIdx, lastBad)] + STEP;
        active!.end_bounds = [endLo, endHi];
        active!.end_unix = endPick(endLo, endHi);
        active!.status = "resolved";
        events.push(active!);
        active = null;
      };
      for (let m = 0; m < runIdx.length; m++) {
        const k = runIdx[m];
        // a pump failure ends an active degradation (SPEC: two separate events)
        if (cat === "pump_degradation" && active !== null) {
          const lastK = m ? runIdx[m - 1] : k;
          let fail = -1;
          for (let q = lastK; q < k; q++) if (S[q] === 2) { fail = q; break; }
          if (fail >= 0) {
            const a: DetectedEvent = active;
            a.end_unix = ts[fail];
            a.status = "resolved";
            events.push(a);
            active = null;
            win = [];
          }
        }
        win.push(z[m]);
        if (win.length > W) win.shift();
        if (active !== null && win.length >= K_CLEAR) {
          const tail = win.slice(-K_CLEAR);
          if (tail.reduce((u, v) => u + v, 0) / K_CLEAR > -T_OFF && Math.min(...tail) > -T_ON) {
            const bad: number[] = [];
            for (let q = Math.max(0, m - W); q <= m; q++) if (z[q] < -T_ON) bad.push(q);
            close(bad.length ? Math.max(...bad) : m - K_CLEAR);
            win = win.slice(-K_CLEAR);
            continue;
          }
        }
        if (win.length < W) continue;
        const mean = win.reduce((u, v) => u + v, 0) / W;
        if (active === null && mean < -T_ON) {
          // onset by hinge fit over the lookback of running samples
          const lo0 = ts[k] - LOOKBACK_H * 3600;
          let pts: [number, number][] = [];
          for (let q = 0; q <= m; q++) if (ts[runIdx[q]] >= lo0) pts.push([ts[runIdx[q]], z[q]]);
          // not past the previous event of this kind on this asset
          const prev = events.filter((e) => e.asset_id === asset && e.category === cat);
          const prevEnd = prev.length ? prev[prev.length - 1].end_unix : null;
          if (prevEnd) pts = pts.filter((p) => p[0] >= prevEnd);
          // nor past a repair (end of a pump failure) on the same pump
          const reps = events
            .filter((e) => e.asset_id === pid && e.category === "pump_failure" && e.end_unix && e.end_unix <= ts[k])
            .map((e) => e.end_unix as number);
          if (reps.length) { const r = Math.max(...reps); pts = pts.filter((p) => p[0] >= r); }
          const floorT = pts.length ? pts[0][0] : ts[k];
          let t0: number;
          if (rampOnly) {
            // degradation is a ramp from zero: the fit can place t0 inside a pump-off gap
            t0 = hingeFit(pts, true) as number;
          } else {
            // leak is a step: walk back over consecutive anomalous running samples (one noisy
            // sample allowed) to the first one seen
            let q = m, skips = 0, first = m;
            while (q >= 0 && ts[runIdx[q]] >= floorT) {
              if (z[q] < -T_ON) { first = q; skips = 0; }
              else if (++skips > 1) break;
              q--;
            }
            t0 = ts[runIdx[first]];
          }
          // t0 lies between the last running sample before it and the first at/after it
          let hi = NaN, lastBefore: number | null = null;
          for (let q = 0; q <= m; q++) {
            const tq = ts[runIdx[q]];
            if (Number.isNaN(hi) && tq >= t0) hi = tq;
            if (tq < t0) lastBefore = tq;
          }
          const lo = lastBefore !== null ? lastBefore + STEP : ts[0];
          active = {
            category: cat, system_id: s.id, facility_id: f.id, asset_id: asset,
            onset_unix: t0, onset_bounds: [Math.min(lo, t0), hi], detected_unix: ts[k],
            end_unix: null, status: "ongoing", evidence: [], hours_to_limit: null,
          };
          active.evidence.push(cat === "pump_degradation"
            ? "pump flow below max_flow_bpd and discharge pressure below baseline while running"
            : "pipeline pressure below baseline and receive flow below pump flow while running");
        } else if (active !== null && mean > -T_OFF) {
          const bad: number[] = [];
          for (let q = m - W + 1; q <= m; q++) if (z[q] < -T_ON) bad.push(q);
          close(bad.length ? Math.max(...bad) : m - W);
        }
      }
      if (active !== null) {
        const a: DetectedEvent = active;
        // degradation still active but the pump failed after the last running sample
        if (cat === "pump_degradation" && runIdx.length) {
          for (let q = runIdx[runIdx.length - 1]; q < n; q++) {
            if (S[q] === 2) { a.end_unix = ts[q]; a.status = "resolved"; break; }
          }
        }
        events.push(a);
      }
    }
  }
  // stable sort, as Python's list.sort
  return events
    .map((e, idx) => ({ e, idx }))
    .sort((x, y) => (x.e.onset_unix || 0) - (y.e.onset_unix || 0) || x.idx - y.idx)
    .map((x) => x.e);
}
