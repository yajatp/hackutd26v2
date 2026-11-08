"""EOG "Beat the Shutdown" cost planner prototype (stdlib only).

Units inside the planner: minutes, barrels, dollars. t=0 is the plan start
("now", or the event onset for the full_week reference check).

Rules implemented (from EOG SPEC.md "Plans" and README "The decision"):
- Pump failed => tank fills at the facility inflow (sum of producing wells' water).
- Tank trips at shutdown % of capacity; then all wells shut in until repair end.
- Trucks: all trucks of a plan are called at t=0, arrive together at response_min,
  then every cycle_min. Each trip removes truck_capacity_bbl (capped by volume in
  the tank) and costs cost_per_trip. Every trip must arrive before the repair ends
  and before the tank trips. Truck busy until last arrival + cycle_min.
- Shut-in: instant, may start late, lasts until repair end. Cost = lost revenue/h
  x hours shut. Wells are ranked by cost per bbl avoided = rev/day / baseline water.
- Do nothing: cost = facility lost revenue/h x (repair end - trip time).
- Concurrent failures in a system share the fleet; a truck serves one facility.
"""
from __future__ import annotations

import itertools
import json
import math
import os
from dataclasses import dataclass, field

EPS = 1e-9


# ---------------------------------------------------------------- data model
@dataclass
class Well:
    id: str
    water_bpd: float      # rate used for the tank model and cost-per-bbl ranking
    rev_per_day: float    # oil_bpd*oil_price + gas_mcfd*gas_price

    @property
    def water_pm(self):   # bbl per minute
        return self.water_bpd / 1440.0

    @property
    def rev_pm(self):     # $ per minute
        return self.rev_per_day / 1440.0

    @property
    def cost_per_bbl(self):
        return self.rev_per_day / self.water_bpd if self.water_bpd > 0 else math.inf


@dataclass
class Facility:
    id: str
    system: str
    capacity_bbl: float
    wells: list
    response_min: float
    cycle_min: float

    @property
    def inflow_pm(self):
        return sum(w.water_pm for w in self.wells)

    @property
    def rev_pm(self):
        return sum(w.rev_pm for w in self.wells)


@dataclass
class Network:
    facilities: dict           # id -> Facility
    fleet: dict                # system -> fleet size
    shutdown_pct: float
    truck_cap: float
    trip_cost: float
    repair_min: float


def load_network(folder: str) -> Network:
    with open(os.path.join(folder, "network.json")) as f:
        net = json.load(f)
    with open(os.path.join(folder, "ops.json")) as f:
        ops = json.load(f)
    oil = ops["prices"]["oil_per_bbl"]
    gas = ops["prices"]["gas_per_mcf"]
    facs = {}
    for s in net["systems"]:
        sops = ops["systems"][s["id"]]
        for fa in s["facilities"]:
            fo = sops["facilities"][fa["id"]]
            wells = [Well(w["id"], float(w["baseline_water_bpd"]),
                          w["oil_bpd"] * oil + w["gas_mcfd"] * gas) for w in fa["wells"]]
            facs[fa["id"]] = Facility(fa["id"], s["id"], float(fa["tank"]["capacity_bbl"]),
                                      wells, float(fo["response_min"]), float(fo["cycle_min"]))
    return Network(
        facilities=facs,
        fleet={k: v["emergency_fleet_size"] for k, v in ops["systems"].items()},
        shutdown_pct=float(net["defaults"]["tank_limits_pct"]["shutdown"]),
        truck_cap=float(ops["emergency_trucking"]["truck_capacity_bbl"]),
        trip_cost=float(ops["emergency_trucking"]["cost_per_trip"]),
        repair_min=float(ops["expected_repair_hours"]["pump_failure"]) * 60.0,
    )


# ---------------------------------------------------------------- one failure
@dataclass
class Failure:
    """A pump failure to plan, as seen at plan start (t=0)."""
    event_id: str
    facility: Facility
    level_pct: float
    horizon_min: float          # repair time remaining at plan start
    wells_override: list | None = None   # e.g. live water rates from telemetry

    @property
    def wells(self):
        return self.wells_override if self.wells_override is not None else self.facility.wells


@dataclass
class Plan:
    event_id: str
    kind: str                   # "none_needed" | "trucks" | "shut_in" | "mix" | "do_nothing" | "infeasible"
    trucks: int = 0
    trips_per_truck: int = 0
    shut_ins: list = field(default_factory=list)   # [(well_id, start_min)]
    cost: float = 0.0
    truck_cost: float = 0.0
    shut_in_cost: float = 0.0
    trip_at_min: float | None = None              # no-action trip time
    peak_pct: float | None = None                  # peak level under this plan
    busy_until_min: float | None = None            # trucks free again (plan-relative)

    def label(self):
        if self.kind == "none_needed":
            return f"none (peaks ~{self.peak_pct:.1f}%, never trips)"
        if self.kind == "do_nothing":
            return f"do nothing / accept trip (~${self.cost:,.0f})"
        parts = []
        if self.trucks:
            parts.append(f"{self.trucks} truck{'s' if self.trucks > 1 else ''}, "
                         f"{self.trips_per_truck} trip{'s' if self.trips_per_truck > 1 else ''}"
                         f"{' each' if self.trucks > 1 else ''}")
        for wid, st in self.shut_ins:
            parts.append(f"shut in {wid} at +{st:g} min")
        return " + ".join(parts) + f" (~${self.cost:,.0f})"


def simulate(fail: Failure, net: Network, trucks: int, trips: int, shut_ins: dict,
             check_trip: bool = True):
    """Exact event simulation. shut_ins: well_id -> start minute.
    Returns (ok, peak_volume, removed_list, reason). ok means never reaches shutdown
    before repair end, every trip arrives before trip and before repair end."""
    fac = fail.facility
    H = fail.horizon_min
    vmax = net.shutdown_pct / 100.0 * fac.capacity_bbl
    v = fail.level_pct / 100.0 * fac.capacity_bbl
    wells = fail.wells
    arrivals = [fac.response_min + k * fac.cycle_min for k in range(trips)] if trucks else []
    # breakpoints where the inflow rate changes or water is removed
    pts = sorted(set([0.0, H] + [s for s in shut_ins.values() if 0 <= s <= H] + arrivals))
    t = 0.0
    peak = v
    removed = []

    def rate(at):
        return sum(w.water_pm for w in wells if not (w.id in shut_ins and shut_ins[w.id] <= at + EPS))

    for p in pts:
        if p > H + EPS:
            break
        dt = p - t
        r = rate(t)
        if dt > 0:
            v += r * dt
            peak = max(peak, v)
            if check_trip and v >= vmax - 1e-7:
                return False, peak, removed, f"trips before t={p:.0f}"
        t = p
        if p in arrivals:
            if p >= H - EPS:
                return False, peak, removed, "trip arrives after repair end"
            take = min(trucks * net.truck_cap, v)
            v -= take
            removed.append(take)
    return v < vmax - 1e-7, peak, removed, ""


def no_action_trip_min(fail: Failure, net: Network):
    fac = fail.facility
    head = net.shutdown_pct / 100.0 * fac.capacity_bbl - fail.level_pct / 100.0 * fac.capacity_bbl
    q = sum(w.water_pm for w in fail.wells)
    return head / q if q > 0 else math.inf


def _round_start(t):
    """Largest whole minute STRICTLY before the exact latest start. The key treats
    touching shutdown exactly as a trip (EVENT_21: exact 52.000 -> key +51)."""
    return max(0.0, math.ceil(round(t, 6)) - 1)


def complete_with_shut_ins(fail: Failure, net: Network, trucks: int, trips: int):
    """Given a truck schedule, add the cheapest shut-ins so the tank never trips.
    Returns (shut_ins {well_id: start_min}, ok).

    Step 1 (fast path, exact when it is feasible): fractional knapsack on cost per
    bbl avoided against the end-of-repair constraint only, each well as late as
    possible. If the simulation passes, this is optimal (it solves a relaxation).
    Step 2 (tank would trip before a truck arrives): enumerate, per well, which
    interval between truck arrivals its shut-in starts in (or not shut). For a fixed
    assignment the constraints are nested covering constraints in z_i = bbl avoided
    by well i through repair end, with cost rho_i = rev/day / water per bbl; inner-
    first cheapest-rho greedy is optimal for nested covering. (K+1)^W assignments,
    K = trips + 1 checkpoints, W = wells (3 here: <= 64 per truck option)."""
    fac = fail.facility
    H = fail.horizon_min
    vmax = net.shutdown_pct / 100.0 * fac.capacity_bbl
    v0 = fail.level_pct / 100.0 * fac.capacity_bbl
    wells = sorted(fail.wells, key=lambda w: w.cost_per_bbl)
    q = sum(w.water_pm for w in wells)
    _, _, removed, _ = simulate(fail, net, trucks, trips, {}, check_trip=False)
    # ---- step 1
    deficit = v0 + q * H - sum(removed) - vmax
    shut = {}
    for w in wells:
        if deficit <= 1e-7:
            break
        if w.water_pm <= 0:
            continue
        start = _round_start(H - deficit / w.water_pm)
        shut[w.id] = start
        deficit -= w.water_pm * (H - start)
    if simulate(fail, net, trucks, trips, shut)[0]:
        return shut, True
    # ---- step 2
    arrivals = [fac.response_min + k * fac.cycle_min for k in range(trips)] if trucks else []
    C = arrivals + [H]
    K = len(C)
    need = []
    for k in range(K):
        before = sum(removed[:k]) if k < K - 1 else sum(removed)
        need.append(v0 + q * C[k] - before - vmax + 1e-6)
    W = [w for w in wells if w.water_pm > 0]
    cands = []
    for assign in itertools.product(range(-1, K), repeat=len(W)):
        z, lo, hi = [], [], []
        for w, sl in zip(W, assign):
            if sl < 0:
                lo.append(0.0); hi.append(0.0)
            else:
                lo.append(w.water_pm * (H - C[sl]))
                hi.append(w.water_pm * (H - (C[sl - 1] if sl > 0 else 0.0)))
        z = lo[:]
        ok = True
        for k in range(K):
            mem = [i for i, sl in enumerate(assign) if 0 <= sl <= k]
            N = need[k] + sum(W[i].water_pm * (H - C[k]) for i in mem)
            cur = sum(z[i] for i in mem)
            for i in mem:          # W is already sorted cheapest rho first
                if cur >= N:
                    break
                add = min(hi[i] - z[i], N - cur)
                z[i] += add
                cur += add
            if cur < N - 1e-9:
                ok = False
                break
        if not ok:
            continue
        st = {}
        for w, zi in zip(W, z):
            if zi > 1e-9:
                st[w.id] = _round_start(H - zi / w.water_pm)
        cost = sum(w.rev_pm * (H - st[w.id]) for w in W if w.id in st)
        cands.append((cost, st))
    for cost, st in sorted(cands, key=lambda c: c[0]):
        if simulate(fail, net, trucks, trips, st)[0]:
            return st, True
    return shut, False


def max_trips(fac: Facility, H: float):
    if fac.response_min >= H:
        return 0
    return int(math.floor((H - fac.response_min - EPS) / fac.cycle_min)) + 1


def options_for(fail: Failure, net: Network, trucks_avail: int):
    """All candidate plans for one failure, keyed by trucks used."""
    fac = fail.facility
    H = fail.horizon_min
    T = no_action_trip_min(fail, net)
    opts = []
    if T > H + EPS:   # reaching shutdown exactly at repair end counts as a trip (strict)
        q = sum(w.water_pm for w in fail.wells)
        peak = (fail.level_pct / 100 * fac.capacity_bbl + q * H) / fac.capacity_bbl * 100
        opts.append(Plan(fail.event_id, "none_needed", trip_at_min=None, peak_pct=peak))
        return opts
    # do nothing / accept the trip
    dn = fac.rev_pm * (H - T)
    opts.append(Plan(fail.event_id, "do_nothing", cost=dn, trip_at_min=T))
    M = max_trips(fac, H)
    for n in range(0, trucks_avail + 1):
        for m in ([0] if n == 0 else range(1, M + 1)):
            shut, ok = complete_with_shut_ins(fail, net, n, m)
            if not ok:
                continue
            sc = sum(w.rev_pm * (H - shut[w.id]) for w in fail.wells if w.id in shut)
            tc = n * m * net.trip_cost
            kind = ("mix" if n and shut else "trucks" if n else "shut_in")
            busy = (fac.response_min + (m - 1) * fac.cycle_min + fac.cycle_min) if n else None
            opts.append(Plan(fail.event_id, kind, trucks=n, trips_per_truck=m,
                             shut_ins=sorted(shut.items(), key=lambda kv: kv[1]),
                             cost=tc + sc, truck_cost=tc, shut_in_cost=sc,
                             trip_at_min=T, busy_until_min=busy))
    return opts


def _key(combo):
    cost = sum(p.cost for p in combo)
    trucks = sum(p.trucks for p in combo)
    trips = sum(p.trucks * p.trips_per_truck for p in combo)
    # tie-breaks: cheapest, then fewest trucks tied up, then fewest trips
    return (round(cost, 2), trucks, trips)


def plan_joint(fails: list, net: Network, trucks_avail: int):
    """Jointly plan concurrent failures in one system (brute force over truck splits)."""
    per = [options_for(f, net, trucks_avail) for f in fails]
    best = None
    n_combos = 0
    for combo in itertools.product(*per):
        if sum(p.trucks for p in combo) > trucks_avail:
            continue
        n_combos += 1
        if best is None or _key(combo) < _key(best):
            best = combo
    return list(best), n_combos


def plan_sequential(fails_with_onset: list, net: Network):
    """full_week mode: plan each failure at its onset, in onset order, assuming earlier
    plans were followed (trucks busy until back from their last trip).
    fails_with_onset: list of (onset_abs_min, Failure)."""
    busy = {}   # system -> list of absolute busy-until minutes
    out = []
    for onset, f in sorted(fails_with_onset, key=lambda x: x[0]):
        sys_id = f.facility.system
        fleet = net.fleet[sys_id]
        busy_list = [b for b in busy.get(sys_id, []) if b > onset + EPS]
        free = fleet - len(busy_list)
        (p,), _ = plan_joint([f], net, free)
        p.free_trucks = free
        if p.trucks:
            busy_list += [onset + p.busy_until_min] * p.trucks
        busy[sys_id] = busy_list
        out.append(p)
    return out
