"use client";
// Phone 1, the "break a sensor" remote the judge holds. Talks to the backend only through
// useAttack() (lib/attack.ts), so swapping in Spacetime reducers does not touch this file. It also
// reads which pumps failed from the console's own view, only to color the tank dots.
// Every fault is simulated: an overlay on the live tank panel, never a change to the data files.
// Each fault can be undone: when the picked tank has one, a Restore button ("Undo Kill" / "Undo
// Fake" / "Undo Drift") sits above Kill / Fake / Drift and plays an attack backwards in Moonlight.
// The night skin and the CSS animations live in attack.module.css, the Web Animations in
// useRemoteMotion.ts and useListMotion.ts. Motion follows the data and the person's taps
// (app/console/motion.tsx), plus the tank rows coming in once on first data; none of it runs
// under prefers-reduced-motion.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAttack, type ActiveFault, type AttackTarget, type FaultKind, type Verdict } from "@/lib/attack";
import { useAvonConsole } from "@/lib/live";
import { Grain } from "@/app/ui/Grain";
import { LiveClock } from "@/app/ui/LiveClock";
import { ScreenHeader } from "@/app/ui/ScreenHeader";
import { LockdownBanner } from "./LockdownBanner";
import { ConnBadge, SENSOR_STATE, SensorBadge, SimulatedBadge, connState, type ConnState } from "@/app/ui/Badge";
import { Arm, useArmed, useBornLive } from "@/app/console/motion";
import { failedFacilities, introDelay, sentDelay, tankTone, verdictTone, waveDelay, type DotTone } from "./motion";
import { FOLD_MS, RINGS_MS, VERB, restoreLabel, sendWords } from "./restore";
import { useListMotion } from "./useListMotion";
import { useConnSwap, useDotMotion, useFold, usePresence } from "./useRemoteMotion";
import s from "./attack.module.css";

interface FaultButton {
  kind: FaultKind;
  verb: string;    // the button
  sensor: "dead" | "lying" | "drifting";   // what the console calls the sensor (word and icon from app/ui)
  what: string;    // a few words for whoever holds the phone
}

const FAULTS: FaultButton[] = [
  { kind: "kill", verb: VERB.kill, sensor: "dead", what: "goes silent" },
  { kind: "fake_flat", verb: VERB.fake_flat, sensor: "lying", what: "freezes" },
  { kind: "drift", verb: VERB.drift, sensor: "drifting", what: "drifts off" },
];

const byKind = new Map(FAULTS.map((f) => [f.kind, f]));

const NONE: ReadonlySet<string> = new Set();

// How long the tank rows' first-data entrance runs: the last row's delay plus its 320 ms.
const INTRO_MS = introDelay(Infinity) + 360;

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

// A fault the Restore button (or a row's Clear) takes off: which tank, which fault, its name.
interface Undo { asset_id: string; kind: FaultKind; label: string }

const sameUndo = (a: Undo, b: Undo) => a.asset_id === b.asset_id && a.kind === b.kind && a.label === b.label;

// The reducer call in flight ("Sending…" / "Restoring…"), then accepted ("Sent to the site" /
// "Sensor restored"). kind: the Kill / Fake / Drift button that started it, if one did. undo: the
// fault a Restore or a row's Clear takes off. hold: the Restore button stays for its rings.
interface Send { n: number; kind?: FaultKind; undo?: Undo; hold?: boolean; phase: "sending" | "sent" }

// ---- pieces that move only when they are news (useBornLive) ----

// Still while it shows a state (a flagged tank wears a steady amber ring). Its color crossfades
// when the state changes. What the console says moves it once (useDotMotion): DEAD flatlines it
// (a dim flat line), LYING jitters it for three frames before it reads amber, DRIFTING wobbles it
// once; LYING and DRIFTING then pop in amber and ring (<Flagged>). heal: bumps when a restore
// lands on this tank: a Moonlight flash that settles into its own color.
function Dot({ tone, state, heal }: { tone: DotTone; state?: string; heal: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const said = tone === "flag" ? state : undefined;
  useDotMotion(ref, said);
  return (
    <span ref={ref} aria-hidden="true" data-tone={tone} data-state={said} className={s.dot}>
      {tone === "flag" && said !== "dead" && <Flagged key={said ?? "flag"} />}
      {heal > 0 && <span key={`heal-${heal}`} className={s.dotHeal} />}
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

// Words that change in place (the picked tank's name, the count of faults, ▲ ON, the Restore
// button's label): the new words fade up when that is news. Key it by what it says.
function Swap({ className = "", children }: { className?: string; children: ReactNode }) {
  const live = useBornLive();
  return <span className={`${className} ${live ? s.swap : ""}`}>{children}</span>;
}

// The header's connection badge. A change crossfades, and DISCONNECTED shakes once (useConnSwap).
function Conn({ state }: { state: ConnState }) {
  const wrap = useRef<HTMLSpanElement>(null);
  const now = useRef<HTMLSpanElement>(null);
  const layer = useRef<HTMLSpanElement>(null);
  useConnSwap(wrap, now, layer, state, "offline");
  return (
    <span ref={wrap} className={s.conn}>
      <span ref={now} className={s.connNow}><ConnBadge state={state} /></span>
      <span ref={layer} aria-hidden="true" className={s.connLayer} />
    </span>
  );
}

function TankRow({ t, i, n, on, tone, verdict, faulted, scan, wave, heal, intro, onPick }: {
  t: AttackTarget; i: number; n: number; on: boolean; tone: DotTone; verdict?: Verdict; faulted: boolean;
  scan: number; wave: number; heal: number; intro?: number; onPick(): void;
}) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={`${s.tank} ${intro !== undefined ? s.rowIn : ""}`}
      style={intro !== undefined ? { animationDelay: `${intro}ms` } : undefined}
    >
      <span className={s.tankLabel}>{t.label}</span>
      <span className={s.side}>
        {verdict
          ? <Glitch key={verdict.state}><SensorBadge state={verdict.state} /></Glitch>
          : faulted ? <span className="text-sm text-muted">no change yet</span> : null}
        <Dot tone={tone} state={verdict?.state} heal={heal} />
      </span>
      {on && scan > 0 && <span key={`scan-${scan}`} aria-hidden="true" className={s.scan} />}
      {verdict && <Flash key={`flash-${verdict.state}`} tone={verdictTone(verdict.state)} buzzes />}
      {wave > 0 && <span key={`wave-${wave}`} aria-hidden="true" className={s.wave} style={{ animationDelay: `${waveDelay(i, n)}ms` }} />}
      {heal > 0 && <span key={`sweep-${heal}`} aria-hidden="true" className={s.sweep} />}
    </button>
  );
}

// Restore: "Undo Kill" over "Restore the S5 · Facility C tank sensor". An attack played
// backwards: the charge drains right to left, then two rings go out once. It
// unfolds when the picked tank gets a fault and folds away once the fault is gone (useFold).
function RestoreSlot({ item, leaving, phase, n, off, disabled, onRestore }: {
  item: Undo; leaving: boolean; phase?: "sending" | "sent"; n: number; off: boolean; disabled: boolean; onRestore(asset_id: string): void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const born = useBornLive();
  useFold(box, born, leaving, FOLD_MS);
  const l = restoreLabel(item.kind, item.label);
  return (
    <div ref={box} className={s.slot} inert={leaving || undefined}>
      <button
        disabled={disabled || leaving}
        data-off={off || undefined}
        data-phase={phase}
        onClick={() => onRestore(item.asset_id)}
        className={s.undo}
      >
        <span aria-hidden="true" className={s.fill}>{phase === "sending" && <span key={n} className={s.drain} />}</span>
        {phase === "sent" && <span key={`rings-${n}`} aria-hidden="true" className={s.healRings}><span /><span /></span>}
        <svg aria-hidden="true" viewBox="0 0 24 24" className={s.undoIcon}>
          <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
          <path d="M3.5 4v5.5H9" />
        </svg>
        <Swap key={`${item.asset_id}:${item.kind}`} className={s.undoText}>
          <span className={s.undoVerb}>{l.verb}</span>
          <span className={s.undoLine}>{l.line}</span>
        </Swap>
      </button>
    </div>
  );
}

// healing: its Clear (or the Restore button, or Clear all) was tapped. The row's rule turns
// Moonlight and flashes, its Clear inverts, and it slides out that way ([data-heal] plays in the copy).
function FaultItem({ f, label, verdict, disabled, healing, onClear }: {
  f: ActiveFault; label: string; verdict?: Verdict; disabled: boolean; healing: boolean; onClear(): void;
}) {
  const live = useBornLive();
  const b = byKind.get(f.kind);
  return (
    <li data-id={f.asset_id} className={`${s.fault} ${live ? s.enter : ""} ${healing ? s.healed : ""}`}>
      <span className="min-w-0">
        <span className={s.faultName}>{label}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-muted">{b?.verb ?? f.kind} on since {utc(f.since_ts)}</span>
          {verdict
            ? <Glitch key={verdict.state}>console: <SensorBadge state={verdict.state} /></Glitch>
            : <span className="text-muted">console: no change yet (a tank whose pump has failed shows it best)</span>}
        </span>
      </span>
      <button
        disabled={disabled}
        onClick={onClear}
        aria-label={`Clear fault on ${label}`}
        data-heal={healing ? "" : undefined}
        className={`btn min-h-12 shrink-0 px-4 text-base ${s.clear}`}
      >
        Clear
      </button>
      {verdict && <Flash key={`flash-${verdict.state}`} tone={verdictTone(verdict.state)} />}
      {healing && <span aria-hidden="true" data-heal="" className={s.healFlash} />}
    </li>
  );
}

// In the DOM at once; when it is news it fades in after the cleared rows have slid away.
function AllClear() {
  const live = useBornLive();
  return <p className={`pt-2 text-muted ${live ? s.after : ""}`}><span aria-hidden="true">✓ </span>None. Every sensor is telling the truth.</p>;
}

// Step 3, Active faults. Its own component so it sits inside <Arm> and its list can slide.
function ActiveFaults({ active, verdicts, labelOf, live, busy, healing, onClear, onClearAll }: {
  active: ActiveFault[]; verdicts: Record<string, Verdict>; labelOf(asset_id: string): string;
  live: boolean; busy: boolean; healing: ReadonlySet<string>; onClear(asset_id: string): void; onClearAll(): void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  useListMotion(wrap, layer, useArmed());
  return (
    <section className="mt-6 pb-10" aria-labelledby="active">
      <h2 id="active" className="section-title">
        <span className={s.step}>3</span>Active faults (<Swap key={active.length}>{active.length}</Swap>)
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
                healing={healing.has(f.asset_id)}
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
  const [healed, setHealed] = useState({ asset_id: "", n: 0 });   // bumps when a restore lands: that tank's heal
  const [healing, setHealing] = useState<ReadonlySet<string>>(NONE);   // faults being cleared: their rows show the heal
  const [intro, setIntro] = useState(true);   // the tank rows' entrance, once, on the first data
  const seq = useRef(0);

  const live = api.status === "connected";
  const target: AttackTarget | undefined = api.targets.find((t) => t.asset_id === picked) ?? api.targets[0];
  const faultOn = new Map(api.active.map((f) => [f.asset_id, f]));
  const current = target ? faultOn.get(target.asset_id) : undefined;
  const labelOf = (asset_id: string) => api.targets.find((t) => t.asset_id === asset_id)?.label ?? asset_id;

  const hasTanks = api.targets.length > 0;
  useEffect(() => {
    if (!hasTanks || !intro) return;
    const t = setTimeout(() => setIntro(false), INTRO_MS);
    return () => clearTimeout(t);
  }, [hasTanks, intro]);

  // The call starts at the tap and is never held back for an animation. "Sent to the site" or
  // "Sensor restored" (and the rings) wait only for what is left of the button's 350 ms charge
  // or drain. heal: the faults whose rows show the heal until they have slid out.
  async function act(run: () => Promise<void>, how: { kind?: FaultKind; undo?: Undo; heal?: string[] } = {}) {
    const { kind, undo, heal } = how;
    const n = ++seq.current;
    const t0 = performance.now();
    const mine = (next: (x: Send) => Send | null) => setSend((x) => (x?.n === n ? next(x) : x));
    const marked = heal?.length ? new Set(heal) : null;
    const unmark = () => setHealing((h) => (h === marked ? NONE : h));
    setBusy(true);
    setError(null);
    setSend({ n, kind, undo, hold: !!undo, phase: "sending" });
    if (marked) setHealing(marked);
    try {
      await run();
      const wait = kind || undo ? sentDelay(performance.now() - t0) : 0;
      setTimeout(() => {
        mine((x) => ({ ...x, phase: "sent" }));
        if (undo) setHealed((h) => ({ asset_id: undo.asset_id, n: h.n + 1 }));
      }, wait);
      setTimeout(() => {
        if (undo) mine((x) => ({ ...x, hold: false }));
        if (marked) unmark();
      }, wait + RINGS_MS);
      setTimeout(() => mine(() => null), wait + 2400);
    } catch (e) {
      mine(() => null);
      if (marked) unmark();
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  function fire(kind: FaultKind, asset_id: string) {
    buzz(30);
    void act(() => api.inject(kind, asset_id), { kind });
  }

  // Undo one tank's fault: the Restore button, or that fault's Clear under Active faults.
  function restore(asset_id: string) {
    const f = faultOn.get(asset_id);
    if (!f) return;
    buzz([12, 40, 12]);
    void act(() => api.clear(asset_id), { undo: { asset_id, kind: f.kind, label: labelOf(asset_id) }, heal: [asset_id] });
  }

  const off = !live || !target;   // can't send at all: the buttons dim
  // The other two buttons step back while one charges and sends. Driven by the send phase, which
  // lasts at least the charge, not by `busy`, which follows the network and often ends sooner.
  const attacking = send?.phase === "sending" && !!send.kind;
  const sending = attacking ? "" : undefined;

  // The Restore button: the picked tank's fault, or the one it is restoring right now (it stays
  // through the drain and the rings, after the fault itself is gone). It waits for an attack's
  // charge to finish before it unfolds, so Kill, Fake and Drift never jump under the thumb.
  const undoing = send?.undo && send.hold ? send.undo : null;
  const want: Undo | null = !target ? null
    : undoing?.asset_id === target.asset_id ? undoing
    : current ? { asset_id: target.asset_id, kind: current.kind, label: target.label }
    : null;
  const slot = usePresence(want, sameUndo, FOLD_MS, attacking);
  const slotPhase = slot.item && send?.undo?.asset_id === slot.item.asset_id ? send.phase : undefined;

  return (
    <Arm ready={live && api.targets.length > 0}>
      <main className={s.main}>
        <ScreenHeader current="attack" title="Break a sensor" clock={<LiveClock dataUnix={view?.now ?? null} />}
          status={<Conn state={connState(api.status)} />} />
        <Grain />
        <LockdownBanner />

        {api.status === "disconnected" && (
          <p role="alert" className={`mt-3 bg-alert-solid p-3 font-bold text-white ${s.shake}`}>
            ▲ DISCONNECTED from the console. Faults can&apos;t be sent until it reconnects.
          </p>
        )}

        <p className="mt-3 border-l-[3px] border-warn-line bg-warn-bg py-2.5 pr-3 pl-4 text-sm font-medium">
          <SimulatedBadge /> These faults are injected for the demo. EOG&apos;s data has no broken sensors.
        </p>

        <section className="mt-5" aria-labelledby="pick">
          <h2 id="pick" className="section-title"><span className={s.step}>1</span>Pick a tank</h2>
          {api.targets.length === 0 ? (
            <p className="mt-2 text-muted">No tanks yet. Load a site on the console first.</p>
          ) : (
            <div className={`mt-2 ${s.tanks}`} role="radiogroup" aria-labelledby="pick">
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
                  heal={healed.asset_id === t.asset_id ? healed.n : 0}
                  intro={intro ? introDelay(i) : undefined}
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
            <span className={s.step}>2</span>Break it{target ? <Swap key={target.asset_id} className={s.target}>: {target.label}</Swap> : null}
          </h2>
          {slot.item && (
            <RestoreSlot
              item={slot.item}
              leaving={slot.leaving}
              phase={slotPhase}
              n={send?.n ?? 0}
              off={!live}
              disabled={!live || busy || slotPhase === "sending"}
              onRestore={restore}
            />
          )}
          <div data-sending={sending} className={`${s.grid} mt-2 grid grid-cols-3`}>
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
                  <span className={s.word}>{st.word.toLowerCase()}</span>
                  <Swap key={on ? "on" : "off"} className={s.what}>{on ? `${st.icon} ON` : f.what}</Swap>
                </button>
              );
            })}
          </div>
          <p aria-live="polite" data-phase={send?.phase} data-mode={send?.undo ? "restore" : undefined} className={s.sendLine}>
            {send ? sendWords(send.phase, !!send.undo) : null}
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
          healing={healing}
          onClear={restore}
          onClearAll={() => {
            setWave((w) => w + 1);
            void act(() => api.clear(), { heal: api.active.map((f) => f.asset_id) });
          }}
        />
      </main>
    </Arm>
  );
}
