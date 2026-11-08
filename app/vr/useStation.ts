"use client";

// Everything the VR station shows, from the live avon database and this browser. The /vr page
// and the design versions under /vr/lab render this; none of them reads data any other way.

import { useEffect, useMemo, useState } from "react";
import { useAvonConsole, type AvonStatus } from "@/lib/live";
import { layoutSite, tankStates, topFacility, type Cluster, type TankState } from "../twin/model";
import type { FieldTank } from "./field";

export type XrState = "checking" | "vr" | "insecure" | "no-headset" | "none";
export type Mark = "ok" | "warn" | "alert" | "info";
export interface Check { key: string; mark: Mark; title: string; detail: string }

// Browsers offer immersive VR only on a secure page: https or localhost. The Quest on
// http://<laptop IP> is neither, unless its browser flag says otherwise (docs/QUEST.md).
export function useXr(): XrState {
  const [state, setState] = useState<XrState>("checking");
  useEffect(() => {
    let live = true;
    const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
    const insecure = !window.isSecureContext;
    if (!xr) { setState(insecure ? "insecure" : "none"); return; }
    xr.isSessionSupported("immersive-vr").then(
      (yes) => { if (live) setState(yes ? "vr" : insecure ? "insecure" : "no-headset"); },
      () => { if (live) setState("none"); },
    );
    return () => { live = false; };
  }, []);
  return state;
}

// The address the Quest types for the browser flag: this page's own origin when it was opened over
// the LAN, else a placeholder (npm run demo prints the laptop's address).
export function useLanOrigin(): string {
  const [origin, setOrigin] = useState("http://<laptop IP>:3000");
  useEffect(() => {
    const h = window.location.hostname;
    if (h !== "localhost" && h !== "127.0.0.1") setOrigin(window.location.origin);
  }, []);
  return origin;
}

export interface Station {
  status: AvonStatus;
  xr: XrState;
  lanOrigin: string;
  datasetId: string | null;
  loaded: boolean;
  problems: number;
  tanks: FieldTank[];            // every tank, placed as on the /twin table, with its state
  pads: Cluster[];               // one pad per system
  states: Map<string, TankState>;
  top: string | null;            // the facility the judge starts at
  topState: TankState | undefined;
  topLine: string | undefined;   // its worst state line, in the console's words
  faked: string[];               // assets Phone 1 is faking right now
  checks: Check[];               // the readiness list, worst first is not implied: fixed order
  summary: string;
  clearFakes(): Promise<void>;
}

export function useStation(): Station {
  const avon = useAvonConsole();
  const xr = useXr();
  const lanOrigin = useLanOrigin();
  const { view, facilities, faults, status } = avon;

  const list = useMemo(() => tankStates(facilities, view), [facilities, view]);
  const states = useMemo(() => new Map(list.map((t) => [t.facility_id, t])), [list]);
  const top = useMemo(() => topFacility(view), [view]);
  const site = useMemo(() => layoutSite(facilities), [facilities]);
  const tanks = useMemo<FieldTank[]>(() => {
    const faked = new Set(faults.map((f) => f.asset_id));
    return site.tanks.map((p) => {
      const st = states.get(p.facility_id);
      return {
        facility_id: p.facility_id, x: p.x, z: p.z,
        tone: st?.tone ?? "ok",
        faked: !!st && (faked.has(st.tank_id) || st.lines.some((l) => l.text.includes("SIMULATED"))),
        fill: st?.fill ?? null,
      };
    });
  }, [site, faults, states]);

  const datasetId = avon.source?.datasetId ?? null;
  const topState = top ? states.get(top) : undefined;
  const topLine = topState?.lines.find((l) => l.tone !== "ok")?.text;
  const loaded = !!view && facilities.length > 0;
  const problems = view?.alerts.length ?? 0;

  let summary: string;
  if (status === "disconnected") summary = "The live data isn't reachable. Start Avon on the laptop with npm run demo, then reload.";
  else if (!loaded) summary = "No site is loaded yet. Load one on the console and its tanks appear on this table.";
  else summary = `${facilities.length} tanks, live from ${datasetId ?? "the loaded site"}.` +
    (topState ? ` The light starts on ${topState.name}${topLine ? `: ${topLine}` : ""}.` : "");

  const checks: Check[] = [];
  if (status === "connected") checks.push({ key: "live", mark: "ok", title: "Live data", detail: "Connected to SpacetimeDB. The model changes the moment Phone 1 fakes a tank." });
  else if (status === "connecting") checks.push({ key: "live", mark: "warn", title: "Connecting to the live data", detail: "Waiting for SpacetimeDB on port 3001." });
  else checks.push({ key: "live", mark: "alert", title: "No live data", detail: "This browser can't reach SpacetimeDB on port 3001. On the Quest, run both adb reverse lines again." });

  if (loaded) checks.push({ key: "site", mark: "ok", title: `${datasetId ?? "A site"} is loaded`, detail: `${facilities.length} tanks, ${problems} open ${problems === 1 ? "problem" : "problems"}.${topState ? ` The judge starts at ${topState.name}.` : ""}` });
  else checks.push({ key: "site", mark: "warn", title: "No site loaded", detail: "Load one on the console first." });

  if (xr === "vr") checks.push({ key: "xr", mark: "ok", title: "This browser can enter VR", detail: "Open the model, then press Enter VR at the top right." });
  else if (xr === "insecure") checks.push({ key: "xr", mark: "warn", title: "No VR on this address", detail: "The browser won't offer VR on the laptop's network address. Use the cable and localhost:3000/vr, or set the Quest Browser flag." });
  else if (xr === "checking") checks.push({ key: "xr", mark: "info", title: "Checking this browser", detail: "Asking the browser whether it can enter VR." });
  else checks.push({ key: "xr", mark: "info", title: "No headset on this browser", detail: "Expected on the laptop. Open this page in the Quest Browser to check the headset." });

  const fakedIds = faults.map((f) => f.asset_id);
  if (fakedIds.length === 0) checks.push({ key: "fake", mark: "ok", title: "No faked sensors", detail: "The judge starts from the site as it is." });
  else checks.push({ key: "fake", mark: "warn", title: `Phone 1 is faking ${fakedIds.join(", ")}`, detail: "Good while the judge is watching. Clear it before the next judge." });

  return {
    status, xr, lanOrigin, datasetId, loaded, problems, tanks, pads: site.clusters, states, top, topState, topLine,
    faked: fakedIds, checks, summary, clearFakes: () => avon.clear(),
  };
}
