"use client";
// One hook that runs the attack moment from the live tanks: it diffs each new snapshot
// (diffFaults), keeps the notice log for <Toast>, bumps a per-facility counter for <Shockwave>,
// says which tanks are faked right now (<AlarmBeacon>, <GlitchGauge>) and plays one chirp per
// batch. Nothing fires for the first snapshot, so loading a site is quiet.
//   const fx = useAttackFx(states, { confirmed: confirmedFacilities(view, confirmations), muted });
import { useEffect, useMemo, useRef, useState } from "react";
import type { TankState } from "../model";
import { armAudioOnGesture, chirp } from "./audio";
import { diffFaults, fakedIds, loudest, type FxNotice } from "./events";

const LOG_MAX = 12;

export interface AttackFx {
  notices: FxNotice[];                       // newest last: <Toast events={fx.notices} />
  waves: Readonly<Record<string, number>>;   // by facility: <Shockwave trigger={fx.waves[id] ?? 0} />
  faked: ReadonlySet<string>;                // facilities whose tank reads SIMULATED now
  latest: FxNotice | null;
}

export function useAttackFx(states: readonly TankState[], { confirmed, faultAssets, muted = false, sound = true }: {
  confirmed?: ReadonlySet<string>;           // confirmedFacilities(view, confirmations)
  faultAssets?: ReadonlySet<string>;         // tank ids from useAvonConsole().faults
  muted?: boolean;
  sound?: boolean;
} = {}): AttackFx {
  const prev = useRef<readonly TankState[] | null>(null);
  const [log, setLog] = useState<{ notices: FxNotice[]; waves: Record<string, number>; seq: number }>({ notices: [], waves: {}, seq: 0 });
  const confirmedNow = useRef(confirmed);
  confirmedNow.current = confirmed;

  // Each new snapshot against the last one. An effect (not render) so StrictMode's double render
  // cannot count an event twice; it runs right after the commit, before the next frame.
  useEffect(() => {
    const events = diffFaults(prev.current, states, confirmedNow.current);
    prev.current = states;
    if (events.length === 0) return;
    setLog((l) => {
      const waves = { ...l.waves };
      for (const e of events) if (e.kind === "faked") waves[e.facility_id] = (waves[e.facility_id] ?? 0) + 1;
      const added = events.map((e, i) => ({ ...e, seq: l.seq + i + 1 }));
      return { notices: [...l.notices, ...added].slice(-LOG_MAX), waves, seq: l.seq + events.length };
    });
  }, [states]);

  useEffect(() => armAudioOnGesture(), []);

  const chirped = useRef(0);
  useEffect(() => {
    if (log.seq <= chirped.current) return;
    const fresh = log.notices.filter((n) => n.seq > chirped.current);
    chirped.current = log.seq;
    const e = loudest(fresh);
    if (e && sound && !muted) chirp(e.kind);
  }, [log, sound, muted]);

  const faked = useMemo(() => fakedIds(states, faultAssets), [states, faultAssets]);
  return { notices: log.notices, waves: log.waves, faked, latest: log.notices.at(-1) ?? null };
}
