"use client";
// Phone 1, the "break a sensor" remote the judge holds. Talks to the backend only through
// useAttack() (lib/attack.ts), so swapping in Spacetime reducers does not touch this file.
// Every fault is simulated: an overlay on the live tank panel, never a change to the data files.
// Light by default, dark when the phone is in dark mode (the shared tokens in globals.css follow the system).
import { useState } from "react";
import { useAttack, type AttackTarget, type FaultKind } from "@/lib/attack";
import { AppHeader } from "@/app/ui/AppHeader";
import { ConnBadge, SENSOR_STATE, SensorBadge, SimulatedBadge, connState } from "@/app/ui/Badge";

interface FaultButton {
  kind: FaultKind;
  verb: string;    // the button
  sensor: "dead" | "lying" | "drifting";   // what the console calls the sensor (word and icon from app/ui)
  what: string;    // a few words for whoever holds the phone
}

const FAULTS: FaultButton[] = [
  { kind: "kill", verb: "Kill", sensor: "dead", what: "goes silent" },
  { kind: "fake_flat", verb: "Fake", sensor: "lying", what: "freezes" },
  { kind: "drift", verb: "Drift", sensor: "drifting", what: "drifts off" },
];

const byKind = new Map(FAULTS.map((f) => [f.kind, f]));

function utc(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(11, 16) + " UTC";
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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
    <main className="mx-auto min-h-dvh max-w-md px-4 pt-4">
      <AppHeader product="Avon" title="Break a sensor">
        <ConnBadge state={connState(api.status)} />
      </AppHeader>

      {api.status === "disconnected" && (
        <p role="alert" className="mt-3 rounded-lg bg-alert-solid p-3 font-bold text-white">
          ▲ DISCONNECTED from the console. Faults can&apos;t be sent until it reconnects.
        </p>
      )}

      <p className="mt-3 rounded-lg border-2 border-warn-line bg-warn-bg p-3 text-sm font-semibold">
        <SimulatedBadge /> These faults are injected for the demo. EOG&apos;s data has no broken sensors.
      </p>

      <section className="mt-5" aria-labelledby="pick">
        <h2 id="pick" className="section-title">1 · Pick a tank</h2>
        {api.targets.length === 0 ? (
          <p className="mt-2 text-muted">No tanks yet. Load a site on the console first.</p>
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
                  className={`flex min-h-12 items-center justify-between gap-3 rounded-lg border-2 bg-surface px-4 py-2 text-left ${
                    on ? "border-foreground" : "border-line"
                  }`}
                >
                  <span className="min-w-0 break-words font-semibold">{on ? "◉" : "○"} {t.label}</span>
                  {f && <SensorBadge state={byKind.get(f.kind)?.sensor ?? f.kind} />}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Sticks to the bottom of the screen, so the next action never scrolls away behind the tank list. */}
      <section aria-labelledby="break" className="sticky bottom-0 z-10 -mx-4 mt-4 border-t border-line bg-background px-4 pb-3 pt-2">
        <h2 id="break" className="section-title truncate">
          2 · Break it{target ? <span className="normal-case text-foreground">: {target.label}</span> : null}
        </h2>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {FAULTS.map((f) => {
            const on = current?.kind === f.kind;
            const st = SENSOR_STATE[f.sensor];
            return (
              <button
                key={f.kind}
                disabled={disabled}
                onClick={() => target && act(() => api.inject(f.kind, target.asset_id))}
                className={`flex min-h-20 min-w-0 flex-col items-start justify-center rounded-xl border-2 px-2 py-2 text-left transition-opacity disabled:opacity-40 ${
                  on ? "border-alert-line bg-alert-bg" : "border-line bg-surface active:border-foreground"
                }`}
              >
                <span className="text-2xl font-bold leading-tight">{f.verb}</span>
                <span className={`text-sm font-semibold ${on ? "text-alert" : "text-muted"}`}>{st.word}</span>
                <span className={`text-sm ${on ? "font-semibold text-alert" : "text-muted"}`}>{on ? `${st.icon} ON now` : f.what}</span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-4 rounded-lg border-2 border-alert-line bg-alert-bg p-3 font-semibold text-alert">
          ▲ {error}
        </p>
      )}

      <section className="mt-6 pb-10" aria-labelledby="active">
        <h2 id="active" className="section-title">
          3 · Active faults ({api.active.length})
        </h2>
        {api.active.length === 0 ? (
          <p className="mt-2 text-muted"><span aria-hidden="true">✓ </span>None. Every sensor is telling the truth.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2" aria-live="polite">
            {api.active.map((f) => {
              const b = byKind.get(f.kind);
              return (
                <li key={f.asset_id} className="card flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0">
                    <span className="block break-words font-semibold">{labelOf(f.asset_id)}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                      <SensorBadge state={b?.sensor ?? f.kind} />
                      <span className="text-muted">since {utc(f.since_ts)}</span>
                    </span>
                  </span>
                  <button
                    disabled={!live || busy}
                    onClick={() => act(() => api.clear(f.asset_id))}
                    aria-label={`Clear fault on ${labelOf(f.asset_id)}`}
                    className="btn min-h-12 shrink-0 px-4 text-base"
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
          className="btn mt-3 min-h-14 w-full text-base"
        >
          Clear all
        </button>
      </section>
    </main>
  );
}
