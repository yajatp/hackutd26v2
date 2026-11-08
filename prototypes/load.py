"""Stdlib loader for an EOG dataset folder. Returns (network, ops, ts list, series dict)."""
import json, os, time

def load(folder):
    t0 = time.perf_counter()
    net = json.load(open(os.path.join(folder, 'network.json')))
    ops = json.load(open(os.path.join(folder, 'ops.json')))
    series = {}  # (asset, metric) -> {ts: value}
    tsset = set()
    with open(os.path.join(folder, 'telemetry.csv')) as f:
        header = f.readline()
        for line in f:
            p = line.rstrip('\n').split(',')
            if len(p) < 5:
                continue
            ts = int(p[1])
            key = (p[2], p[3])
            d = series.get(key)
            if d is None:
                d = series[key] = {}
            d[ts] = float(p[4])
            tsset.add(ts)
    ts = sorted(tsset)
    # dense arrays aligned to ts (carry forward missing)
    arr = {}
    for k, d in series.items():
        out = []
        last = None
        for t in ts:
            v = d.get(t, last)
            out.append(v)
            last = v
        arr[k] = out
    t1 = time.perf_counter()
    return net, ops, ts, arr, t1 - t0

def facilities(net):
    for s in net['systems']:
        for f in s['facilities']:
            yield s, f
