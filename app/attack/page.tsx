"use client";
// Phone 1, the "break a sensor" remote the judge holds. Talks to the backend only through
// useAttack() (lib/attack.ts), so swapping in Spacetime reducers does not touch this file. It also
// reads which pumps failed from the console's own view, only to color the tank dots.
// Every fault is simulated: an overlay on the live tank panel, never a change to the data files.
// The red-team skin and every animation live in attack.module.css. Motion follows the data and
// the person's taps only (app/console/motion.tsx), and none of it runs under prefers-reduced-motion.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAttack, type ActiveFault, type AttackTarget, type FaultKind, type Verdict } from "@/lib/attack";
import { useAvonConsole } from "@/lib/live";
import { AppHeader } from "@/app/ui/AppHeader";
import { ConnBadge, SENSOR_STATE, SensorBadge, SimulatedBadge, connState } from "@/app/ui/Badge";
import { Arm, useArmed, useBornLive } from "@/app/console/motion";
import { failedFacilities, sentDelay, tankTone, verdictTone, waveDelay, type DotTone } from "./motion";
import { useListMotion } from "./useListMotion";
import s from "./attack.module.css";

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

// A buzz under the thumb where the phone has one (Android Chrome; iOS Safari has no vibration API).
function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not allowed here: no buzz */
  }
}

// The reducer call in flight ("Sending…"), then accepted ("Sent to the site"). kind: the
// Kill / Fake / Drift button that started it, if one did.
interface Send { n: number; kind?: FaultKind; phase: "sending" | "sent" }

// ---- pieces that move only when they are news (useBornLive) ----

// Still while it shows a state (a flagged tank wears a steady amber ring). Its color crossfades
// when the state changes; only the change for the worse, the console flagging it, is a moment:
// the amber pops in and rings three times (<Flagged>), then rests.
function Dot({ tone }: { tone: DotTone }) {
  return (
    <span aria-hidden="true" data-tone={tone} className={s.dot}>
      {tone === "flag" && <Flagged />}
    </span>
  );
}

function Flagged() {
  const live = useBornLive();
  return live ? <span className={s.dotNews} /> : null;
}

// The row lights red (DEAD, LYING) or amber (DRIFTING) once when the console's verdict lands.
// On the tank row it also buzzes the phone: the console saw the attack (the second beat).
function Flash({ tone, buzzes = false }: { tone: "alert" | "warn"; buzzes?: boolean }) {
  const live = useBornLive();
  useEffect(() => {
    if (live && buzzes) buzz([18, 60, 18]);
  }, [live, buzzes]);
  return live ? <span aria-hidden="true" data-tone={tone} className={s.flash} /> : null;
}

// The console's verdict glitches in (about 400 ms). The words are there from the first frame.
function Glitch({ children }: { children: ReactNode }) {
  const live = useBornLive();
  return <span className={`${s.verdict} ${live ? s.glitch : ""}`}>{children}</span>;
}

function TankRow({ t, i, n, on, tone, verdict, faulted, scan, wave, onPick }: {
  t: AttackTarget; i: number; n: number; on: boolean; tone: DotTone; verdict?: Verdict; faulted: boolean;
  scan: number; wave: number; onPick(): void;
}) {
  return (
    <button role="radio" aria-checked={on} onClick={onPick} className={s.tank}>
      <span className={s.tankLabel}><span className={s.glyph}>{on ? "◉" : "○"}</span> {t.label}</span>
      <span className={s.side}>
        {verdict
          ? <Glitch key={verdict.state}><SensorBadge state={verdict.state} /></Glitch>
          : faulted ? <span className="text-sm text-muted">no change yet</span> : null}
        <Dot tone={tone} />
      </span>
      {on && scan > 0 && <span key={`scan-${scan}`} aria-hidden="true" className={s.scan} />}
      {verdict && <Flash key={`flash-${verdict.state}`} tone={verdictTone(verdict.state)} buzzes />}
      {wave > 0 && <span key={`wave-${wave}`} aria-hidden="true" className={s.wave} style={{ animationDelay: `${waveDelay(i, n)}ms` }} />}
    </button>
  );
}

function FaultItem({ f, label, verdict, disabled, onClear }: {
  f: ActiveFault; label: string; verdict?: Verdict; disabled: boolean; onClear(): void;
}) {
  const live = useBornLive();
  const b = byKind.get(f.kind);
  return (
    <li data-id={f.asset_id} className={`${s.fault} ${live ? s.enter : ""}`}>
      <span className="min-w-0">
        <span className={s.faultName}>{label}</span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{b?.verb ?? f.kind} on since {utc(f.since_ts)} ·</span>
          {verdict
            ? <Glitch key={verdict.state}>console: <SensorBadge state={verdict.state} /></Glitch>
            : <span className="text-muted">console: no change yet (a tank whose pump has failed shows it best)</span>}
        </span>
      </span>
      <button
        disabled={disabled}
        onClick={onClear}
        aria-label={`Clear fault on ${label}`}
        className="btn min-h-12 shrink-0 px-4 text-base"
      >
        Clear
      </button>
      {verdict && <Flash key={`flash-${verdict.state}`} tone={verdictTone(verdict.state)} />}
    </li>
  );
}

// In the DOM at once; when it is news it fades in after the cleared rows have slid away.
function AllClear() {
  const live = useBornLive();
  return <p className={`pt-2 text-muted ${live ? s.after : ""}`}><span aria-hidden="true">✓ </span>None. Every sensor is telling the truth.</p>;
}

// 3 · Active faults. Its own component so it sits inside <Arm> and its list can slide.
function ActiveFaults({ active, verdicts, labelOf, live, busy, onClear, onClearAll }: {
  active: ActiveFault[]; verdicts: Record<string, Verdict>; labelOf(asset_id: string): string;
  live: boolean; busy: boolean; onClear(asset_id: string): void; onClearAll(): void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  useListMotion(wrap, layer, useArmed());
  return (
    <section className="mt-6 pb-10" aria-labelledby="active">
      <h2 id="active" className="section-title">
        3 · Active faults ({active.length})
      </h2>
      <div ref={wrap} className="relative">
        {active.length === 0 ? (
          <AllClear />
        ) : (
          <ul className="flex flex-col gap-2 pt-2" aria-live="polite">
            {active.map((f) => (
              <FaultItem
                key={f.asset_id}
                f={f}
                label={labelOf(f.asset_id)}
                verdict={verdicts[f.asset_id]}
                disabled={!live || busy}
                onClear={() => onClear(f.asset_id)}
              />
            ))}
          </ul>
        )}
        {/* Where a cleared fault plays its slide out (useListMotion). React never fills it. */}
        <div ref={layer} aria-hidden="true" className="pointer-events-none absolute inset-0" />
      </div>
      <button
        disabled={!live || busy || active.length === 0}
        onClick={onClearAll}
        className="btn mt-3 min-h-14 w-full text-base"
      >
        Clear all
      </button>
    </section>
  );
}

export default function AttackPage() {
  const api = useAttack();
  const { view } = useAvonConsole();
  const failed = useMemo(() => failedFacilities(view), [view]);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [send, setSend] = useState<Send | null>(null);
  const [scan, setScan] = useState(0);    // bumps on every pick: the picked row's scan line
  const [wave, setWave] = useState(0);    // bumps on Clear all: the calm wave down the list
  const seq = useRef(0);

  const live = api.status === "connected";
  const target: AttackTarget | undefined = api.targets.find((t) => t.asset_id === picked) ?? api.targets[0];
  const faultOn = new Map(api.active.map((f) => [f.asset_id, f]));
  const current = target ? faultOn.get(target.asset_id) : undefined;
  const labelOf = (asset_id: string) => api.targets.find((t) => t.asset_id === asset_id)?.label ?? asset_id;

  // The call starts at the tap and is never held back for an animation. "Sent to the site"
  // (and the pulse) waits only for what is left of the button's 350 ms charge.
  async function act(run: () => Promise<void>, kind?: FaultKind) {
    const n = ++seq.current;
    const t0 = performance.now();
    const mine = (next: (x: Send) => Send | null) => setSend((x) => (x?.n === n ? next(x) : x));
    setBusy(true);
    setError(null);
    setSend({ n, kind, phase: "sending" });
    try {
      await run();
      const wait = kind ? sentDelay(performance.now() - t0) : 0;
      setTimeout(() => mine((x) => ({ ...x, phase: "sent" })), wait);
      setTimeout(() => mine(() => null), wait + 2400);
    } catch (e) {
      mine(() => null);
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  function fire(kind: FaultKind, asset_id: string) {
    buzz(30);
    void act(() => api.inject(kind, asset_id), kind);
  }

  const off = !live || !target;   // can't send at all: the buttons dim
  // The other two buttons step back while one charges and sends. Driven by the send phase, which
  // lasts at least the charge, not by `busy`, which follows the network and often ends sooner.
  const sending = send?.phase === "sending" && send.kind ? "" : undefined;

  return (
    <Arm ready={live && api.targets.length > 0}>
      <main className="mx-auto min-h-dvh max-w-md px-4 pt-4">
        <AppHeader product="Avon" title="Break a sensor">
          <ConnBadge state={connState(api.status)} />
        </AppHeader>

        {api.status === "disconnected" && (
          <p role="alert" className="mt-3 rounded-[3px] bg-alert-solid p-3 font-bold text-white">
            ▲ DISCONNECTED from the console. Faults can&apos;t be sent until it reconnects.
          </p>
        )}

        <p className="mt-3 border-l-[3px] border-warn-line bg-warn-bg py-2.5 pr-3 pl-4 text-sm font-medium">
          <SimulatedBadge /> These faults are injected for the demo. EOG&apos;s data has no broken sensors.
        </p>

        <section className="mt-5" aria-labelledby="pick">
          <h2 id="pick" className="section-title">1 · Pick a tank</h2>
          {api.targets.length === 0 ? (
            <p className="mt-2 text-muted">No tanks yet. Load a site on the console first.</p>
          ) : (
            <div className="mt-2 flex flex-col gap-2" role="radiogroup" aria-labelledby="pick">
              {api.targets.map((t, i) => (
                <TankRow
                  key={t.asset_id}
                  t={t}
                  i={i}
                  n={api.targets.length}
                  on={t.asset_id === target?.asset_id}
                  tone={tankTone(t.asset_id, t.facility_id, api.verdicts, failed)}
                  verdict={api.verdicts[t.asset_id]}
                  faulted={faultOn.has(t.asset_id)}
                  scan={scan}
                  wave={wave}
                  onPick={() => {
                    setPicked(t.asset_id);
                    setScan((x) => x + 1);
                  }}
                />
              ))}
            </div>
          )}
        </section>

        {/* Sticks to the bottom of the screen, so the next action never scrolls away behind the tank list. */}
        <section aria-labelledby="break" className={`${s.dock} sticky bottom-0 z-10 -mx-4 mt-4 px-4 pb-3 pt-2`}>
          <h2 id="break" className="section-title truncate">
            2 · Break it{target ? <span className="normal-case text-foreground">: {target.label}</span> : null}
          </h2>
          <div data-sending={sending} className={`${s.grid} mt-2 grid grid-cols-3 gap-2`}>
            {FAULTS.map((f) => {
              const on = current?.kind === f.kind;
              const st = SENSOR_STATE[f.sensor];
              const mine = send?.kind === f.kind ? send : null;
              return (
                <button
                  key={f.kind}
                  disabled={off || busy}
                  data-off={off || undefined}
                  data-on={on || undefined}
                  data-phase={mine?.phase}
                  onClick={() => target && fire(f.kind, target.asset_id)}
                  className={s.hit}
                >
                  {/* The charge fills the button while the fault goes out; one ring when it is sent. */}
                  <span aria-hidden="true" className={s.fill}>{mine && <span key={mine.n} className={s.charge} />}</span>
                  {mine?.phase === "sent" && <span key={`ring-${mine.n}`} aria-hidden="true" className={s.pulse} />}
                  <span className={s.verb}>{f.verb}</span>
                  <span className={s.word}>{st.word}</span>
                  <span className={s.what}>{on ? `${st.icon} ON` : f.what}</span>
                </button>
              );
            })}
          </div>
          <p aria-live="polite" data-phase={send?.phase} className={s.sendLine}>
            {send ? (send.phase === "sending" ? "Sending…" : "Sent to the site") : null}
          </p>
        </section>

        {error && (
          <p key={error} role="alert" className={`mt-4 border-l-[3px] border-alert-line bg-alert-bg py-3 pr-3 pl-4 font-semibold text-alert ${s.shake}`}>
            ▲ {error}
          </p>
        )}

        <ActiveFaults
          active={api.active}
          verdicts={api.verdicts}
          labelOf={labelOf}
          live={live}
          busy={busy}
          onClear={(asset_id) => void act(() => api.clear(asset_id))}
          onClearAll={() => {
            setWave((w) => w + 1);
            void act(() => api.clear());
          }}
        />
      </main>
    </Arm>
  );
}
