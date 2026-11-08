"use client";

import { useState, type CSSProperties } from "react";
import { useDarkroom } from "@/lib/darkroom-live";
import { AppHeader } from "@/app/ui/AppHeader";
import { ConnectionChip, StatusBanner } from "../box/StatusBanner";
import { ThreatModelCard } from "../box/ThreatModelCard";
import { Chain } from "../box/Chain";
import { useFresh } from "../box/useFresh";
import { Digits } from "../box/Digits";
import w from "./witness.module.css";

const TICKS = 3;

// The witness phone: it only reads. It remembers the newest entry it saw and
// flips to red the moment the box's log stops matching that memory.
// Each entry that arrives while it watches gets a "witnessed #k" tick. A break flashes the whole
// phone red once.
export default function WitnessScreen() {
  const s = useDarkroom();
  const newest = s.events[s.events.length - 1];
  const fresh = useFresh(s.events, s.ready);
  const broken = s.status.kind === "rollback" || s.status.kind === "tampering";

  // Sound is removed (Mohan, Sun 07:25): no chime and no tone; a break still flashes red once.
  const [flashed, setFlashed] = useState<string | null>(null);

  // Ticks only for entries this phone has actually taken into its memory.
  const held = s.status.kind === "verified" ? s.witness : null;
  const ticks = held ? [...fresh.seqs].filter(q => q <= held.seq).sort((a, b) => a - b).slice(-TICKS) : [];
  // Ticks from one batch pop in one after another.
  const tickDelay = (q: number) => Math.max(0, fresh.batch.seqs.slice(-TICKS).indexOf(q)) * 160;

  return (
    <main className="mx-auto min-h-screen max-w-md space-y-4 p-4">
      <AppHeader product="Darkroom" title="witness">
        <ConnectionChip s={s} />
      </AppHeader>

      <StatusBanner s={s} large />

      {ticks.length > 0 && (
        <p className={w.ticks} aria-live="polite">
          {ticks.map(q => (
            <span key={q} className={w.tick} style={{ "--d": `${tickDelay(q)}ms` } as CSSProperties}>
              <span aria-hidden="true">✓</span> witnessed <span className="dr-num">#{q}</span>
            </span>
          ))}
        </p>
      )}

      {broken && flashed !== s.status.text && (
        <div
          className={w.flash}
          aria-hidden="true"
          data-witness-flash
          onAnimationEnd={e => {
            if (e.target === e.currentTarget) setFlashed(s.status.text);
          }}
        >
          <p className={w.flashText}>▲ <Digits text={s.status.text} /></p>
        </div>
      )}

      <dl className="card grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">This phone remembers</dt>
        <dd className="font-mono">{s.witness ? `#${s.witness.seq} · ${s.witness.head.slice(0, 12)}…` : "nothing yet"}</dd>
        <dt className="text-muted">The box shows</dt>
        <dd className="font-mono">{newest ? `${s.events.length} entries · newest #${newest.seq}` : "no entries"}</dd>
        <dt className="text-muted">Newest fingerprint</dt>
        <dd className="font-mono break-all">{newest ? newest.hash : "-"}</dd>
      </dl>

      <Chain events={s.events} status={s.status} witness={s.witness} fresh={fresh.seqs} batch={fresh.batch.seqs} max={5} compact />

      <ThreatModelCard />
    </main>
  );
}
