"use client";
// Tank and system labels as plain page DOM over the canvas. Each label registers its element
// under a key; the scene's projector (TwinCanvas) moves it to its 3D anchor every frame and
// lifts it, with a stem, when it would cover a more important label.
// Page DOM, so tests, screen readers and the Quest's 2D browser can read and click it.
import type { Cluster, PlacedTank, StateLine, TankState, Tone } from "./model";

export type Anchors = Map<string, HTMLElement>;
export const tankKey = (facility_id: string) => `tank:${facility_id}`;
export const systemKey = (system_id: string) => `sys:${system_id}`;

const CHIP: Record<Tone, string> = {
  alert: "border-red-500 bg-red-950/90 text-red-100",
  warn: "border-amber-500 bg-amber-950/90 text-amber-100",
  ok: "border-zinc-600 bg-zinc-900/85 text-zinc-200",
};
const LINE: Record<Tone, string> = { alert: "text-red-300", warn: "text-amber-300", ok: "text-zinc-300" };
const ICON: Record<Tone, string> = { alert: "▲", warn: "●", ok: "" };
const LAYER: Record<Tone, number> = { alert: 3, warn: 2, ok: 1 };   // problems stay on top where labels overlap

// One state line. It wraps where the chip is narrow, so the words stay one text run.
function LabelLine({ l, pulse }: { l: StateLine; pulse: boolean }) {
  return (
    <span data-line-tone={l.tone} className={`block max-w-[8.5rem] font-bold leading-tight ${LINE[l.tone]} ${pulse ? "animate-pulse" : ""}`}>
      {ICON[l.tone] && <span aria-hidden="true">{ICON[l.tone]} </span>}{l.text}
    </span>
  );
}

// Positioned at the canvas's top-left; the projector sets transform and visibility.
function Anchor({ k, anchors, z, children }: { k: string; anchors: Anchors; z: number; children: React.ReactNode }) {
  return (
    <div
      ref={(el) => { if (el) anchors.set(k, el); else anchors.delete(k); }}
      className="absolute left-0 top-0"
      style={{ visibility: "hidden", zIndex: z }}
    >
      {children}
    </div>
  );
}

export function Labels({ tanks, clusters, states, selected, top, onSelect, anchors }: {
  tanks: PlacedTank[]; clusters: Cluster[]; states: Map<string, TankState>;
  selected: string | null; top: string | null; onSelect(id: string): void; anchors: Anchors;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {clusters.map((c) => (
        <Anchor key={c.system_id} k={systemKey(c.system_id)} anchors={anchors} z={0}>
          <span data-twin-system={c.system_id} style={{ transform: "translate(-50%, 4px)" }}
            className="block whitespace-nowrap text-xs font-bold tracking-wide text-zinc-400">
            {c.system_id}
          </span>
        </Anchor>
      ))}
      {tanks.map((t) => {
        const s = states.get(t.facility_id);
        if (!s) return null;
        const on = selected === s.facility_id;
        const isTop = top === s.facility_id;
        const quiet = s.tone === "ok" && s.lines.length === 1;
        return (
          <Anchor key={t.facility_id} k={tankKey(t.facility_id)} anchors={anchors} z={on ? 9 : isTop ? 8 : LAYER[s.tone]}>
            <button
              type="button"
              data-twin-tank={s.facility_id}
              data-tone={s.tone}
              data-highlight={isTop ? "top" : undefined}
              aria-pressed={on}
              aria-label={`${s.name}: ${s.lines.map((l) => l.text).join(", ")}`}
              onClick={() => onSelect(s.facility_id)}
              style={{ transform: "translate(-50%, -100%)" }}
              className={`pointer-events-auto relative block cursor-pointer rounded border px-1.5 py-0.5 text-left text-[11px] leading-tight shadow ${CHIP[s.tone]} ${on ? "ring-2 ring-white" : ""} ${isTop && !on ? "outline-2 outline-offset-2 outline-white/90" : ""}`}
            >
              {isTop && <span aria-hidden="true" className="pointer-events-none absolute -inset-1 animate-pulse rounded border-2 border-white" />}
              {quiet ? (
                <span className="block whitespace-nowrap">
                  <span className="text-[10px] font-semibold opacity-80">{s.short}</span>{" "}
                  <span data-line-tone={s.lines[0].tone} className={`font-bold ${LINE.ok}`}>{s.lines[0].text}</span>
                </span>
              ) : (
                <>
                  <span className="block whitespace-nowrap text-[10px] font-semibold opacity-80">{s.short}</span>
                  {s.lines.map((l, i) => <LabelLine key={l.text} l={l} pulse={s.sensor !== null && i === 0} />)}
                </>
              )}
            </button>
            <span data-stem aria-hidden="true" className="pointer-events-none absolute left-0 top-0 w-px bg-zinc-400/80" style={{ height: 0 }} />
          </Anchor>
        );
      })}
    </div>
  );
}
