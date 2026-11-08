"use client";
// Phone 1, the "break a sensor" remote the judge holds. Talks to the backend only through
// useAttack() (lib/attack.ts), so swapping in Spacetime reducers does not touch this file.
// Every fault is simulated: an overlay on the live tank panel, never a change to the data files.
// Light by default, dark when the phone is in dark mode (Tailwind dark: follows the system).
import { useState } from "react";
import { useAttack, type AttackTarget, type Conn, type FaultKind } from "@/lib/attack";

interface FaultButton {
  kind: FaultKind;
  verb: string;    // the button
  state: string;   // what the console should call the sensor
  icon: string;    // ▲ critical, ● warning (never color alone)
  what: string;    // one line for the judge
}

const FAULTS: FaultButton[] = [
  { kind: "kill", verb: "Kill", state: "DEAD", icon: "▲", what: "Sensor goes silent." },
  { kind: "fake_flat", verb: "Fake", state: "LYING", icon: "▲", what: "Reading freezes at its current value." },
  { kind: "drift", verb: "Drift", state: "DRIFTING", icon: "●", what: "Reading slowly drifts off the truth." },
];

const byKind = new Map(FAULTS.map((f) => [f.kind, f]));

// Shared looks, light first then dark.
const card = "border-2 border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900";
const muted = "text-zinc-600 dark:text-zinc-400";
const plainBtn = `min-h-14 rounded-lg px-4 font-semibold ${card} active:bg-zinc-100 dark:active:bg-zinc-800 disabled:opacity-40`;
const alertTag = "rounded bg-red-100 px-2 py-0.5 text-sm font-bold text-red-800 dark:bg-red-500/15 dark:text-red-300";

function utc(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(11, 16) + " UTC";
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function ConnChip({ status }: { status: Conn }) {
  if (status === "connected") {
    return <span className={`rounded px-2 py-1 text-sm font-semibold tracking-wide ${card}`}>■ LIVE</span>;
  }
  if (status === "connecting") {
    return (
      <span className="rounded border-2 border-amber-500 bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
        ● Connecting...
      </span>
    );
  }
  return (
    <span className="rounded border-2 border-red-600 bg-red-600 px-2 py-1 text-sm font-bold tracking-wide text-white">
      ▲ DISCONNECTED
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
  const labelOf = (asset_id: string) => api.targets.find((t) => t.asset_id === asset_id)?.label ?? asset_id;

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
    <main className="min-h-dvh bg-zinc-50 px-4 pb-10 pt-4 text-[16px] text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold">Break a sensor</h1>
        <ConnChip status={api.status} />
      </header>

      {api.status === "disconnected" && (
        <p role="alert" className="mt-3 rounded-lg bg-red-600 p-3 font-bold text-white">
          ▲ DISCONNECTED from the console. Faults can&apos;t be sent until it reconnects.
        </p>
      )}

      <p className="mt-3 rounded-lg border-2 border-amber-500 bg-amber-100 p-3 font-semibold text-amber-950 dark:bg-amber-400/15 dark:text-amber-100">
        SIMULATED: these faults are injected for the demo. EOG&apos;s data has no broken sensors.
      </p>

      <section className="mt-5" aria-labelledby="pick">
        <h2 id="pick" className={`text-sm font-semibold uppercase tracking-wide ${muted}`}>1 · Pick a tank</h2>
        {api.targets.length === 0 ? (
          <p className={`mt-2 ${muted}`}>No tanks yet. Load a site on the console first.</p>
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
                    on
                      ? "border-zinc-950 bg-white dark:border-zinc-50 dark:bg-zinc-900"
                      : "border-zinc-300 bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/60"
                  }`}
                >
                  <span className="min-w-0 break-words font-semibold">{on ? "◉" : "○"} {t.label}</span>
                  {f && (
                    <span className={`shrink-0 ${alertTag}`}>
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
        <h2 id="break" className={`text-sm font-semibold uppercase tracking-wide ${muted}`}>2 · Break it</h2>
        <div className="mt-2 flex flex-col gap-2">
          {FAULTS.map((f) => {
            const on = current?.kind === f.kind;
            return (
              <button
                key={f.kind}
                disabled={disabled}
                onClick={() => target && act(() => api.inject(f.kind, target.asset_id))}
                className={`min-h-20 rounded-xl border-2 px-4 py-3 text-left transition-opacity disabled:opacity-40 ${
                  on
                    ? "border-red-600 bg-red-50 dark:border-red-400 dark:bg-red-500/20"
                    : `${card} active:bg-zinc-100 dark:active:bg-zinc-800`
                }`}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="text-2xl font-bold">{f.verb}</span>
                  <span className={`text-sm font-semibold tracking-wide ${on ? "text-red-700 dark:text-red-300" : muted}`}>
                    {on ? `${f.icon} ${f.state} · ON` : `→ ${f.state}`}
                  </span>
                </span>
                <span className={`mt-1 block ${muted}`}>{f.what}</span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border-2 border-red-600 bg-red-50 p-3 font-semibold text-red-800 dark:bg-red-500/10 dark:text-red-200">
          ▲ {error}
        </p>
      )}

      <section className="mt-6" aria-labelledby="active">
        <h2 id="active" className={`text-sm font-semibold uppercase tracking-wide ${muted}`}>
          3 · Active faults ({api.active.length})
        </h2>
        {api.active.length === 0 ? (
          <p className={`mt-2 ${muted}`}>None. Every sensor is telling the truth.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" aria-live="polite">
            {api.active.map((f) => {
              const b = byKind.get(f.kind);
              return (
                <li key={f.asset_id} className={`flex items-center justify-between gap-3 rounded-lg p-3 ${card}`}>
                  <span className="min-w-0">
                    <span className="block break-words font-semibold">{labelOf(f.asset_id)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <span className={alertTag}>{b?.icon} {b?.state ?? f.kind}</span>
                      <span className={muted}>since {utc(f.since_ts)}</span>
                    </span>
                  </span>
                  <button
                    disabled={!live || busy}
                    onClick={() => act(() => api.clear(f.asset_id))}
                    aria-label={`Clear fault on ${labelOf(f.asset_id)}`}
                    className={`shrink-0 ${plainBtn}`}
                  >
                    Clear
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <button
          disabled={!live || busy || api.active.length === 0}
          onClick={() => act(() => api.clear())}
          className={`mt-3 w-full ${plainBtn}`}
        >
          Clear all
        </button>
      </section>
    </main>
  );
}
