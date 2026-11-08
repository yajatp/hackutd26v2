"""Validate planner.py against README's opening scene and every answer key.

Usage: python3 -I validate.py <eog repo path> [--telemetry]
--telemetry: also re-run using level + live well water read from telemetry.csv
             (what the real app will have) instead of the key's onset facts.
"""
import csv
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from planner import Failure, Well, load_network, plan_joint, plan_sequential  # noqa: E402

REPO = sys.argv[1]
USE_TELEM = "--telemetry" in sys.argv
HIST = os.path.join(REPO, "history")
SNAPS = ["snapshot_2026-10-08T1200", "snapshot_2026-10-09T0330", "snapshot_2026-10-10T0900"]


def parse_ref(s):
    s0 = s
    r = {"raw": s0, "trucks": 0, "trips": 0, "shut": [], "cost": None, "none": False}
    if s.startswith("none"):
        r["none"] = True
        r["cost"] = 0.0
        return r
    m = re.search(r"(\d+) trucks?, (\d+) trips?", s)
    if m:
        r["trucks"], r["trips"] = int(m.group(1)), int(m.group(2))
    for m in re.finditer(r"shut in (\S+) at \+(\d+) min", s):
        r["shut"].append((m.group(1), int(m.group(2))))
    m = re.search(r"~\$([\d,]+)", s)
    if m:
        r["cost"] = float(m.group(1).replace(",", ""))
    return r


def compare(plan, ref):
    """Return (match, reasons). Match = same trucks, trips, wells, start within 1 min,
    cost within $5."""
    reasons = []
    if ref["none"]:
        if plan.kind != "none_needed":
            reasons.append(f"key says none; planner {plan.kind}")
        return not reasons, reasons
    if plan.trucks != ref["trucks"]:
        reasons.append(f"trucks {plan.trucks} vs key {ref['trucks']}")
    if plan.trucks and plan.trips_per_truck != ref["trips"]:
        reasons.append(f"trips {plan.trips_per_truck} vs key {ref['trips']}")
    pw = {w: s for w, s in plan.shut_ins}
    kw = dict(ref["shut"])
    if set(pw) != set(kw):
        reasons.append(f"wells {sorted(pw)} vs key {sorted(kw)}")
    else:
        for w in kw:
            if abs(pw[w] - kw[w]) > 1:
                reasons.append(f"{w} start +{pw[w]:g} vs key +{kw[w]}")
    if ref["cost"] is not None and abs(plan.cost - ref["cost"]) > 5:
        reasons.append(f"cost ${plan.cost:,.0f} vs key ${ref['cost']:,.0f}")
    return not reasons, reasons


# ---------------------------------------------------------------- telemetry
_telem_cache = {}


def telemetry_lookup(folder, wanted):
    """wanted: set of (asset, metric). Returns {(asset, metric): {ts_unix: value}}."""
    key = (folder, frozenset(wanted))
    if key in _telem_cache:
        return _telem_cache[key]
    out = {k: {} for k in wanted}
    with open(os.path.join(folder, "telemetry.csv"), newline="") as f:
        rd = csv.reader(f)
        next(rd)
        for row in rd:
            k = (row[2], row[3])
            if k in out:
                out[k][int(row[1])] = float(row[4])
    _telem_cache[key] = out
    return out


def telem_failure(folder, net, ev_id, fac, t_unix, horizon, avg_n=12):
    """Level at t_unix and mean live well water over the prior avg_n readings.
    The wells' live water rates replace baseline for the tank model; ranking still
    uses rev/day / live water."""
    wanted = {(fac.id.replace("FACILITY", "TANK"), "level_pct")}
    for w in fac.wells:
        wanted.add((w.id, "water_bpd"))
    tl = telemetry_lookup(folder, wanted)
    lvl = tl[(fac.id.replace("FACILITY", "TANK"), "level_pct")][t_unix]
    wells = []
    for w in fac.wells:
        ser = tl[(w.id, "water_bpd")]
        vals = [ser[t] for t in range(t_unix - 300 * (avg_n - 1), t_unix + 1, 300) if t in ser]
        wells.append(Well(w.id, sum(vals) / len(vals), w.rev_per_day))
    return Failure(ev_id, fac, lvl, horizon, wells_override=wells), lvl


# ---------------------------------------------------------------- checks
def check_opening_scene(net):
    fac = net.facilities["S1_FACILITY_C"]
    f = Failure("EVENT_9", fac, 50.0, net.repair_min)
    from planner import options_for
    opts = options_for(f, net, net.fleet["S1"])
    dn = [o for o in opts if o.kind == "do_nothing"][0]
    shut_only = min((o for o in opts if o.kind == "shut_in"), key=lambda o: o.cost)
    truck = min((o for o in opts if o.kind == "trucks"), key=lambda o: o.cost)
    onset = dt.datetime(2026, 10, 8, 0, 20)
    hm = lambda m: (onset + dt.timedelta(minutes=m)).strftime("%H:%M:%S")
    print("== README opening scene (EVENT_9, S1_FACILITY_C, 50%, 75 bbl/h)")
    print(f"  do nothing : trips {hm(dn.trip_at_min)}  cost ${dn.cost:,.2f}   README $5,016 @04:49")
    print(f"  shut-in    : {shut_only.shut_ins} start {hm(shut_only.shut_ins[0][1])}"
          f"  cost ${shut_only.cost:,.2f}   README S1_WELL_C2 @02:25 $1,958")
    print(f"  truck      : {truck.trucks}x{truck.trips_per_truck} arrives "
          f"{hm(net.facilities['S1_FACILITY_C'].response_min)} cost ${truck.cost:,.2f}   README $905 @01:35")
    ok = (abs(dn.cost - 5016) < 1 and shut_only.shut_ins[0][0] == "S1_WELL_C2"
          and abs(shut_only.cost - 1958) < 1 and abs(truck.cost - 905) < 1)
    best, _ = plan_joint([f], net, net.fleet["S1"])
    print(f"  planner pick: {best[0].label()}  -> {'PASS' if ok and best[0].cost == 905 else 'FAIL'}")
    return ok


def check_full_week(net, use_telem=False):
    folder = os.path.join(HIST, "full_week")
    key = json.load(open(os.path.join(folder, "answer_key.json")))
    pf = [e for e in key if e["category"] == "pump_failure"]
    t0 = min(e["onset_unix"] for e in key)
    items = []
    for e in pf:
        fac = net.facilities[e["facility"]]
        if use_telem:
            f, lvl = telem_failure(folder, net, e["id"], fac, e["onset_unix"], net.repair_min)
        else:
            f = Failure(e["id"], fac, float(e["level_pct"]), net.repair_min)
        items.append(((e["onset_unix"] - t0) / 60.0, f))
    plans = {p.event_id: p for p in plan_sequential(items, net)}
    res = []
    for e in pf:
        p = plans[e["id"]]
        ref = parse_ref(e["reference_action"])
        ok, why = compare(p, ref)
        # trip-time check vs key
        trip_ok = ""
        if e.get("trips_at_unix") and p.trip_at_min is not None:
            d = (e["onset_unix"] + p.trip_at_min * 60) - e["trips_at_unix"]
            trip_ok = f"trip dt {d/60:+.1f} min"
        res.append((e["id"], ok, p, ref, why, trip_ok, getattr(p, "free_trucks", None)))
    return res


def check_snapshot(net, snap, use_telem=False):
    folder = os.path.join(HIST, snap)
    key = json.load(open(os.path.join(folder, "answer_key.json")))
    now = dt.datetime.strptime(snap.split("_")[1], "%Y-%m-%dT%H%M").replace(tzinfo=dt.timezone.utc)
    now_unix = int(now.timestamp())
    ongoing = [e for e in key if e["category"] == "pump_failure" and e["status"] == "ongoing"]
    by_sys = {}
    for e in ongoing:
        fac = net.facilities[e["facility"]]
        H = e["onset_unix"] / 60 + net.repair_min - now_unix / 60
        if use_telem:
            f, lvl = telem_failure(folder, net, e["id"], fac, now_unix, H)
        else:
            f = Failure(e["id"], fac, float(e["level_final_pct"]), H)
        by_sys.setdefault(e["system"], []).append((e, f))
    res = []
    for sys_id, lst in by_sys.items():
        plans, n_combos = plan_joint([f for _, f in lst], net, net.fleet[sys_id])
        for (e, f), p in zip(lst, plans):
            ref = parse_ref(e["reference_action"])
            ok, why = compare(p, ref)
            htl = ""
            if p.trip_at_min is not None:
                htl = f"h_to_limit {p.trip_at_min/60:.2f} vs key {e['hours_to_limit_final']}"
            res.append((e["id"], ok, p, ref, why, htl, f"joint over {n_combos} combos"))
    return res


def main():
    net = load_network(os.path.join(HIST, "full_week"))
    scene_ok = check_opening_scene(net)
    modes = [False, True] if USE_TELEM else [False]
    for tel in modes:
        tag = "TELEMETRY inputs" if tel else "KEY onset facts as inputs"
        total = good = 0
        print(f"\n######## {tag}")
        print("== full_week (sequential, planned at each onset)")
        for eid, ok, p, ref, why, extra, free in check_full_week(net, tel):
            total += 1
            good += ok
            print(f"  {'OK  ' if ok else 'MISS'} {eid:9} free={free} planner: {p.label():60} | key: {ref['raw']}")
            if extra:
                print(f"       {extra}")
            for w in why:
                print(f"       ! {w}")
        for snap in SNAPS:
            print(f"== {snap} (joint from now)")
            for eid, ok, p, ref, why, extra, note in check_snapshot(net, snap, tel):
                total += 1
                good += ok
                print(f"  {'OK  ' if ok else 'MISS'} {eid:9} planner: {p.label():60} | key: {ref['raw']}")
                print(f"       {extra}; {note}")
                for w in why:
                    print(f"       ! {w}")
        print(f"\nMATCH ({tag}): {good}/{total}  + opening scene {'PASS' if scene_ok else 'FAIL'}")


if __name__ == "__main__":
    main()
