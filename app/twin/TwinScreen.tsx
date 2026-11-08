"use client";
// /twin: the loaded site as a tabletop model, from the live avon data only. Works in any
// browser (and the Quest browser as a 2D page). "Enter VR" appears only where the browser
// reports immersive-vr support. The judge's VR view; never part of the 90-second demo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/eog/alerts";
import { useAvonConsole } from "@/lib/live";
import { AppHeader } from "@/app/ui/AppHeader";
import { ConnBadge, connState } from "@/app/ui/Badge";
import TwinCanvas from "./TwinCanvas";
import { Labels, type Anchors } from "./Labels";
import { labelLifts, layoutSite, tankStates, topFacility, type TankState, type Tone } from "./model";
import { twinXR } from "./xr";

const STATE_BOX: Record<Tone, string> = {
  alert: "border-alert-line bg-alert-bg text-alert",
  warn: "border-warn-line bg-warn-bg text-warn",
  ok: "border-line bg-surface-2",
};
const ICON: Record<Tone, string> = { alert: "▲", warn: "●", ok: "✓" };

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

function Panel({ s, onClose }: { s: TankState; onClose(): void }) {
  return (
    <aside
      data-testid="twin-panel"
      aria-label={`${s.name} details`}
      className="absolute inset-x-3 bottom-3 z-10 flex max-h-[60%] flex-col gap-3 overflow-y-auto rounded-lg border border-line bg-surface p-4 shadow-xl sm:inset-x-auto sm:right-3 sm:top-3 sm:max-h-none sm:w-96"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{s.name}</h2>
          <p className="text-sm text-muted">Tank {s.tank_id} · system {s.system_id}</p>
        </div>
        <button type="button" className="btn" onClick={onClose} aria-label="Close details">✕</button>
      </header>
      <section className="flex flex-col gap-1.5">
        {s.lines.map((l) => (
          <p key={l.text} data-line-tone={l.tone} className={`rounded-md border-2 px-3 py-1.5 font-bold ${STATE_BOX[l.tone]}`}>
            <span aria-hidden="true">{ICON[l.tone]} </span>{l.text}
          </p>
        ))}
      </section>
      {s.evidence.length > 0 && (
        <section>
          <h3 className="section-title">Evidence</h3>
          <ul data-testid="twin-evidence" className="mt-1 flex flex-col gap-1 text-sm">{s.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
        </section>
      )}
      {s.fix && (
        <section>
          <h3 className="section-title">Fix</h3>
          <p data-testid="twin-fix" className="mt-1 flex items-baseline justify-between gap-3 text-lg font-bold">
            <span>{s.fix.headline}</span><span className="tabular-nums">{money(s.fix.cost)}</span>
          </p>
        </section>
      )}
      <section>
        <h3 className="section-title">What to bring</h3>
        <ul data-testid="twin-bring" className="mt-1 list-disc pl-5 text-sm">{s.bring.map((b) => <li key={b}>{b}</li>)}</ul>
      </section>
    </aside>
  );
}

function Legend() {
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-[5] hidden max-w-xs rounded-md bg-zinc-900/80 p-2 text-xs leading-relaxed text-zinc-200 sm:block">
      <p><span className="font-bold text-red-400">▲ red</span> pump failed · <span className="font-bold text-amber-300">● amber</span> sensor to check or inspect · <span className="font-bold text-zinc-400">gray</span> OK</p>
      <p>Fill is the tank level an alert reports; a gray half fill means not reported. Pulsing: a sensor is dead, drifting or lying. The white ring marks the console&apos;s top problem.</p>
      <p className="text-zinc-400">Click a tank for details. Drag to turn, scroll to zoom.</p>
    </div>
  );
}

export default function TwinScreen() {
  const avon = useAvonConsole();
  const store = useMemo(() => twinXR(), []);
  const vr = useVrSupported();
  const [vrError, setVrError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [turn, setTurn] = useState(0);                 // model rotation in 30 degree steps
  const [viewKey, setViewKey] = useState(0);
  const [anchors] = useState<Anchors>(() => new Map());
  // Everything below comes from the last facilities and view received, so a disconnect keeps
  // the model on screen.
  const { tanks, clusters } = useMemo(() => layoutSite(avon.facilities), [avon.facilities]);
  const list = useMemo(() => tankStates(avon.facilities, avon.view), [avon.facilities, avon.view]);
  const states = useMemo(() => new Map(list.map((s) => [s.facility_id, s])), [list]);
  const lifts = useMemo(() => labelLifts(tanks, list), [tanks, list]);
  const top = useMemo(() => topFacility(avon.view), [avon.view]);
  const picked = selected ? states.get(selected) ?? null : null;

  // On entering VR the model faces north again and the console's top tank is selected, so the
  // judge's first look (and the info panel) lands on the story.
  const topRef = useRef(top);
  useEffect(() => { topRef.current = top; }, [top]);
  useEffect(() => store.subscribe((s, prev) => {
    if (s.session && !prev.session) {
      setTurn(0);
      setSelected((cur) => topRef.current ?? cur);
    }
  }), [store]);

  const turnBy = useCallback((dir: 1 | -1) => setTurn((t) => (t + dir + 12) % 12), []);
  const resetView = useCallback(() => { setTurn(0); setViewKey((k) => k + 1); }, []);

  function enterVR() {
    setVrError(null);
    store.enterVR().catch((e: unknown) => setVrError(e instanceof Error ? e.message : String(e)));
  }

  return (
    <main className="flex h-dvh flex-col">
      <div className="px-4 pt-3">
        <AppHeader
          product="Avon" title="site twin"
          sub={avon.view ? `${avon.source?.datasetId ?? "site"} · now ${new Date(avon.view.now * 1000).toISOString().slice(11, 16)} UTC` : undefined}
        >
          {vr && <button type="button" className="btn btn-primary" onClick={enterVR}>Enter VR</button>}
          <button type="button" className="btn" onClick={resetView}>Reset view</button>
          <ConnBadge state={connState(avon.status)} />
        </AppHeader>
      </div>
      {avon.status === "disconnected" && (
        <p role="alert" className="border-b-2 border-alert-line bg-alert-bg px-4 py-2 font-semibold text-alert">
          ▲ DISCONNECTED from the live data. Showing the last data received.
        </p>
      )}
      {vrError && <p role="alert" className="bg-warn-bg px-4 py-2 text-sm text-warn">Could not enter VR: {vrError}</p>}
      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-0 isolate" data-turn={turn}>
          <TwinCanvas
            store={store} tanks={tanks} clusters={clusters} states={states} lifts={lifts}
            selected={selected} top={top} turn={turn} viewKey={viewKey}
            onSelect={setSelected} onTurn={turnBy} onReset={resetView} anchors={anchors}
          />
        </div>
        <Labels tanks={tanks} clusters={clusters} states={states} selected={selected} top={top} onSelect={setSelected} anchors={anchors} />
        {tanks.length === 0 && (
          <p className="absolute inset-x-0 top-1/3 z-10 mx-auto w-fit rounded-md bg-zinc-900/85 px-4 py-3 text-zinc-100">
            {avon.status === "connecting" ? "Connecting to the live data…"
              : avon.status === "connected" ? <>No site loaded yet. Load one on the <Link className="underline" href="/console">console</Link>.</>
                : "No site data received yet."}
          </p>
        )}
        <Legend />
        {picked && <Panel s={picked} onClose={() => setSelected(null)} />}
      </div>
    </main>
  );
}
