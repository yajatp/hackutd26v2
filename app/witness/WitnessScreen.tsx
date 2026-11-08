"use client";

import { useDarkroom } from "@/lib/darkroom-live";
import { parseActor } from "@/lib/rules/darkroom/roles";
import { ConnectionChip, StatusBanner } from "../box/StatusBanner";
import { ThreatModelCard } from "../box/ThreatModelCard";

// The witness phone: it only reads. It remembers the newest entry it saw and
// flips to red the moment the box's log stops matching that memory.
export default function WitnessScreen() {
  const s = useDarkroom();
  const newest = s.events[s.events.length - 1];
  return (
    <main className="mx-auto min-h-screen max-w-md space-y-4 bg-white p-4 text-neutral-900">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-bold">Darkroom witness</h1>
        <ConnectionChip s={s} />
      </header>

      <StatusBanner s={s} large />

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-neutral-300 p-4 text-sm">
        <dt className="text-neutral-600">This phone remembers</dt>
        <dd className="font-mono">{s.witness ? `#${s.witness.seq} · ${s.witness.head.slice(0, 12)}…` : "nothing yet"}</dd>
        <dt className="text-neutral-600">The box shows</dt>
        <dd className="font-mono">{newest ? `${s.events.length} entries · newest #${newest.seq}` : "no entries"}</dd>
        <dt className="text-neutral-600">Chain head</dt>
        <dd className="font-mono break-all">{newest ? newest.hash : "-"}</dd>
      </dl>

      <section aria-labelledby="newest" className="rounded-lg border border-neutral-300 p-4 text-sm">
        <h2 id="newest" className="font-semibold">Newest entries</h2>
        <ol className="mt-2 space-y-1 font-mono text-xs">
          {s.events.length === 0 && <li className="font-sans text-neutral-600">None yet.</li>}
          {s.events.slice(-5).reverse().map(e => (
            <li key={e.seq}>
              #{e.seq} {e.type} · {parseActor(e.actor).name} · {e.hash.slice(0, 8)}
            </li>
          ))}
        </ol>
      </section>

      <ThreatModelCard />
    </main>
  );
}
