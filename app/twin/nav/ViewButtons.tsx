"use client";
// The three views as page buttons, for /twin on a screen (or the Quest browser in 2D): Table,
// Overview, Walk, with the same fade and rules as the headset's dock (useView). In Walk, a select
// picks the facility pad. Colors and fonts come from the theme through CSS variables.
import { type CSSProperties } from "react";
import { useAvonConsole } from "@/lib/live";
import { C, FONT, VIEW, type ViewMode } from "../theme";
import { goToRows } from "./board";
import { useView } from "./ViewContext";
import css from "./nav.module.css";

const MODES: ViewMode[] = ["table", "overview", "ground"];

const VARS = {
  "--nav-glass": C.glass, "--nav-holo": C.holo, "--nav-holo-dim": C.holoDim, "--nav-text": C.text,
  "--nav-text-dim": C.textDim, "--nav-ink": C.skyZenith, "--nav-font": FONT.label, "--nav-body": FONT.body,
} as CSSProperties;

export function ViewButtons({ className, showGoTo = true }: { className?: string; showGoTo?: boolean }) {
  const { mode, focus, setMode, busy } = useView();
  const { facilities, view } = useAvonConsole();
  const rows = showGoTo && mode === "ground" ? goToRows(facilities, view) : [];
  return (
    <div role="group" aria-label="View" className={`${css.bar} ${className ?? ""}`} style={VARS} data-busy={busy || undefined}>
      {MODES.map((m) => (
        <button
          key={m} type="button" data-testid={`twin-view-${m}`} aria-pressed={mode === m} disabled={busy}
          className={`${css.btn} ${mode === m ? css.on : ""}`} onClick={() => setMode(m)}
        >
          {VIEW[m].label}
        </button>
      ))}
      {rows.length > 0 && (
        <label className={css.goto}>
          <span>Go to</span>
          <select value={focus ?? ""} disabled={busy} data-testid="twin-view-goto" onChange={(e) => setMode("ground", e.target.value)}>
            {rows.map((r) => <option key={r.facility_id} value={r.facility_id}>{r.label} · {r.state}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
