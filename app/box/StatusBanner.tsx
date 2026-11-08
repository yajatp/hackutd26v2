"use client";

import { darkroom, type DarkroomSnapshot } from "@/lib/darkroom-live";
import { ConnBadge, connState } from "@/app/ui/Badge";

function short(hash: string | undefined): string {
  return hash ? `${hash.slice(0, 8)}…` : "-";
}

// The same connection badge as Avon's screens: ■ LIVE · 3.1 ms, ● Connecting..., ▲ DISCONNECTED.
export function ConnectionChip({ s }: { s: DarkroomSnapshot }) {
  return <ConnBadge state={connState(s.connection)} ms={s.rttMs} />;
}

// Plain when the log verifies. Red, large and impossible to miss when it does not.
export function StatusBanner({ s, large = false }: { s: DarkroomSnapshot; large?: boolean }) {
  const st = s.status;
  const newest = s.events[s.events.length - 1];
  if (!s.ready) {
    return <div role="status" className="card text-muted">Loading the record from the box…</div>;
  }
  if (st.kind === "rollback" || st.kind === "tampering") {
    const why =
      st.kind === "rollback"
        ? `Entries from #${st.at} on were removed after this device saw them.`
        : `Entry #${st.at} no longer matches the record this device saw.`;
    return (
      <div role="alert" data-chain-status={st.kind} className="rounded-lg border-4 border-alert-solid bg-alert-solid p-4 text-white">
        <p className={`font-bold tracking-wide ${large ? "text-3xl sm:text-4xl" : "text-3xl"}`}>
          <span aria-hidden="true">▲ </span>{st.text}
        </p>
        <p className="mt-2 text-lg">{why}</p>
        <p className="mt-1">
          This device saw up to #{s.witness?.seq ?? "?"} (fingerprint {short(s.witness?.head)}). The box now shows {s.events.length} entries
          {newest ? `, ending at #${newest.seq}` : ""}. Writing is stopped on this device.
        </p>
        <button
          type="button"
          className="mt-3 text-sm underline"
          onClick={() => {
            if (window.confirm("Demo reset: forget what this device saw? Only do this when the box itself was reset.")) darkroom.forgetWitness();
          }}
        >
          Demo reset: forget what this device saw
        </button>
      </div>
    );
  }
  if (st.kind === "empty") {
    return (
      <div className="card">
        <p className={`font-bold tracking-wide ${large ? "text-3xl" : "text-2xl"}`}><span aria-hidden="true">○ </span>NO ENTRIES YET</p>
      </div>
    );
  }
  return (
    <div data-chain-status="verified" className="card">
      <p className={`font-bold tracking-wide ${large ? "text-3xl sm:text-4xl" : "text-2xl"}`}>
        <span aria-hidden="true">✓ </span>{st.text}
      </p>
      <p className="mt-1 text-muted">
        {st.count} entries, newest #{newest?.seq}, fingerprint {short(st.head)}. This device remembers #{s.witness?.seq ?? "-"} and checks every change against it.
      </p>
    </div>
  );
}
