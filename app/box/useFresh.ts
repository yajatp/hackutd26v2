"use client";

import { useState } from "react";
import type { LogEvent } from "@/lib/chain";
import { keysOf, newSince, nextFresh, type LinkKey } from "./chain-view";

// Which log entries arrived through the subscription while this screen was open (they animate),
// and the newest batch of them (the witness chimes once per entry in it). Entries already on the
// box when the screen loaded never count, so a reload draws the chain at rest.
export interface Fresh {
  seqs: ReadonlySet<number>;
  batch: { n: number; seqs: readonly number[] };
}

const NONE: Fresh = { seqs: new Set(), batch: { n: 0, seqs: [] } };

function signature(events: readonly LogEvent[]): string {
  const first = events[0];
  const last = events[events.length - 1];
  return `${events.length}:${first?.hash ?? ""}:${last?.seq ?? ""}:${last?.hash ?? ""}`;
}

export function useFresh(events: readonly LogEvent[], ready: boolean): Fresh {
  const [st, setSt] = useState<{ keys: LinkKey[] | null; sig: string; fresh: Fresh }>({ keys: null, sig: "", fresh: NONE });
  const sig = signature(events);
  if (ready && (st.keys === null || st.sig !== sig)) {
    // React's "information from previous renders" pattern: set state while rendering, and React
    // renders again at once with it, before anything reaches the screen.
    const keys = keysOf(events);
    const added = newSince(st.keys, keys);
    const batch = added.length ? { n: st.fresh.batch.n + 1, seqs: added } : st.fresh.batch;
    setSt({ keys, sig, fresh: { seqs: nextFresh(st.keys, keys, st.fresh.seqs), batch } });
  }
  return st.fresh;
}
