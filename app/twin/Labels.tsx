"use client";
// Tank and system labels as plain page DOM over the canvas, in the theme's holo glass (the
// stylesheet reads theme.ts through CSS variables). Each label registers its element
// under a key; the scene's projector (TwinCanvas) moves it to its 3D anchor every frame and
// lifts it, with a stem, when it would cover a more important label.
// Only tanks with something to say carry a label (look.ts visibleLabels): a red or amber state,
// the console's top problem, and the tank under the pointer or opened in the panel.
// Page DOM, so tests, screen readers and the Quest's 2D browser can read and click it.
import type { ReactNode } from "react";
import { labelRows, type Cluster, type PlacedTank, type TankState, type Tone } from "./model";
import css from "./twin.module.css";

export type Anchors = Map<string, HTMLElement>;
export const tankKey = (facility_id: string) => `tank:${facility_id}`;
export const systemKey = (system_id: string) => `sys:${system_id}`;

const TONE_CLASS: Record<Tone | "name", string> = { name: css.name, alert: css.toneAlert, warn: css.toneWarn, ok: css.toneOk };
const LAYER: Record<Tone, number> = { alert: 3, warn: 2, ok: 1 };   // problems stay on top where labels overlap

// Positioned at the canvas's top-left; the projector sets transform and visibility.
function Anchor({ k, anchors, z, children }: { k: string; anchors: Anchors; z: number; children: ReactNode }) {
  return (
    <div
      ref={(el) => { if (el) anchors.set(k, el); else anchors.delete(k); }}
      className={css.anchor}
      style={{ visibility: "hidden", zIndex: z }}
    >
      {children}
    </div>
  );
}


export function Labels({ tanks, clusters, states, labelled, faked, selected, top, still, onSelect, onHover, anchors }: {
  tanks: PlacedTank[]; clusters: Cluster[]; states: Map<string, TankState>; labelled: Set<string>; faked: ReadonlySet<string>;
  selected: string | null; top: string | null; still: boolean;
  onSelect(id: string): void; onHover(id: string, on: boolean): void; anchors: Anchors;
}) {
  void still;                               // the label glitch is gone (Sui style); kept for callers
  return (
    <div className={css.labels}>
      {clusters.map((c) => (
        <Anchor key={c.system_id} k={systemKey(c.system_id)} anchors={anchors} z={0}>
          <span data-twin-system={c.system_id} className={css.system}>{c.system_id}</span>
        </Anchor>
      ))}
      {tanks.map((t) => {
        const s = states.get(t.facility_id);
        if (!s || !labelled.has(s.facility_id)) return null;
        const on = selected === s.facility_id;
        const isTop = top === s.facility_id;
        const quiet = s.tone === "ok" && s.lines.length === 1;
        const words = quiet ? (
          <span className={css.row}>
            <span className={css.name}>{s.short}</span>{" "}
            <span data-line-tone={s.lines[0].tone} className={css.toneOk}>{s.lines[0].text}</span>
          </span>
        ) : labelRows(s).map((r, i) => (
          <span key={i} className={`${css.row} ${TONE_CLASS[r.tone]}`} data-line-tone={r.tone === "name" ? undefined : r.tone}>{r.text}</span>
        ));
        return (
          <Anchor key={t.facility_id} k={tankKey(t.facility_id)} anchors={anchors} z={on ? 9 : isTop ? 8 : LAYER[s.tone]}>
            <button
              type="button"
              className={css.label}
              data-twin-tank={s.facility_id}
              data-tone={s.tone}
              data-highlight={isTop ? "top" : undefined}
              data-faked={faked.has(s.facility_id) ? "true" : undefined}
              aria-pressed={on}
              aria-label={`${s.name}: ${s.lines.map((l) => l.text).join(", ")}`}
              onClick={() => onSelect(s.facility_id)}
              onPointerEnter={() => onHover(s.facility_id, true)}
              onPointerLeave={() => onHover(s.facility_id, false)}
            >
              {words}
            </button>
            <span data-stem aria-hidden="true" className={css.stem} />
          </Anchor>
        );
      })}
    </div>
  );
}
