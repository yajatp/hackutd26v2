"use client";

import { darkroom, type DarkroomSnapshot } from "@/lib/darkroom-live";

function short(hash: string | undefined): string {
  return hash ? `${hash.slice(0, 8)}…` : "-";
}

export function ConnectionChip({ s }: { s: DarkroomSnapshot }) {
  if (s.connection === "live") return <span className="text-sm text-neutral-600">● Connected to the box</span>;
  if (s.connection === "connecting") return <span className="text-sm text-neutral-600">○ Connecting…</span>;
  return <span className="text-sm font-semibold text-red-700">● Disconnected from the box</span>;
}

// Plain when the log verifies. Red, large and impossible to miss when it does not.
export function StatusBanner({ s, large = false }: { s: DarkroomSnapshot; large?: boolean }) {
  const st = s.status;
  const newest = s.events[s.events.length - 1];
  if (!s.ready) {
    return <div className="rounded-lg border border-neutral-300 p-4 text-neutral-600">Loading the record from the box…</div>;
  }
  if (st.kind === "rollback" || st.kind === "tampering") {
    const why =
      st.kind === "rollback"
        ? `Entries from #${st.at} on were removed after this device saw them.`
        : `Entry #${st.at} no longer matches the record this device saw.`;
    return (
      <div role="alert" data-chain-status={st.kind} className="rounded-lg border-4 border-red-700 bg-red-700 p-4 text-white">
        <p className={`font-bold tracking-wide ${large ? "text-4xl" : "text-3xl"}`}>{st.text}</p>
        <p className="mt-2 text-lg">{why}</p>
        <p className="mt-1">
          This device saw up to #{s.witness?.seq ?? "?"} (head {short(s.witness?.head)}). The box now shows {s.events.length} entries
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
    return <div className="rounded-lg border border-neutral-300 p-4 text-neutral-600">NO ENTRIES YET</div>;
  }
  return (
    <div data-chain-status="verified" className="rounded-lg border border-neutral-300 p-4">
      <p className={`font-bold tracking-wide ${large ? "text-4xl" : "text-2xl"}`}>{st.text}</p>
      <p className="mt-1 text-neutral-600">
        {st.count} entries, newest #{newest?.seq}, head {short(st.head)}. This device remembers #{s.witness?.seq ?? "-"} and checks every change against it.
      </p>
    </div>
  );
}
