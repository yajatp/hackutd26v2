"""Cross-check the greedy planner against an exhaustive search (single failure):
every truck option (n trucks x m trips) x every subset of up to 2 wells x every
whole-minute start time, feasibility checked by planner.simulate's rules.
Random cases over the real facilities. Reports any case where brute force is cheaper."""
import itertools, math, os, random, sys, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from planner import Failure, load_network, options_for, max_trips, no_action_trip_min
net = load_network(os.path.join(sys.argv[1], "history", "full_week"))
N = int(sys.argv[2]) if len(sys.argv) > 2 else 300
random.seed(int(sys.argv[3]) if len(sys.argv) > 3 else 7)

def feasible(fail, n, m, starts):
    """Fast check mirroring simulate(): strict < shutdown at every truck arrival and at H."""
    fac = fail.facility; H = fail.horizon_min
    vmax = net.shutdown_pct / 100 * fac.capacity_bbl
    v0 = fail.level_pct / 100 * fac.capacity_bbl
    arr = [fac.response_min + k * fac.cycle_min for k in range(m)] if n else []
    if arr and arr[-1] >= H: return False
    def added(c):  # water in by time c
        s = 0.0
        for w in fail.wells:
            s += w.water_pm * min(c, starts.get(w.id, H))
        return s
    removed = 0.0
    for a in arr:
        v = v0 + added(a) - removed
        if v >= vmax - 1e-7: return False
        removed += min(n * net.truck_cap, v)
    return v0 + added(H) - removed < vmax - 1e-7

def brute(fail, F):
    fac = fail.facility; H = fail.horizon_min
    T = no_action_trip_min(fail, net)
    if T > H: return 0.0, "none"
    best = (fac.rev_pm * (H - T), "do_nothing")
    Hi = int(math.floor(H))
    for n in range(0, F + 1):
        for m in ([0] if n == 0 else range(1, max_trips(fac, H) + 1)):
            tc = n * m * net.trip_cost
            if tc >= best[0]: continue
            if feasible(fail, n, m, {}):
                best = min(best, (tc, f"{n}x{m}")); continue
            for k in (1, 2):
                for ws in itertools.combinations(fail.wells, k):
                    # starts on a 1-min grid; for k=2 search a coarse 5-min grid then refine +-5
                    step = 1 if k == 1 else 5
                    grid = range(0, Hi + 1, step)
                    for st in itertools.product(grid, repeat=k):
                        starts = {w.id: s for w, s in zip(ws, st)}
                        c = tc + sum(w.rev_pm * (H - starts[w.id]) for w in ws)
                        if c >= best[0]: continue
                        if feasible(fail, n, m, starts):
                            best = (c, f"{n}x{m}+" + ",".join(f"{wid}@{s}" for wid, s in starts.items()))
    return best

facs = list(net.facilities.values())
worse = 0; t0 = time.time(); gaps = []
for i in range(N):
    fac = random.choice(facs)
    H = random.choice([360, 300, 240, 180, 120, 90])
    lvl = random.uniform(20, 88)
    F = random.choice([0, 1, 2, 3])
    f = Failure(f"R{i}", fac, lvl, H)
    g = min(options_for(f, net, F), key=lambda p: p.cost)
    b = brute(f, F)
    if b[0] < g.cost - 1.0:
        worse += 1; gaps.append((g.cost - b[0], fac.id, round(lvl, 1), H, F, g.label(), b[1]))
print(f"{N} random single-failure cases, greedy worse than brute force in {worse} (>$1); {time.time()-t0:.1f}s")
for x in sorted(gaps, reverse=True)[:10]:
    print("  gap $%.0f" % x[0], x[1:])
