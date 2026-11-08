"use client";

import { useDarkroom } from "@/lib/darkroom-live";
import { AppHeader } from "@/app/ui/AppHeader";
import { LogEntries } from "@/app/ui/LogEntries";
import { ConnectionChip, StatusBanner } from "../box/StatusBanner";
import { ThreatModelCard } from "../box/ThreatModelCard";

// The witness phone: it only reads. It remembers the newest entry it saw and
// flips to red the moment the box's log stops matching that memory.
export default function WitnessScreen() {
  const s = useDarkroom();
  const newest = s.events[s.events.length - 1];
  return (
    <main className="mx-auto min-h-screen max-w-md space-y-4 p-4">
      <AppHeader product="Darkroom" title="witness">
        <ConnectionChip s={s} />
      </AppHeader>

      <StatusBanner s={s} large />

      <dl className="card grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted">This phone remembers</dt>
        <dd className="font-mono">{s.witness ? `#${s.witness.seq} · ${s.witness.head.slice(0, 12)}…` : "nothing yet"}</dd>
        <dt className="text-muted">The box shows</dt>
        <dd className="font-mono">{newest ? `${s.events.length} entries · newest #${newest.seq}` : "no entries"}</dd>
        <dt className="text-muted">Newest fingerprint</dt>
        <dd className="font-mono break-all">{newest ? newest.hash : "-"}</dd>
      </dl>

      <LogEntries events={s.events} max={5} />

      <ThreatModelCard />
    </main>
  );
}
