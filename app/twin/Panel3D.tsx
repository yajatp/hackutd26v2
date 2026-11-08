"use client";
// The selected tank's story in the headset, in the console's words (model.ts tankStates): name,
// state lines, the fix and its cost, the evidence and what to bring, on holo glass.
//
// Where it goes (the fix for the Quest test of Sun 02:45: the trigger selected a tank, its ring
// lit, but no panel appeared). The old panel stood at one fixed spot 0.9 m to the right of the
// start, about 51 degrees off the judge's forward line and below the eyes, outside a Quest 3S's
// view while the judge looks down at the table, and it never moved when the site turned. Now the
// panel follows the selection every frame:
// - table: beside the table's rim on the selected tank's side, a little under eye level, so it
//   never covers the miniature (plan.ts rimPose), with a thin holo leader to the tank's roof;
// - overview: 1 m out, just beside the selected tank's bearing on the side toward the judge's
//   heading and never more than 24 degrees off it (plan.ts overviewPose), with the leader;
// - Walk: in front of the judge (plan.ts frontPose), catching up lazily when they turn away.
// It fades in, dips when another tank is picked, and has two buttons: Close, and Walk to this pad
// (the life-size view at that facility; "You are here" when the judge already stands there).
import { useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Mesh, Vector3, type Group, type MeshBasicMaterial } from "three";
import { money } from "@/lib/eog/alerts";
import type { PlacedTank, TankState, Tone } from "./model";
import { C, TONE_COLOR } from "./theme";
import { usePainted, type Painter } from "./nav/glass";
import { corners, glass, measure, rgba, text, wrap, type Ctx, type TextStyle } from "./nav/paint";
import { usePress, NO_HIT } from "./nav/follow";
import { followYaw, yawOf, type Follow } from "./nav/motion";
import type { SiteTransform } from "./nav";
import { TANK } from "./models";
import { approach } from "./look";
import { TOAST_ASIDE_M, TOAST_CLOCK } from "./fx/motion";
import { frontPose, overviewPose, PANEL_W, rimPose, sitePos } from "./plan";
import { TURNTABLE_R } from "./stage";

const PPM = 1500;                          // texture px per meter at scale 1
const W = Math.round(PANEL_W * PPM);       // 750 px
const M = 30;
const BTN_H = 86;
const CLOSE = 64;
const FADE_MS = 220;
const ANCHOR_MOVE_M = 0.3;                 // the head moves this far before the panel re-places
const GLASS_RAYCAST = Mesh.prototype.raycast;

interface PanelSpec {
  name: string; short: string; tone: Tone;
  lines: { text: string; tone: Tone }[];
  fix: { headline: string; cost: string } | null;
  evidence: string[]; bring: string[];
  walk: "walk" | "here" | null;
}
interface Rect { x: number; y: number; w: number; h: number }
interface PanelMeta { close: Rect; walk: Rect | null; h: number }

const T = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "label", weight: 600, ...extra });
const B = (size: number, extra: Partial<TextStyle> = {}): TextStyle => ({ size, face: "body", weight: 400, ...extra });

// One pass lays the panel out; with `draw` false it only measures (for the canvas height).
function layout(ctx: Ctx, s: PanelSpec, draw: boolean, H = 0): PanelMeta {
  const inner = W - 2 * M;
  let y = M + 6;
  const close: Rect = { x: W - M - CLOSE + 6, y: M - 4, w: CLOSE, h: CLOSE };
  if (draw) {
    glass(ctx, 2, 2, W - 4, H - 4, { r: 22, edge: C.holo, edgeAlpha: 0.9, edgePx: 3, glowPx: 14, tintAlpha: 0.18 });
    // A dark veil under the words (with the glass, about 93% opaque): the lit desert, the backdrop
    // facility's masts and the dock never show through the text.
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(8, 8, W - 16, H - 16, 18);
    ctx.fillStyle = rgba(C.skyZenith, 0.68);
    ctx.fill();
    ctx.restore();
    corners(ctx, 2, 2, W - 4, H - 4, 26, rgba(C.holo, 0.95), 4, 10);
    // The state's color along the top edge.
    ctx.save();
    ctx.shadowColor = TONE_COLOR[s.tone];
    ctx.shadowBlur = 14;
    ctx.fillStyle = TONE_COLOR[s.tone];
    ctx.fillRect(M, 10, W - 2 * M - CLOSE, 5);
    ctx.restore();
    // Close: a ring with a cross.
    ctx.save();
    ctx.strokeStyle = rgba(C.text, 0.85);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(close.x + CLOSE / 2, close.y + CLOSE / 2, CLOSE / 2 - 4, 0, Math.PI * 2);
    ctx.stroke();
    const c = CLOSE * 0.18, cx = close.x + CLOSE / 2, cy = close.y + CLOSE / 2;
    ctx.beginPath();
    ctx.moveTo(cx - c, cy - c); ctx.lineTo(cx + c, cy + c);
    ctx.moveTo(cx + c, cy - c); ctx.lineTo(cx - c, cy + c);
    ctx.stroke();
    ctx.restore();
  }
  const put = (str: string, x: number, style: TextStyle, lh: number) => {
    if (draw) text(ctx, str, x, y + lh / 2, style);
    y += lh;
  };
  put(s.short.toUpperCase(), M, T(24, { color: C.holo, spacing: 4 }), 34);
  put(s.name, M, T(52, { weight: 700 }), 62);
  y += 6;
  for (const l of s.lines) {
    if (draw) {
      ctx.save();
      ctx.fillStyle = TONE_COLOR[l.tone];
      ctx.shadowColor = TONE_COLOR[l.tone];
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(M + 9, y + 23, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const st = T(36, { weight: 700, color: TONE_COLOR[l.tone] });
    for (const row of wrap(ctx, l.text, inner - 30, st)) put(row, M + 30, st, 46);
  }
  const rule = () => {
    y += 14;
    if (draw) { ctx.fillStyle = rgba(C.holo, 0.28); ctx.fillRect(M, y, inner, 2); }
    y += 16;
  };
  if (s.fix) {
    rule();
    put("THE FIX", M, T(24, { color: C.textDim, spacing: 4 }), 34);
    const cost = T(38, { weight: 700, color: C.holo });
    const cw = measure(ctx, s.fix.cost, cost);
    const head = T(36, { weight: 600 });
    const rows = wrap(ctx, s.fix.headline, inner - cw - 24, head);
    if (draw) text(ctx, s.fix.cost, W - M, y + 23, { ...cost, align: "right" });
    for (const r of rows) put(r, M, head, 46);
  }
  if (s.evidence.length > 0) {
    if (!s.fix) rule();
    y += 6;
    const st = B(28, { color: C.textDim });
    for (const e of s.evidence.slice(0, 2)) {
      for (const r of wrap(ctx, e, inner, st).slice(0, 3)) put(r, M, st, 36);
      y += 4;
    }
  }
  rule();
  put("WHAT TO BRING", M, T(24, { color: C.textDim, spacing: 4 }), 34);
  const bs = B(30, { weight: 500 });
  for (const b of s.bring.slice(0, 3)) {
    if (draw) { ctx.fillStyle = C.holo; ctx.fillRect(M + 2, y + 15, 10, 10); }
    for (const r of wrap(ctx, b, inner - 26, bs)) put(r, M + 26, bs, 40);
    y += 4;
  }
  let walk: Rect | null = null;
  if (s.walk) {
    y += 16;
    walk = { x: M, y, w: inner, h: BTN_H };
    if (draw) {
      if (s.walk === "walk") {
        glass(ctx, walk.x, walk.y, walk.w, walk.h, { r: 16, fill: C.holo, fillAlpha: 0.92, edge: C.text, edgeAlpha: 0.8, edgePx: 3 });
        text(ctx, "WALK TO THIS PAD", W / 2, y + BTN_H / 2 + 2, T(36, { weight: 700, color: C.skyZenith, align: "center", spacing: 3 }));
      } else {
        glass(ctx, walk.x, walk.y, walk.w, walk.h, { r: 16, edge: C.holoDim, edgeAlpha: 0.9, edgePx: 2, tintAlpha: 0.08 });
        text(ctx, "YOU ARE HERE", W / 2, y + BTN_H / 2 + 2, T(32, { weight: 700, color: C.textDim, align: "center", spacing: 4 }));
      }
    }
    if (s.walk === "here") walk = null;
    y += BTN_H;
  }
  return { close, walk, h: Math.ceil(y + M) };
}

let measurer: Ctx | null = null;
const panelPainter: Painter<PanelSpec, PanelMeta> = {
  size(s) {
    measurer ??= document.createElement("canvas").getContext("2d")!;
    return { w: W, h: layout(measurer, s, false).h };
  },
  paint(ctx, s, w, h) { return layout(ctx, s, true, h); },
};

// A pressable patch of the panel: invisible, with a holo glow while pointed at.
function HitPatch({ name, r, texH, onPress }: { name: string; r: Rect; texH: number; onPress(): void }) {
  const { state, handlers } = usePress(onPress);
  const glow = useRef<MeshBasicMaterial>(null);
  const mesh = useRef<Mesh>(null);
  // Drawn only while pointed at (the headset's pointers still hit it when hidden).
  useFrame(() => {
    const on = state.current.hover;
    if (mesh.current) mesh.current.visible = on;
    if (glow.current) glow.current.opacity = on ? (state.current.down ? 0.5 : 0.28) : 0;
  });
  const x = (r.x + r.w / 2) / PPM - PANEL_W / 2, y = texH / PPM / 2 - (r.y + r.h / 2) / PPM;
  return (
    <group position={[x, y, 0.002]}>
      <mesh ref={mesh} visible={false} name={name} {...handlers}>
        <planeGeometry args={[r.w / PPM, r.h / PPM]} />
        <meshBasicMaterial ref={glow} color={C.holo} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </group>
  );
}

function specOf(s: TankState, walk: PanelSpec["walk"]): PanelSpec {
  return {
    name: s.name, short: s.short, tone: s.tone, lines: s.lines,
    fix: s.fix ? { headline: s.fix.headline, cost: money(s.fix.cost) } : null,
    evidence: s.evidence, bring: s.bring, walk,
  };
}

export function Panel3D({ s, t, tanks, root, still, onClose, onWalk }: {
  s: TankState | null;
  t: SiteTransform;
  tanks: PlacedTank[];                      // layout positions (model.ts layoutSite)
  root: RefObject<Group | null>;            // the site root (turns with the table)
  still: boolean;
  onClose(): void;
  onWalk(facilityId: string): void;
}) {
  // The last tank shown stays drawn while the panel fades out.
  const [shown, setShown] = useState<TankState | null>(s);
  if (s && s !== shown) setShown(s);
  const walk: PanelSpec["walk"] = shown ? (t.mode === "ground" && t.focus === shown.facility_id ? "here" : "walk") : null;
  const spec = useMemo(() => (shown ? specOf(shown, walk) : null), [shown, walk]);
  const painted = usePainted(panelPainter, spec ?? specOf(EMPTY, null));

  const group = useRef<Group>(null);
  const face = useRef<Group>(null);
  const mat = useRef<MeshBasicMaterial>(null);
  const lead = useRef<Mesh>(null);
  const leadMat = useRef<MeshBasicMaterial>(null);
  const k = useRef({ fade: 0, id: null as string | null, anchor: null as Vector3 | null, at: null as Vector3 | null, follow: null as Follow | null, side: 1 as 1 | -1 });
  const v = useMemo(() => ({ head: new Vector3(), dir: new Vector3(), tank: new Vector3(), goal: new Vector3(), edge: new Vector3(), mid: new Vector3() }), []);

  useFrame(({ camera }, dtRaw) => {
    const g = group.current;
    if (!g) return;
    const st = k.current, ms = Math.min(dtRaw, 0.1) * 1000;
    const id = s?.facility_id ?? null;
    const changed = id !== null && id !== st.id;
    if (changed && st.id !== null) st.fade = Math.min(st.fade, 0.3);
    st.fade = approach(st.fade, s ? 1 : 0, ms, still ? 0 : FADE_MS);
    if (!s && st.fade < 0.01) st.fade = 0;
    g.visible = st.fade > 0 && !!painted;
    if (mat.current) mat.current.opacity = st.fade;
    if (!g.visible) { st.id = id; st.anchor = null; st.at = null; return; }

    camera.getWorldPosition(v.head);
    camera.getWorldDirection(v.dir);
    // Re-place from a head position that only moves once the judge has really moved (no swimming).
    if (changed || !st.anchor || st.anchor.distanceTo(v.head) > ANCHOR_MOVE_M) st.anchor = (st.anchor ?? new Vector3()).copy(v.head);
    const a = st.anchor;
    let scale = 1;
    const ground = t.mode === "ground";
    // Ground and overview follow the judge's heading lazily (catching up past 45 degrees).
    const headYaw = Math.hypot(v.dir.x, v.dir.z) > 0.2 || !st.follow ? yawOf(v.dir.x, v.dir.z) : st.follow.yaw;
    st.follow = !st.follow || changed ? { yaw: headYaw, catching: false } : followYaw(st.follow, headYaw, ms, { followDeg: 45, still });
    if (ground) {
      const p = frontPose([a.x, a.y, a.z], st.follow.yaw, 1.05, 0.26, 0.12);
      v.goal.set(p[0], p[1], p[2]);
      scale = 1.15;
    } else if (shown && root.current) {
      const p = sitePos(t, tanks.find((x) => x.facility_id === shown.facility_id) ?? { x: 0, z: 0 });
      v.tank.set(p[0], TANK.top * t.modelScale, p[2]);
      root.current.localToWorld(v.tank);
      root.current.getWorldPosition(v.mid);
      // The table: beside the table's rim at about eye level, never over the miniature. The
      // overview: just beside the tank's bearing, toward the judge's heading, always in view.
      const pose = t.mode === "table"
        ? rimPose([a.x, a.y, a.z], [v.mid.x, v.mid.y, v.mid.z], [v.tank.x, v.tank.y, v.tank.z], TURNTABLE_R)
        : overviewPose([a.x, a.y, a.z], st.follow.yaw, [v.tank.x, v.tank.y, v.tank.z]);
      v.goal.set(pose.at[0], pose.at[1], pose.at[2]);
      scale = pose.scale;
      st.side = pose.side;
    }
    // The attack moment's toast takes the middle of the view: step aside, out of its way.
    if (TOAST_CLOCK.up) {
      const dx = v.goal.x - a.x, dz = v.goal.z - a.z, d = Math.hypot(dx, dz) || 1;
      v.goal.x += (-dz / d) * st.side * TOAST_ASIDE_M;
      v.goal.z += (dx / d) * st.side * TOAST_ASIDE_M;
    }
    if (!st.at || changed) st.at = v.goal.clone();
    else {
      const settle = still ? 0 : 180;
      st.at.set(approach(st.at.x, v.goal.x, ms, settle), approach(st.at.y, v.goal.y, ms, settle), approach(st.at.z, v.goal.z, ms, settle));
    }
    g.position.copy(st.at);
    g.scale.setScalar(scale * (still ? 1 : 0.94 + 0.06 * st.fade));
    g.lookAt(v.head);
    st.id = id;

    // The leader: from the panel's edge nearest the tank to the tank's roof (table and overview).
    const l = lead.current;
    if (l && leadMat.current) {
      l.visible = !ground;
      if (!ground) {
        // The panel faces the eyes, so its local -x is the judge's left: the edge nearer the tank.
        v.edge.set((-st.side * PANEL_W) / 2, 0, 0);
        g.localToWorld(v.edge);
        const len = v.edge.distanceTo(v.tank);
        l.position.copy(v.edge).add(v.tank).multiplyScalar(0.5);
        l.lookAt(v.tank);
        l.scale.set(1, 1, len);
        leadMat.current.opacity = 0.7 * st.fade;
      }
    }
  });

  return (
    <>
      <group ref={group} visible={false} name="twin-vr-panel">
        {painted && (
          <group ref={face}>
            {/* While open, the glass takes the ray (its own click listener stops it), so pointing at
                the panel never picks a tank behind it. Closed (fading out, or hidden while the
                dashboard is open) it and its buttons take no ray at all: the headset's pointers hit
                any object with a listener, visible or not, so an invisible Close or Walk to this pad
                would stay live in mid-air. */}
            <mesh renderOrder={20} name="twin-vr-panel-glass" onClick={(e) => e.stopPropagation()} raycast={s ? GLASS_RAYCAST : NO_HIT}>
              <planeGeometry args={[PANEL_W, painted.h / PPM]} />
              <meshBasicMaterial ref={mat} map={painted.texture} transparent opacity={0} depthWrite={false} toneMapped={false} fog={false} />
            </mesh>
            {s && <HitPatch name="twin-vr-panel-close" r={painted.meta.close} texH={painted.h} onPress={onClose} />}
            {s && painted.meta.walk && shown && <HitPatch name="twin-vr-panel-walk" r={painted.meta.walk} texH={painted.h} onPress={() => onWalk(shown.facility_id)} />}
          </group>
        )}
      </group>
      <mesh ref={lead} visible={false} raycast={NO_HIT} renderOrder={19}>
        <boxGeometry args={[0.0018, 0.0018, 1]} />
        <meshBasicMaterial ref={leadMat} color={C.holo} transparent opacity={0} blending={AdditiveBlending} depthWrite={false} toneMapped={false} fog={false} />
      </mesh>
    </>
  );
}

const EMPTY: TankState = {
  facility_id: "", system_id: "", tank_id: "", name: "", short: "", tone: "ok", sensor: null,
  lines: [], fill: null, evidence: [], fix: null, bring: [],
};
