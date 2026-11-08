"use client";
// Phone 1, the "break a sensor" remote the judge holds. Talks to the backend only through
// useAttack() (lib/attack.ts), so swapping in Spacetime reducers does not touch this file.
// Every fault is simulated: an overlay on the live tank panel, never a change to the data files.
import { useState } from "react";
import { useAttack, type AttackTarget, type FaultKind } from "@/lib/attack";

interface FaultButton {
  kind: FaultKind;
  verb: string;    // the button
  state: string;   // what the console should call the sensor
  icon: string;    // ▲ critical, ● warning (never color alone)
  what: string;    // one line for the judge
}

const FAULTS: FaultButton[] = [
  { kind: "kill", verb: "Kill", state: "DEAD", icon: "▲", what: "Sensor stops reporting." },
  { kind: "drift", verb: "Drift", state: "DRIFTING", icon: "●", what: "Reading slowly creeps off the truth." },
  { kind: "fake_flat", verb: "Fake", state: "LYING", icon: "▲", what: "Reading freezes while the tank keeps filling." },
];

const byKind = new Map(FAULTS.map((f) => [f.kind, f]));

function utc(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(11, 16) + " UTC";
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function ConnChip({ status }: { status: "connecting" | "connected" | "disconnected" }) {
  if (status === "connected") {
    return <span className="rounded border border-[#3a4049] px-2 py-1 text-sm font-semibold tracking-wide">■ LIVE</span>;
  }
  return (
    <span className="rounded border border-amber-400 bg-amber-400/10 px-2 py-1 text-sm font-semibold tracking-wide text-amber-300">
      ● {status === "connecting" ? "CONNECTING" : "RECONNECTING"}
    </span>
  );
}

export default function AttackPage() {
  const api = useAttack();
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = api.status === "connected";
  const target: AttackTarget | undefined = api.targets.find((t) => t.asset_id === picked) ?? api.targets[0];
  const faultOn = new Map(api.active.map((f) => [f.asset_id, f]));
  const current = target ? faultOn.get(target.asset_id) : undefined;

  async function act(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
      navigator.vibrate?.(40);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const disabled = !live || busy || !target;

  return (
    <main className="min-h-dvh bg-[#121417] px-4 pb-10 pt-4 text-[16px] text-[#E6E8EB]">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Break a sensor</h1>
        <ConnChip status={api.status} />
      </header>
      <p className="mt-2 inline-block rounded bg-amber-400/15 px-2 py-1 text-sm font-semibold tracking-wide text-amber-200">
        SIMULATED · overlay only · files unchanged
      </p>

      <section className="mt-5" aria-labelledby="pick">
        <h2 id="pick" className="text-sm font-semibold uppercase tracking-wide text-[#9AA3AD]">1 · Pick a tank</h2>
        {api.targets.length === 0 ? (
          <p className="mt-2 text-[#9AA3AD]">No tanks yet. Load a site on the console first.</p>
        ) : (
          <div className="mt-2 flex flex-col gap-2" role="radiogroup">
            {api.targets.map((t) => {
              const on = t.asset_id === target?.asset_id;
              const f = faultOn.get(t.asset_id);
              return (
                <button
                  key={t.asset_id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPicked(t.asset_id)}
                  className={`flex min-h-14 items-center justify-between gap-3 rounded-lg border-2 px-4 py-2 text-left ${
                    on ? "border-[#E6E8EB] bg-[#1B1F24]" : "border-[#2a2f36] bg-[#1B1F24]/60"
                  }`}
                >
                  <span className="font-semibold">{on ? "◉" : "○"} {t.label}</span>
                  {f && (
                    <span className="shrink-0 rounded bg-red-500/15 px-2 py-0.5 text-sm font-bold text-red-300">
                      {byKind.get(f.kind)?.icon} {byKind.get(f.kind)?.state}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="mt-6" aria-labelledby="break">
        <h2 id="break" className="text-sm font-semibold uppercase tracking-wide text-[#9AA3AD]">2 · Break it</h2>
        <div className="mt-2 flex flex-col gap-2">
          {FAULTS.map((f) => {
            const on = current?.kind === f.kind;
            return (
              <button
                key={f.kind}
                disabled={disabled}
                onClick={() => target && act(() => api.inject(f.kind, target.asset_id))}
                className={`min-h-20 rounded-xl border-2 px-4 py-3 text-left transition-opacity disabled:opacity-40 ${
                  on ? "border-red-400 bg-red-500/20" : "border-[#3a4049] bg-[#1B1F24] active:bg-[#262b32]"
                }`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-2xl font-bold">{f.verb}</span>
                  <span className={`text-sm font-semibold tracking-wide ${on ? "text-red-300" : "text-[#9AA3AD]"}`}>
                    {on ? `${f.icon} ${f.state} · ON` : `→ ${f.state}`}
                  </span>
                </span>
                <span className="mt-1 block text-[#9AA3AD]">{f.what}</span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border-2 border-red-400 bg-red-500/10 p-3 font-semibold text-red-200">
          ▲ {error}
        </p>
      )}

      {current && target && (
        <p className="mt-4 text-[#9AA3AD]" aria-live="polite">
          {target.label}: {byKind.get(current.kind)?.state} since {utc(current.since_ts)} data time. Watch the console.
        </p>
      )}

      <section className="mt-6 flex flex-col gap-2">
        <button
          disabled={disabled || !current}
          onClick={() => target && act(() => api.clear(target.asset_id))}
          className="min-h-14 rounded-lg border-2 border-[#3a4049] px-4 font-semibold disabled:opacity-40"
        >
          Fix this tank&apos;s sensor
        </button>
        <button
          disabled={!live || busy || api.active.length === 0}
          onClick={() => act(() => api.clear())}
          className="min-h-14 rounded-lg border-2 border-[#3a4049] px-4 font-semibold disabled:opacity-40"
        >
          Fix every sensor ({api.active.length})
        </button>
      </section>
    </main>
  );
}
