"use client";
// /twin: the loaded site in Permian Night (docs/TWIN-THEME.md), from the live avon data only. Works
// in any browser (and the Quest browser as a 2D page): the same world and models on the canvas,
// the view buttons (Table, Overview, Walk) in the bar, the selected tank's story in a glass panel.
// "Enter VR" appears only where the browser reports immersive-vr support; the headset starts at
// the table with the How to use card, the menu dock and the dashboard. The attack moment (a faked
// sensor appearing in the data) runs here, on the live data, for both: a toast on the page or in
// the headset, a chirp, the beacon, the shockwave and the torn gauge in the scene.
// The judge's VR view; never part of the 90-second demo.
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { XRStore } from "@react-three/xr";
import { money } from "@/lib/eog/alerts";
import { useAvonConsole } from "@/lib/live";
import { ConnBadge, connState } from "@/app/ui/Badge";
import TwinCanvas from "./TwinCanvas";
import { Labels, type Anchors } from "./Labels";
import { labelLifts, layoutSite, tankStates, topFacility, type TankState, type Tone } from "./model";
import { visibleLabels } from "./look";
import { C, FONT, TONE_COLOR } from "./theme";
import { useStill, useView, ViewButtons, ViewProvider } from "./nav";
import { confirmedFacilities, useAttackFx, type FxNotice } from "./fx";
import { twinXR } from "./xr";
import css from "./twin.module.css";

const TONE: Record<Tone, string> = { alert: css.toneAlert, warn: css.toneWarn, ok: css.toneOk };

// The theme as CSS variables, so the stylesheet holds no colors or fonts of its own. The shared
// connection badge reads the product tokens (--background, --surface, --alert...): those too.
const THEME_VARS = {
  "--sky": C.skyZenith, "--sky-mid": C.skyMid, "--sky-horizon": C.skyHorizon, "--dusk": C.duskGlow,
  "--holo": C.holo, "--holo-dim": C.holoDim, "--glass": C.glass, "--text": C.text, "--text-dim": C.textDim,
  "--ok": C.ok, "--warn-c": C.warn, "--alert-c": C.alert,
  "--font-label": FONT.label, "--font-body": FONT.body,
  "--background": C.skyZenith, "--foreground": C.text, "--surface": C.glass, "--line": C.holoDim,
  "--alert": TONE_COLOR.alert, "--alert-bg": C.glass, "--alert-line": TONE_COLOR.alert, "--alert-solid": TONE_COLOR.alert,
  "--warn": TONE_COLOR.warn, "--warn-bg": C.glass, "--warn-line": TONE_COLOR.warn,
} as CSSProperties;

// Shows "Enter VR" only after the browser says it can open an immersive-vr session. Over plain
// http on a LAN address the page is not a secure context, navigator.xr is missing, and so is the button.
function useVrSupported(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    navigator.xr?.isSessionSupported("immersive-vr").then((yes) => { if (live) setOk(yes); }, () => {});
    return () => { live = false; };
  }, []);
  return ok;
}

// The selected tank's story, in the console's words: name, state, the fix and its cost, the
// evidence, what to bring. It slides in on open; picking another tank swaps the words in place.
function Panel({ s, here, onWalk, onClose }: { s: TankState; here: boolean; onWalk(): void; onClose(): void }) {
  return (
    <aside data-testid="twin-panel" aria-label={`${s.name} details`} className={css.panel} data-tone={s.tone}>
      <div key={s.facility_id} className={css.swap}>
        <header className={css.panelHead}>
          <div>
            <p className={css.kicker}>{s.short}</p>
            <h2 className={css.panelName}>{s.name}</h2>
          </div>
          <button type="button" className={css.close} onClick={onClose} aria-label="Close details">Close</button>
        </header>
        <ul className={css.states}>
          {s.lines.map((l) => <li key={l.text} data-line-tone={l.tone} className={`${css.state} ${TONE[l.tone]}`}>{l.text}</li>)}
        </ul>
        {(s.fix || s.evidence.length > 0) && (
          <section className={css.section}>
            {s.fix && (
              <>
                <p className={css.small}>The fix</p>
                <p data-testid="twin-fix" className={css.fix}><span>{s.fix.headline}</span><span className={css.cost}>{money(s.fix.cost)}</span></p>
              </>
            )}
            {s.evidence.length > 0 && (
              <ul data-testid="twin-evidence" className={css.evidence}>{s.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
            )}
          </section>
        )}
        <section className={css.section}>
          <h3 className={css.small}>What to bring</h3>
          <ul data-testid="twin-bring" className={css.bring}>{s.bring.map((b) => <li key={b}>{b}</li>)}</ul>
        </section>
        <div className={css.section}>
          {here
            ? <p className={css.here}>You are here</p>
            : <button type="button" data-testid="twin-walk" className={css.walk} onClick={onWalk}>Walk to this pad</button>}
        </div>
      </div>
    </aside>
  );
}

// The attack moment on a screen: the newest notice slides in under the bar for 4 s, in the
// console's words (fx events.ts). The headset shows the same notice as a 3D toast.
function PageToast({ latest }: { latest: FxNotice | null }) {
  const [shown, setShown] = useState<FxNotice | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen = useRef(latest?.seq ?? 0);
  useEffect(() => {
    if (!latest || latest.seq <= seen.current) return;
    seen.current = latest.seq;
    setShown(latest);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setShown(null), 4000);
  }, [latest]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!shown) return null;
  return (
    <div role="status" data-testid="twin-toast" key={shown.seq} className={css.toast} data-tone={shown.tone}>
      <p className={css.toastText}>{shown.text}</p>
      {shown.sub && <p className={css.toastSub}>{shown.sub}</p>}
    </div>
  );
}

function Foot({ hint }: { hint: string }) {
  return (
    <div className={css.foot}>
      <ul className={css.legend} aria-label="What the colors mean">
        <li><span className={`${css.swatch} ${css.swAlert}`} />Pump failed</li>
        <li><span className={`${css.swatch} ${css.swWarn}`} />Check or inspect</li>
        <li><span className={`${css.swatch} ${css.swOk}`} />OK</li>
        <li><span className={`${css.swatch} ${css.swRing}`} />Top problem</li>
      </ul>
      <p className={css.hint}>{hint}</p>
    </div>
  );
}

const HINT = { table: "Click a tank. Drag to turn.", overview: "Click a tank. Drag to look around.", ground: "Drag to look around. Click a tank or a sign." } as const;

// `store` is for the emulator test page (app/twin/emulate); the real page uses the one XR store.
export default function TwinScreen({ store }: { store?: XRStore } = {}) {
  return (
    <ViewProvider>
      <TwinPage given={store} />
    </ViewProvider>
  );
}

function TwinPage({ given }: { given?: XRStore }) {
  const avon = useAvonConsole();
  const { mode, focus, setMode, setDashboard } = useView();
  const [store] = useState<XRStore>(() => given ?? twinXR());
  const vr = useVrSupported();
  const still = useStill();
  const [vrError, setVrError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [turn, setTurn] = useState(0);                 // snap turn, in 30 degree steps
  const [viewKey, setViewKey] = useState(0);
  const [anchors] = useState<Anchors>(() => new Map());
  // Everything below comes from the last facilities and view received, so a disconnect keeps
  // the model on screen.
  const { tanks, clusters } = useMemo(() => layoutSite(avon.facilities), [avon.facilities]);
  const list = useMemo(() => tankStates(avon.facilities, avon.view), [avon.facilities, avon.view]);
  const states = useMemo(() => new Map(list.map((s) => [s.facility_id, s])), [list]);
  const top = useMemo(() => topFacility(avon.view), [avon.view]);
  const labelled = useMemo(() => visibleLabels(list, { top, hovered, selected }), [list, top, hovered, selected]);
  const lifts = useMemo(() => labelLifts(tanks.filter((t) => labelled.has(t.facility_id)), list), [tanks, list, labelled]);
  // The attack moment, from the live data: what changed since the last snapshot, and which tanks
  // read a SIMULATED sensor now.
  const faultAssets = useMemo(() => new Set(avon.faults.map((f) => f.asset_id)), [avon.faults]);
  const confirmed = useMemo(() => confirmedFacilities(avon.view, avon.confirmations), [avon.view, avon.confirmations]);
  const fx = useAttackFx(list, { confirmed, faultAssets });
  const picked = selected ? states.get(selected) ?? null : null;

  // A new view starts facing north: the table's turn and the judge's snap turn go back to 0 (while
  // the view is faded out).
  useEffect(() => { setTurn(0); }, [mode, focus]);

  // On entering VR: the table view, facing north, nothing selected. The first look is the table
  // with the top problem's ring and tag, the welcome card and the dock, not a panel over the site
  // (the judge opens one with the trigger).
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => store.subscribe((s, prev) => {
    if (s.session && !prev.session) {
      setTurn(0);
      setSelected(null);
      setDashboard(false);
      if (modeRef.current !== "table") setMode("table");
    }
  }), [store, setMode, setDashboard]);

  const turnBy = useCallback((dir: 1 | -1) => setTurn((t) => (t + dir + 12) % 12), []);
  const resetView = useCallback(() => { setTurn(0); setViewKey((k) => k + 1); }, []);
  // A leave only clears the tank it came from, so moving straight from one tank to the next keeps
  // the new one.
  const hover = useCallback((id: string, on: boolean) => setHovered((cur) => (on ? id : cur === id ? null : cur)), []);
  const select = useCallback((id: string | null) => setSelected(id), []);

  function enterVR() {
    setVrError(null);
    store.enterVR().catch((e: unknown) => setVrError(e instanceof Error ? e.message : String(e)));
  }

  return (
    <main className={css.page} style={THEME_VARS} data-view={mode}>
      <div className={css.stage}>
        <TwinCanvas
          store={store} facilities={avon.facilities} tanks={tanks} clusters={clusters} states={states} lifts={lifts} labelled={labelled}
          faked={fx.faked} waves={fx.waves} notices={fx.notices} selected={selected} hovered={hovered} top={top} turn={turn}
          viewKey={viewKey} still={still} onSelect={select} onHover={hover} onTurn={turnBy} onReset={resetView} anchors={anchors}
          locked={!!avon.lockdown?.active}
        />
        <Labels
          tanks={tanks} clusters={clusters} states={states} labelled={labelled} faked={fx.faked}
          selected={selected} top={top} still={still} onSelect={setSelected} onHover={hover} anchors={anchors}
        />
      </div>

      <header className={css.bar}>
        <Link href="/" className={css.wordmark}>Avon</Link>
        <h1 className={css.title}>Night shift</h1>
        <ViewButtons className={css.views} />
        <Link href="/vr" className={css.quiet}>VR station</Link>
        <div className={css.actions}>
          {vr && <button type="button" className={css.primary} onClick={enterVR}>Enter VR</button>}
          <button type="button" className={css.hairline} onClick={resetView}>Reset view</button>
          <ConnBadge state={connState(avon.status)} />
        </div>
      </header>

      {avon.status === "disconnected" && (
        <p role="alert" className={`${css.notice} ${css.noticeAlert}`}>DISCONNECTED from the live data. Showing the last data received.</p>
      )}
      {vrError && <p role="alert" className={css.notice}>Could not enter VR: {vrError}</p>}
      {tanks.length === 0 && (
        <p className={css.empty}>
          {avon.status === "connecting" ? "Connecting to the live data…"
            : avon.status === "connected" ? <>No site loaded yet. Load one on the <Link href="/console">console</Link>.</>
              : "No site data received yet."}
        </p>
      )}
      <PageToast latest={fx.latest} />
      <Foot hint={HINT[mode]} />
      {picked && (
        <Panel
          s={picked} here={mode === "ground" && focus === picked.facility_id}
          onWalk={() => setMode("ground", picked.facility_id)} onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
