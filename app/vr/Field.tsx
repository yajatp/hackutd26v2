"use client";

import { useEffect, useRef, useState } from "react";
import { labelRows, type TankState } from "../twin/model";
import { camera, inkOf, renderField, tankTop, torchAt, type Cam, type FieldTank, type Pad, type Point } from "./field";
import s from "./vr.module.css";

const INKS = { night: inkOf("#102231"), moon: inkOf("#d7dee0"), alert: inkOf("#ef4444"), warn: inkOf("#f59e0b") };

// The live table as a dithered picture. The light starts on the console's top problem and
// follows the pointer; it eases there so the dither visibly sweeps. Labels name only the tanks
// with something to say, in the console's words.
export function Field({ tanks, pads, states, top }: { tanks: FieldTank[]; pads: Pad[]; states: Map<string, TankState>; top: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [view, setView] = useState<{ cam: Cam; px: number } | null>(null);
  const torch = useRef<{ at: Point; to: Point; moved: boolean }>({ at: { x: 0, z: 0 }, to: { x: 0, z: 0 }, moved: false });
  const scene = useRef({ tanks, pads, top });
  const kick = useRef<() => void>(() => {});
  scene.current = { tanks, pads, top };

  // One dither pixel is 4 CSS pixels on a laptop, 3 on a phone, so edges stay crisp.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => {
      const px = el.clientWidth >= 900 ? 4 : 3;
      const W = Math.ceil(el.clientWidth / px), H = Math.ceil(el.clientHeight / px);
      setView((v) => (v && v.cam.W === W && v.cam.H === H ? v : { cam: camera(W, H), px }));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Until the pointer moves, the light rests on the top problem. Redraw on every data change.
  useEffect(() => {
    const t = torch.current;
    if (!t.moved) {
      const at = tanks.find((x) => x.facility_id === top);
      t.to = at ? { x: at.x, z: at.z } : { x: 0, z: 0 };
    }
    kick.current();
  }, [tanks, pads, top]);

  useEffect(() => {
    const c = canvas.current;
    if (!view || !c) return;
    const { cam } = view;
    c.width = cam.W;
    c.height = cam.H;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(cam.W, cam.H);
    const buf = new Uint32Array(img.data.buffer);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let first = true;

    const draw = (now: number) => {
      raf = 0;
      const t = torch.current;
      const dx = t.to.x - t.at.x, dz = t.to.z - t.at.z;
      const settling = !still && !first && Math.hypot(dx, dz) > 0.002;
      t.at = settling ? { x: t.at.x + dx * 0.18, z: t.at.z + dz * 0.18 } : t.to;
      first = false;
      const { tanks, pads, top } = scene.current;
      renderField(buf, cam, { tanks, pads, top, torch: t.at, tMs: now, still }, INKS);
      ctx.putImageData(img, 0, 0);
      // Keep drawing while the light moves or a faked tank is glitching.
      if (settling || (!still && tanks.some((x) => x.faked))) raf = requestAnimationFrame(draw);
    };
    kick.current = () => { if (!raf) raf = requestAnimationFrame(draw); };
    kick.current();
    return () => { cancelAnimationFrame(raf); kick.current = () => {}; };
  }, [view]);

  function point(e: React.PointerEvent) {
    if (!view) return;
    const r = e.currentTarget.getBoundingClientRect();
    torch.current.to = torchAt(view.cam, (e.clientX - r.left) / view.px, (e.clientY - r.top) / view.px);
    torch.current.moved = true;
    kick.current();
  }

  const labels = view ? placeLabels(view.cam, view.px, tanks, states, top) : [];
  return (
    <div ref={box} className={s.field} onPointerMove={point} onPointerDown={point}>
      <canvas
        ref={canvas}
        className={s.canvas}
        style={view ? { width: view.cam.W * view.px, height: view.cam.H * view.px } : undefined}
        role="img"
        aria-label={`The site's ${tanks.length} tanks on the table, as the headset shows them.`}
      />
      {labels.map((l, i) => (
        // Earlier labels sit on top, so a lifted label's leader line passes behind them.
        <div key={l.id} className={`${s.label} ${l.side === "right" ? s.labelRight : l.side === "left" ? s.labelLeft : ""}`} style={{ left: l.x, top: l.y - l.lift, zIndex: labels.length - i, ["--lead" as string]: `${12 + l.lift}px` }}>
          {l.rows.map((r, i) => (
            <span key={i} className={r.tone === "name" ? s.labelName : r.tone === "alert" ? s.toneAlert : s.toneWarn}>{r.text}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

// Labels for the top problem and every tank with a state, in the headset's words. On a laptop a
// state line stays whole; on a phone it breaks as in the headset (labelRows). A label that would
// cover one already placed is lifted or flagged (beside its leader line) instead; a tank with a
// labelled neighbour flags away from it. Labels never rise under the top bar, and every leader
// line ends on its own tank.
const ROW_PX = 16, CHAR_PX = 7.2, MIN_TOP = 60;
type Side = "center" | "right" | "left";

function placeLabels(cam: Cam, px: number, tanks: FieldTank[], states: Map<string, TankState>, top: string | null) {
  const rank = (t: FieldTank) => (t.facility_id === top ? 0 : t.tone === "alert" ? 1 : 2);
  const placed: { id: string; x: number; y: number; lift: number; side: Side; rows: { text: string; tone: string }[]; box: [number, number, number, number] }[] = [];
  const labelled = tanks.filter((x) => x.facility_id === top || x.tone !== "ok");
  const sx = new Map(labelled.map((t) => [t.facility_id, tankTop(cam, t).sx * px]));
  for (const t of [...labelled].sort((a, b) => rank(a) - rank(b))) {
    const st = states.get(t.facility_id);
    if (!st) continue;
    const rows = px >= 4
      ? [{ text: st.short, tone: "name" }, ...st.lines.filter((l) => l.tone !== "ok")]
      : labelRows(st).filter((r) => r.tone !== "ok");
    const p = tankTop(cam, t);
    const x = p.sx * px, y = p.sy * px - 14;
    const w = Math.max(...rows.map((r) => r.text.length)) * CHAR_PX + 12, h = rows.length * ROW_PX + 4;
    const span = (side: Side): [number, number] => (side === "center" ? [x - w / 2, x + w / 2] : side === "right" ? [x + 6, x + 6 + w] : [x - 6 - w, x - 6]);
    const hits = (side: Side, l: number) => {
      const [a0, c0] = span(side);
      return placed.some(({ box: [a, b, c, d] }) => a0 < c && c0 > a && y - l - h < d && y - l > b);
    };
    const maxLift = Math.max(0, y - h - MIN_TOP);
    // Two labelled tanks side by side: each flags away from the other, like a drawing's callouts.
    const near = labelled.filter((o) => o !== t && Math.abs(sx.get(o.facility_id)! - x) < w);
    const away: Side[] = near.length === 0 ? ["center", "right", "left"]
      : near.every((o) => sx.get(o.facility_id)! >= x) ? ["left", "center", "right"]
      : near.every((o) => sx.get(o.facility_id)! <= x) ? ["right", "center", "left"]
      : ["center", "right", "left"];
    let pick: { side: Side; lift: number } = { side: away[0], lift: 0 };
    search: for (const side of away) {
      for (let lift = 0; lift <= maxLift; lift += 6) if (!hits(side, lift)) { pick = { side, lift }; break search; }
    }
    const [a, c] = span(pick.side);
    placed.push({ id: t.facility_id, x, y: p.sy * px, lift: pick.lift, side: pick.side, rows, box: [a, y - pick.lift - h, c, y - pick.lift] });
  }
  return placed;
}
