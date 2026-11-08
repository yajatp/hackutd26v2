"use client";
// Words in the headset (the page's DOM labels do this on a screen, Labels.tsx). Each label is the
// console's words exactly (model.ts labelRows): the tank's short name, then its state lines, on
// holo glass in Chakra Petch with a bar in the state's color down its left side. A faked tank's
// label jolts on the /vr glitch cadence (fx useGlitch).
// - Table and overview: over each labelled tank (a problem, the top problem, the one pointed at or
//   opened), stacked by model.ts labelLifts so neighbours never cover each other, on a thin holo
//   stem; bigger in the overview, where the tanks are metres away.
// - Walk: over the focus tank, and, for every other labelled facility, a signpost just outside the
//   pad in its real direction ("8.2 km NE"), big enough to read from across the pad. Pointing at a
//   label or a sign selects its facility.
import { useMemo, useRef } from "react";
import { Billboard } from "@react-three/drei";
import { AdditiveBlending, type Group } from "three";
import { labelRows, LABEL_ROW_M, type PlacedTank, type TankState, type Tone } from "./model";
import { C, TONE_COLOR } from "./theme";
import { usePainted, type Painter } from "./nav/glass";
import { glass, measure, text, type TextStyle } from "./nav/paint";
import { useGlitch } from "./fx";
import { noRay, TANK } from "./models";
import { groundMarkers, MARKER_K, MINI, sitePos, type V3 } from "./plan";
import type { SiteTransform } from "./nav";
import { usePick } from "./pick";

const ROW_PX = 40;
const FONT_PX = 30;
const PAD_Y = 10;                          // with ROW_PX, a label is exactly model.ts labelSize tall
const PAD_X = 14;
const BAR = 6;
export const LABEL_PPM = ROW_PX / LABEL_ROW_M;

interface LabelSpec { rows: { text: string; tone: Tone | "name" }[]; bar: Tone; on: boolean; top: boolean; foot: string | null }

const styleOf = (tone: Tone | "name" | "foot"): TextStyle => tone === "name"
  ? { size: FONT_PX, weight: 600, color: C.text, spacing: 0.5 }
  : tone === "foot"
    ? { size: FONT_PX - 4, weight: 600, color: C.holo, spacing: 1.5 }
    : { size: FONT_PX, weight: 700, color: TONE_COLOR[tone], spacing: 0.5 };

let measurer: CanvasRenderingContext2D | null = null;
function ctx2d(): CanvasRenderingContext2D {
  measurer ??= document.createElement("canvas").getContext("2d")!;
  return measurer;
}

const labelPainter: Painter<LabelSpec, null> = {
  size(s) {
    const ctx = ctx2d();
    let w = 0;
    for (const r of s.rows) w = Math.max(w, measure(ctx, r.text, styleOf(r.tone)));
    if (s.foot) w = Math.max(w, measure(ctx, s.foot, styleOf("foot")));
    const rows = s.rows.length + (s.foot ? 1 : 0);
    return { w: Math.ceil(w + 2 * PAD_X + BAR + 8), h: rows * ROW_PX + 2 * PAD_Y };
  },
  paint(ctx, s, W, H) {
    const hot = s.on || s.top;
    glass(ctx, 1, 1, W - 2, H - 2, {
      r: 9, edge: hot ? C.holo : C.holoDim, edgeAlpha: hot ? 1 : 0.85, edgePx: s.on ? 4 : 2, glowPx: s.on ? 8 : 0, tintAlpha: 0.16,
    });
    ctx.save();
    ctx.shadowColor = TONE_COLOR[s.bar];
    ctx.shadowBlur = 8;
    ctx.fillStyle = TONE_COLOR[s.bar];
    ctx.fillRect(7, PAD_Y, BAR, H - 2 * PAD_Y);
    ctx.restore();
    const x = 7 + BAR + 9;
    s.rows.forEach((r, i) => text(ctx, r.text, x, PAD_Y + ROW_PX * (i + 0.5) + 1, styleOf(r.tone)));
    if (s.foot) text(ctx, s.foot, x, PAD_Y + ROW_PX * (s.rows.length + 0.5) + 1, styleOf("foot"));
    return null;
  },
};

function specOf(s: TankState, on: boolean, top: boolean, foot: string | null = null): LabelSpec {
  return { rows: labelRows(s), bar: s.tone, on, top, foot };
}

// One label: its bottom edge at `at` (the parent's frame), `k` times a table label's size, facing
// the eyes. `stemTo` draws a thin holo line down to that point (the tank's top, the ground).
function Label3D({ spec, at, k, stemTo, faked, still, seed, pick }: {
  spec: LabelSpec; at: V3; k: number; stemTo: V3 | null; faked: boolean; still: boolean; seed: number;
  pick: ReturnType<typeof usePick>;
}) {
  const tex = usePainted(labelPainter, spec);
  const jolt = useRef<Group>(null);
  useGlitch(faked, { still, seed, target: jolt, amp: 0.006 * k });
  if (!tex) return null;
  const w = (tex.w / LABEL_PPM) * k, h = (tex.h / LABEL_PPM) * k;
  const stemH = stemTo ? at[1] - stemTo[1] : 0;
  return (
    <>
      {stemTo && stemH > 0.001 && (
        <mesh position={[stemTo[0], stemTo[1] + stemH / 2, stemTo[2]]} raycast={noRay} renderOrder={2}>
          <boxGeometry args={[0.0014 * k, stemH, 0.0014 * k]} />
          <meshBasicMaterial color={C.holo} transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
        </mesh>
      )}
      <group position={at}>
        <Billboard>
          <group ref={jolt}>
            <mesh position={[0, h / 2, 0]} renderOrder={4} {...pick}>
              <planeGeometry args={[w, h]} />
              <meshBasicMaterial map={tex.texture} transparent depthWrite={false} toneMapped={false} fog={false} />
            </mesh>
          </group>
        </Billboard>
      </group>
    </>
  );
}

interface LabelsProps {
  t: SiteTransform;
  tanks: PlacedTank[];
  states: Map<string, TankState>;
  labelled: Set<string>;
  lifts: Map<string, number>;
  faked: ReadonlySet<string>;
  selected: string | null;
  top: string | null;
  still: boolean;
  onSelect(id: string): void;
  onHover(id: string, on: boolean): void;
}

function TankLabel({ id, s, at, k, stemTo, on, top, faked, still, onSelect, onHover }: {
  id: string; s: TankState; at: V3; k: number; stemTo: V3 | null; on: boolean; top: boolean; faked: boolean; still: boolean;
  onSelect(id: string): void; onHover(id: string, on: boolean): void; foot?: string;
}) {
  const pick = usePick(id, true, onSelect, onHover);
  const spec = useMemo(() => specOf(s, on, top), [s, on, top]);
  return <Label3D spec={spec} at={at} k={k} stemTo={stemTo} faked={faked} still={still} seed={id.length} pick={pick} />;
}

function Sign({ id, s, at, foot, on, top, faked, still, onSelect, onHover }: {
  id: string; s: TankState; at: V3; foot: string; on: boolean; top: boolean; faked: boolean; still: boolean;
  onSelect(id: string): void; onHover(id: string, on: boolean): void;
}) {
  const pick = usePick(id, true, onSelect, onHover);
  const spec = useMemo(() => specOf(s, on, top, foot), [s, on, top, foot]);
  return <Label3D spec={spec} at={at} k={MARKER_K} stemTo={[at[0], 0, at[2]]} faked={faked} still={still} seed={id.length + 3} pick={pick} />;
}

// In the site root's frame (plan.ts): the table's middle in the table view, the world otherwise.
export function Labels3D({ t, tanks, states, labelled, lifts, faked, selected, top, still, onSelect, onHover }: LabelsProps) {
  const k = MINI[t.mode].labelK;
  const markers = useMemo(() => (t.mode === "ground" ? groundMarkers(t, tanks) : []), [t, tanks]);
  if (t.mode === "ground") {
    const focus = t.focus;
    const fs = focus ? states.get(focus) : undefined;
    return (
      <group name="labels-3d">
        {focus && fs && labelled.has(focus) && (
          <TankLabel id={focus} s={fs} at={[0, TANK.railY + 0.9, 0]} k={k} stemTo={null} on={selected === focus} top={top === focus}
            faked={faked.has(focus)} still={still} onSelect={onSelect} onHover={onHover} />
        )}
        {markers.map((m) => {
          const s = states.get(m.facility_id);
          if (!s || !labelled.has(m.facility_id)) return null;
          return (
            <Sign key={m.facility_id} id={m.facility_id} s={s} at={m.at} foot={`${m.distance} ${m.bearing}`}
              on={selected === m.facility_id} top={top === m.facility_id} faked={faked.has(m.facility_id)} still={still}
              onSelect={onSelect} onHover={onHover} />
          );
        })}
      </group>
    );
  }
  const roof = (TANK.railY + 0.5) * t.modelScale;
  return (
    <group name="labels-3d">
      {tanks.map((tank) => {
        const s = states.get(tank.facility_id);
        if (!s || !labelled.has(tank.facility_id)) return null;
        const p = sitePos(t, tank);
        const base: V3 = [p[0], roof, p[2]];
        const at: V3 = [p[0], roof + 0.014 * k + (lifts.get(tank.facility_id) ?? 0) * k, p[2]];
        return (
          <TankLabel key={tank.facility_id} id={tank.facility_id} s={s} at={at} k={k} stemTo={base}
            on={selected === tank.facility_id} top={top === tank.facility_id} faked={faked.has(tank.facility_id)} still={still}
            onSelect={onSelect} onHover={onHover} />
        );
      })}
    </group>
  );
}
