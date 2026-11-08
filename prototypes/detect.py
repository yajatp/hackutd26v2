"""Darkroom EOG detector prototype (stdlib only). Port target: TypeScript.

Usage: python3 -I detect.py <dataset_folder> [--json out.json]

Rules (all thresholds are in noise units estimated from the data itself, offsets
relative to network.json disposal pressure; nothing keyed to S1..S5):
  pump_failure     : pump status == 2. Onset = first ts of the run, end = first ts after.
                     Fallback (status not 2): status != 1 AND level > start_level_pct + 1.5.
  pump_degradation : while pump running, D = mean_W[(zFlow + zDischarge)/2] < -T
  pipeline_leak    : while pump running, L = mean_W[(zPipePressure + zRecvLoss)/2] < -T
  Onset of slow events: hinge fit (zero before t0, a + b(t - t0) after) over lookback.
"""
import json, os, sys, time

import os as _os0
W = int(_os0.environ.get('W', 12))   # running samples in rolling window (1 h of pump-on time)
T_ON = float(_os0.environ.get('T_ON', 1.5))  # trigger: window mean z below -T_ON  (window-mean noise sd ~0.2)
T_OFF = 0.5       # clear: mean of last K_CLEAR running samples above -T_OFF and none below -T_ON
K_CLEAR = int(_os0.environ.get('K_CLEAR', 3))
LOOKBACK_H = 48   # hinge fit lookback
STEP = 300
import os as _os
END_MODE = _os.environ.get('END_MODE', 'mid')
ONSET_MODE = _os.environ.get('ONSET_MODE', 'fit')
def END_PICK(lo, hi):
    return {'lo': lo, 'hi': hi, 'mid': (lo + hi) // 2 // STEP * STEP}[END_MODE]

def load(folder):
    t0 = time.perf_counter()
    net = json.load(open(os.path.join(folder, 'network.json')))
    ops = json.load(open(os.path.join(folder, 'ops.json')))
    series = {}
    tsset = set()
    with open(os.path.join(folder, 'telemetry.csv')) as f:
        f.readline()
        for line in f:
            p = line.rstrip('\n').split(',')
            if len(p) < 5:
                continue
            t = int(p[1])
            k = (p[2], p[3])
            d = series.get(k)
            if d is None:
                d = series[k] = {}
            d[t] = float(p[4])
            tsset.add(t)
    ts = sorted(tsset)
    arr = {}
    for k, d in series.items():
        out, last = [], None
        for t in ts:
            last = d.get(t, last)
            out.append(last)
        arr[k] = out
    return net, ops, ts, arr, time.perf_counter() - t0

def median(v):
    v = sorted(v); n = len(v)
    return 0.0 if n == 0 else (v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2)

def robust(v):
    m = median(v)
    mad = median([abs(x - m) for x in v])
    return m, max(1.4826 * mad, 1e-9)

def calibrate(net, ts, arr):
    """Network-wide baseline offsets and noise sd, from pump-running samples."""
    dis, pp, fr, rl = [], [], [], []
    for s in net['systems']:
        disp = s['disposal_site']['pressure_psi']
        for f in s['facilities']:
            pid, lid, mx = f['pump']['id'], f['pipeline']['id'], f['pump']['max_flow_bpd']
            S = arr[(pid, 'status')]
            for i in range(len(ts)):
                if S[i] != 1:
                    continue
                fl = arr[(pid, 'flow_bpd')][i]
                if fl <= 0:
                    continue
                dis.append(arr[(pid, 'discharge_psi')][i] - disp)
                pp.append(arr[(lid, 'pressure_psi')][i] - disp)
                fr.append(fl / mx)
                rl.append((arr[(lid, 'receive_flow_bpd')][i] - fl) / fl)
    return {'dis': robust(dis), 'pp': robust(pp), 'flow': robust(fr), 'recv': robust(rl)}

def hinge_fit(pts, ramp_only):
    """pts: [(t, z)] sorted. Model z=0 for t<t0, z=a+b(t-t0) for t>=t0 (a=0 if ramp_only).
    Returns t0 minimizing SSE. Candidates: every 5-min grid point between first and last pt."""
    if not pts:
        return None
    best = (float('inf'), pts[0][0])
    t_first, t_last = pts[0][0], pts[-1][0]
    tot_sq = sum(z * z for _, z in pts)
    for t0 in range(t_first, t_last + 1, STEP):
        pre_sq = 0.0
        xs, ys = [], []
        for t, z in pts:
            if t < t0:
                pre_sq += z * z
            else:
                xs.append((t - t0) / 3600.0); ys.append(z)
        n = len(xs)
        if n < 3:
            continue
        if ramp_only:
            sxx = sum(x * x for x in xs); sxy = sum(x * y for x, y in zip(xs, ys))
            b = sxy / sxx if sxx > 0 else 0.0
            if b > 0:
                b = 0.0
            sse = pre_sq + sum((y - b * x) ** 2 for x, y in zip(xs, ys))
        else:
            mx = sum(xs) / n; my = sum(ys) / n
            sxx = sum((x - mx) ** 2 for x in xs); sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
            b = sxy / sxx if sxx > 0 else 0.0
            a = my - b * mx
            sse = pre_sq + sum((y - a - b * x) ** 2 for x, y in zip(xs, ys))
        # ties (t0 anywhere inside a pump-off gap gives the same SSE) go to the LATEST t0,
        # i.e. the first anomalous running sample
        if sse <= best[0] + 1e-9:
            best = (sse, t0)
    return best[1]

def detect(net, ops, ts, arr):
    cal = calibrate(net, ts, arr)
    lim = net['defaults']['tank_limits_pct']
    events = []
    now = ts[-1]
    for s in net['systems']:
        disp = s['disposal_site']['pressure_psi']
        for f in s['facilities']:
            pid, lid, tid = f['pump']['id'], f['pipeline']['id'], f['tank']['id']
            mx, cap = f['pump']['max_flow_bpd'], f['tank']['capacity_bbl']
            S = arr[(pid, 'status')]
            L = arr[(tid, 'level_pct')]
            # ---------- pump_failure ----------
            i = 0
            n = len(ts)
            while i < n:
                fault = S[i] == 2
                hidden = (S[i] != 1 and S[i] != 2 and L[i] > f['pump']['start_level_pct'] + 1.5)
                if fault or hidden:
                    j = i
                    while j < n and (S[j] == 2 or (S[j] != 1 and L[j] > f['pump']['start_level_pct'] + 1.5)):
                        j += 1
                    ev = {'category': 'pump_failure', 'system_id': s['id'], 'facility_id': f['id'],
                          'asset_id': pid, 'onset_unix': ts[i], 'end_unix': ts[j] if j < n else None,
                          'status': 'resolved' if j < n else 'ongoing',
                          'evidence': ['pump status = 2 (fault)' if fault else 'level above start setpoint but pump not running'],
                          'level_onset_pct': L[i]}
                    # countdown at onset and at now (SPEC formula, pump flow 0)
                    def htl(k, first):
                        # smooth: least-squares level at k over the last <=6 samples of this run, mean inflow
                        a = max(first, k - 5)
                        xs = list(range(a, k + 1)); ys = [L[q] for q in xs]
                        inflow = sum(arr[(f['id'], 'inflow_bpd')][q] for q in xs) / len(xs)
                        if len(xs) >= 3:
                            mxx = sum(xs) / len(xs); myy = sum(ys) / len(ys)
                            b = sum((x - mxx) * (y - myy) for x, y in zip(xs, ys)) / sum((x - mxx) ** 2 for x in xs)
                            lvl = myy + b * (k - mxx)
                        else:
                            lvl = L[k]
                        rate = (inflow - 0.0) / 24.0 / cap * 100.0   # pct per hour, failed pump flow = 0
                        if L[k] >= lim['shutdown'] - 0.01 or lvl >= lim['shutdown']:
                            return 0.0, L[k]
                        return ((lim['shutdown'] - lvl) / rate if rate > 0 else None), lvl
                    h0, _ = htl(i, i)
                    ev['hours_to_limit_at_onset'] = h0
                    ev['trips_at_unix_pred'] = ts[i] + h0 * 3600 if h0 is not None else None
                    if j >= n:
                        hn, lv = htl(n - 1, i)
                        ev['level_pct'] = round(lv, 2)
                        ev['hours_to_limit'] = hn
                    events.append(ev)
                    i = j
                else:
                    i += 1
            # ---------- slow events: degradation and leak ----------
            run_idx = [k for k in range(n) if S[k] == 1 and arr[(pid, 'flow_bpd')][k] > 0]
            zD, zL = [], []
            for k in run_idx:
                fl = arr[(pid, 'flow_bpd')][k]
                zf = (fl / mx - cal['flow'][0]) / cal['flow'][1]
                zd = (arr[(pid, 'discharge_psi')][k] - disp - cal['dis'][0]) / cal['dis'][1]
                zp = (arr[(lid, 'pressure_psi')][k] - disp - cal['pp'][0]) / cal['pp'][1]
                zr = ((arr[(lid, 'receive_flow_bpd')][k] - fl) / fl - cal['recv'][0]) / cal['recv'][1]
                zD.append((zf + zd) / 2); zL.append((zp + zr) / 2)
            for cat, z, asset, ramp_only in (('pump_degradation', zD, pid, True), ('pipeline_leak', zL, lid, False)):
                active = None
                win = []
                for m, k in enumerate(run_idx):
                    # a pump failure ends an active degradation (SPEC: two separate events)
                    if cat == 'pump_degradation' and active is not None:
                        last_k = run_idx[m - 1] if m else k
                        fails = [q for q in range(last_k, k) if S[q] == 2]
                        if fails:
                            active['end_unix'] = ts[fails[0]]; active['status'] = 'resolved'
                            events.append(active); active = None; win = []
                    win.append(z[m])
                    if len(win) > W:
                        win.pop(0)
                    if active is not None and len(win) >= K_CLEAR:
                        tail = win[-K_CLEAR:]
                        if sum(tail) / K_CLEAR > -T_OFF and min(tail) > -T_ON:
                            # end: between the last clearly anomalous running sample and the next one
                            last_bad = max([q for q in range(max(0, m - W), m + 1) if z[q] < -T_ON] or [m - K_CLEAR])
                            end_hi = ts[run_idx[last_bad + 1]]
                            end_lo = ts[run_idx[last_bad]] + STEP
                            active['end_bounds'] = [end_lo, end_hi]
                            active['end_unix'] = END_PICK(end_lo, end_hi)
                            active['status'] = 'resolved'
                            events.append(active); active = None
                            win = win[-K_CLEAR:]
                            continue
                    if len(win) < W:
                        continue
                    mean = sum(win) / W
                    if active is None and mean < -T_ON:
                        # onset by hinge fit over lookback of running samples
                        lo = ts[k] - LOOKBACK_H * 3600
                        pts = [(ts[run_idx[q]], z[q]) for q in range(m + 1) if ts[run_idx[q]] >= lo]
                        # do not look back past the previous event of this kind on this asset
                        prev = [e for e in events if e['asset_id'] == asset and e['category'] == cat]
                        if prev and prev[-1]['end_unix']:
                            pts = [p for p in pts if p[0] >= prev[-1]['end_unix']]
                        # nor past a repair (end of a pump failure) on the same pump
                        reps = [e['end_unix'] for e in events if e['asset_id'] == pid and e['category'] == 'pump_failure' and e['end_unix'] and e['end_unix'] <= ts[k]]
                        if reps:
                            pts = [p for p in pts if p[0] >= max(reps)]
                        floor_t = pts[0][0] if pts else ts[k]
                        if ramp_only:
                            # degradation is a ramp from zero: hinge fit can place t0 inside a pump-off gap
                            t0 = hinge_fit(pts, True)
                        else:
                            # leak is a step: walk back over consecutive anomalous running samples
                            # (allow 1 noisy sample) to the first one seen
                            q = m; skips = 0; first = m
                            while q >= 0 and ts[run_idx[q]] >= floor_t:
                                if z[q] < -T_ON:
                                    first = q; skips = 0
                                else:
                                    skips += 1
                                    if skips > 1:
                                        break
                                q -= 1
                            t0 = ts[run_idx[first]]
                        # observable bounds: t0 lies between the last running sample before it and the first at/after it
                        hi = next(ts[run_idx[q]] for q in range(m + 1) if ts[run_idx[q]] >= t0)
                        lo_c = [ts[run_idx[q]] for q in range(m + 1) if ts[run_idx[q]] < t0]
                        lo = (lo_c[-1] + STEP) if lo_c else ts[0]
                        if ONSET_MODE == 'lo' and not ramp_only: t0 = min(lo, t0)
                        if ONSET_MODE == 'mid' and not ramp_only: t0 = (min(lo, t0) + hi) // 2 // STEP * STEP
                        active = {'category': cat, 'system_id': s['id'], 'facility_id': f['id'], 'asset_id': asset,
                                  'onset_unix': t0, 'onset_bounds': [min(lo, t0), hi], 'detected_unix': ts[k], 'end_unix': None, 'status': 'ongoing',
                                  'evidence': [], 'hours_to_limit': None}
                        if cat == 'pump_degradation':
                            active['evidence'].append('pump flow below max_flow_bpd and discharge pressure below baseline while running')
                        else:
                            active['evidence'].append('pipeline pressure below baseline and receive flow below pump flow while running')
                    elif active is not None and mean > -T_OFF:
                        # end: first running sample after the last clearly anomalous one in the window
                        last_bad = max([q for q in range(m - W + 1, m + 1) if z[q] < -T_ON] or [m - W])
                        end_hi = ts[run_idx[last_bad + 1]]
                        end_lo = ts[run_idx[last_bad]] + STEP
                        active['end_bounds'] = [end_lo, end_hi]
                        active['end_unix'] = END_PICK(end_lo, end_hi)
                        active['status'] = 'resolved'
                        events.append(active); active = None
                if active is not None:
                    # degradation still active but pump currently failed after last running sample
                    if cat == 'pump_degradation' and run_idx:
                        fails = [q for q in range(run_idx[-1], n) if S[q] == 2]
                        if fails:
                            active['end_unix'] = ts[fails[0]]; active['status'] = 'resolved'
                    events.append(active)
    events.sort(key=lambda e: (e['onset_unix'] or 0))
    return events, cal

if __name__ == '__main__':
    folder = sys.argv[1]
    t0 = time.perf_counter()
    net, ops, ts, arr, tparse = load(folder)
    t1 = time.perf_counter()
    ev, cal = detect(net, ops, ts, arr)
    t2 = time.perf_counter()
    print(f'parse {tparse:.2f}s detect {t2 - t1:.2f}s total {t2 - t0:.2f}s  now={ts[-1]}  events={len(ev)}')
    print('calibration (median, sd):', {k: (round(v[0], 4), round(v[1], 4)) for k, v in cal.items()})
    for e in ev:
        print(e['category'], e['asset_id'], e['onset_unix'], e['end_unix'], e['status'],
              'htl_now=%s' % (round(e['hours_to_limit'], 2) if e.get('hours_to_limit') is not None else None))
    if '--json' in sys.argv:
        json.dump(ev, open(sys.argv[sys.argv.index('--json') + 1], 'w'), indent=1)
