"use client";
// The Darkroom's furniture: four server racks with drive-bay fronts and status LEDs, cable trays
// above them, the desk, a second monitor, three office chairs, papers on the desk and the floor,
// binders, a filing cabinet, a whiteboard and a wall clock. Quiet and physical, no glow: the LEDs
// are small flat dots (steady blue/green, a few amber blinkers), not light sources.
// Draw calls: props 1, rack fronts 1, LEDs 1, chairs 1, papers 1, monitor 1, whiteboard 1, clock 1,
// ceiling panels 1. Layout and the seeded scatter live in furnish.ts (tested).
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color, CylinderGeometry, DoubleSide, Euler, InstancedMesh, Matrix4, PlaneGeometry, Quaternion, Vector3,
  type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { at, Parts } from "../models/kit";
import { canvasTexture, SUI, write } from "../usmap/paint";
import { useFonts } from "./Button3D";
import {
  CABINET, CHAIRS, CLOCK, DESK, ledShade, MONITOR, PAPER, RACK, RACKS, rackLeds, scatterPapers, TRAY, trayHangers, UNITS, WHITEBOARD,
} from "./furnish";

const noRay = () => {};
const col = (h: string) => new Color(h);
const mul = (a: Matrix4, b: Matrix4) => a.clone().multiply(b);

// ---- the merged props: racks' bodies, trays, desk, monitor body, cabinet, whiteboard frame, binders

function buildProps(): BufferGeometry {
  const p = new Parts();
  const body = col("#15171a"), cap = col("#1e2125"), plinth = col("#0c0d0f"), handle = col("#3b4048");
  const rail = col("#3a3f46"), cableA = col("#22262c"), cableB = col("#1d3a5c"), cableC = col("#30353c");
  for (const r of RACKS) {
    p.box(RACK.w, RACK.h, RACK.d, body, at([r.x, RACK.h / 2, r.z]));
    p.box(RACK.w + 0.012, 0.03, RACK.d + 0.012, cap, at([r.x, RACK.h + 0.015, r.z]));
    p.box(RACK.w, 0.07, RACK.d - 0.04, plinth, at([r.x, 0.035, r.z + 0.03]));
    p.box(0.014, 0.2, 0.02, handle, at([r.x - RACK.w / 2 + 0.03, 1.05, r.z + RACK.d / 2 + 0.012]));
    // Cables dropping from the tray into the rack top.
    p.rod([r.x - 0.12, RACK.h + 0.02, r.z - 0.1], [r.x - 0.12, 2.1, r.z - 0.1], 0.022, cableA, 8);
    p.rod([r.x + 0.1, RACK.h + 0.02, r.z - 0.1], [r.x + 0.1, 2.1, r.z - 0.1], 0.016, cableB, 8);
  }
  // A ladder tray above the row, hung from the ceiling, carrying cable bundles.
  const tz = RACKS[0].z - 0.1, { x0, x1 } = TRAY;
  for (const dz of [-0.16, 0.16]) p.bar([x0, 2.1, tz + dz], [x1, 2.1, tz + dz], 0.012, 0.05, rail);
  for (let x = x0 + 0.1; x < x1; x += 0.3) p.box(0.02, 0.008, 0.32, rail, at([x, 2.085, tz]));
  // Hangers stay clear of the wall sign (no line through the lettering).
  for (const x of trayHangers()) p.rod([x, 2.1, tz], [x, 3, tz], 0.006, rail, 6);
  p.rod([x0, 2.115, tz - 0.07], [x1, 2.115, tz - 0.07], 0.03, cableA, 8);
  p.rod([x0, 2.112, tz + 0.03], [x1, 2.112, tz + 0.03], 0.024, cableB, 8);
  p.rod([x0, 2.11, tz + 0.1], [x1, 2.11, tz + 0.1], 0.02, cableC, 8);

  // The desk: top, two side panels and a modesty panel.
  const dw = DESK.x1 - DESK.x0, dd = DESK.z1 - DESK.z0, dz = (DESK.z0 + DESK.z1) / 2;
  p.box(dw, 0.05, dd, col("#24272c"), at([(DESK.x0 + DESK.x1) / 2, DESK.top - 0.025, dz]));
  for (const sx of [-1, 1]) p.box(0.04, DESK.top - 0.05, dd - 0.04, col("#1a1c20"), at([sx * (dw / 2 - 0.03), (DESK.top - 0.05) / 2, dz]));
  p.box(dw - 0.1, 0.42, 0.025, col("#131518"), at([0, 0.47, DESK.z0 + 0.06]));
  // A mug.
  p.rod([1.05, DESK.top, -1.12], [1.05, DESK.top + 0.095, -1.12], 0.04, col("#c9ced6"), 12);

  // The second monitor's foot, neck and bezel (the screen is its own textured plane).
  const mon = at([MONITOR.x, DESK.top, MONITOR.z], [0, MONITOR.yaw, 0]);
  p.box(0.22, 0.012, 0.16, col("#1d2024"), mul(mon, at([0, 0.006, 0.01])));
  p.box(0.04, 0.2, 0.025, col("#1d2024"), mul(mon, at([0, 0.11, -0.03])));
  p.box(MONITOR.w + 0.02, MONITOR.h + 0.02, 0.025, col("#111214"), mul(mon, at([0, 0.2 + MONITOR.h / 2, 0])));

  // The filing cabinet, drawers facing the room (-x).
  const cab = at([CABINET.x, 0, CABINET.z], [0, -Math.PI / 2, 0]);
  p.box(CABINET.w, CABINET.h, CABINET.d, col("#2b2f35"), mul(cab, at([0, CABINET.h / 2, 0])));
  for (let i = 0; i < 4; i++) {
    const y = 0.17 + i * 0.32;
    p.box(CABINET.w - 0.04, 0.29, 0.016, col("#33373e"), mul(cab, at([0, y, CABINET.d / 2 + 0.008])));
    p.box(0.13, 0.018, 0.022, col("#7b828d"), mul(cab, at([0, y + 0.08, CABINET.d / 2 + 0.02])));
    p.box(0.07, 0.03, 0.006, col("#c9ced6"), mul(cab, at([0, y + 0.11, CABINET.d / 2 + 0.018])));
  }
  // Binders standing on the cabinet.
  const binders = ["#1f4f86", "#2e3238", "#3c4250", "#1f4f86"];
  binders.forEach((c, i) => p.box(0.055, 0.3, 0.27, col(c), mul(cab, at([-0.16 + i * 0.065, CABINET.h + 0.15, -0.05], [0, 0, i === 3 ? 0.18 : 0]))));

  // The whiteboard frame and marker tray on the back wall.
  const wb = WHITEBOARD;
  p.box(wb.w + 0.04, wb.h + 0.04, 0.025, col("#b8bec7"), at([wb.x, wb.y, -4 + 0.0125]));
  p.box(wb.w * 0.7, 0.025, 0.07, col("#b8bec7"), at([wb.x, wb.y - wb.h / 2 - 0.03, -4 + 0.04]));
  p.rod([wb.x - 0.3, wb.y - wb.h / 2 - 0.007, -3.95], [wb.x - 0.17, wb.y - wb.h / 2 - 0.007, -3.95], 0.009, col("#1f4f86"), 6);
  p.rod([wb.x - 0.1, wb.y - wb.h / 2 - 0.007, -3.95], [wb.x + 0.03, wb.y - wb.h / 2 - 0.007, -3.95], 0.009, col("#2e3238"), 6);
  // The clock's rim.
  p.add(new CylinderGeometry(CLOCK.r + 0.015, CLOCK.r + 0.015, 0.04, 24), col("#2b2f35"), at([CLOCK.x, CLOCK.y, -4 + 0.02], [Math.PI / 2, 0, 0]));

  // A binder lying on the desk, and an open folder and a closed one on the floor.
  p.box(0.27, 0.045, 0.31, col("#1f4f86"), at([1.0, DESK.top + 0.0225, -1.44], [0, 0.12, 0]));
  p.box(0.24, 0.004, 0.31, col("#a8946a"), at([-1.32, 0.003, -2.72], [0, 0.5, 0]));
  p.box(0.24, 0.004, 0.31, col("#9c8a62"), at([-1.11, 0.003, -2.6], [0, 0.62, 0.03]));
  p.box(0.24, 0.012, 0.31, col("#3c4250"), at([1.75, 0.006, -0.95], [0, -0.4, 0]));
  return p.merge();
}

// ---- the rack fronts: one texture, one plane per rack, merged

const FW = RACK.w - 0.06, FH = RACK.h - 0.1, FY0 = 0.07;   // front panel size and bottom height
function paintRackFront(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = "#0e0f11";
  ctx.fillRect(0, 0, W, H);
  // Perforated blanking between units.
  ctx.fillStyle = "#17191c";
  for (let y = 4; y < H; y += 7) for (let x = 4 + ((y / 7) % 2) * 3; x < W; x += 7) ctx.fillRect(x, y, 2, 2);
  const py = (y: number) => H - ((y - FY0) / FH) * H;
  for (const [y0, h] of UNITS) {
    const top = py(y0 + h), bot = py(y0), uh = bot - top;
    ctx.fillStyle = "#1c1f23";
    ctx.fillRect(6, top + 1, W - 12, uh - 2);
    ctx.strokeStyle = "#2a2e34";
    ctx.lineWidth = 2;
    ctx.strokeRect(7, top + 2, W - 14, uh - 4);
    // Drive bays across the left three quarters, one or two rows.
    const rows = h > 0.1 ? 2 : 1, cols = h > 0.05 ? 8 : 4;
    const bw = (W * 0.7) / cols, bh = (uh - 10) / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = 14 + c * bw, y = top + 5 + r * bh;
      ctx.fillStyle = "#121417";
      ctx.fillRect(x, y, bw - 4, bh - 3);
      ctx.fillStyle = "#2c3036";
      ctx.fillRect(x + 3, y + bh / 2 - 2, bw - 10, 2);
    }
    // A vent slot block before the LEDs.
    ctx.fillStyle = "#0f1012";
    for (let y = top + 6; y < bot - 6; y += 5) ctx.fillRect(W * 0.74, y, W * 0.07, 2);
  }
}

function buildFronts(): BufferGeometry {
  const parts = RACKS.map((r) => {
    const g = new PlaneGeometry(FW, FH);
    g.translate(r.x, FY0 + FH / 2, r.z + RACK.d / 2 + 0.004);
    return g;
  });
  const out = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return out;
}

// ---- LEDs: one instanced mesh, colours stepped a few times a second

const LED_COL = [col("#2f7fd8"), col("#2fa866"), col("#e09a22"), col("#15171a")];
function Leds() {
  const leds = useMemo(() => rackLeds(), []);
  const ref = useRef<InstancedMesh>(null);
  const shown = useRef<number[]>([]);
  const last = useRef(-1);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const mat = new Matrix4();
    leds.forEach((l, i) => { m.setMatrixAt(i, mat.makeTranslation(l.x, l.y, l.z)); m.setColorAt(i, LED_COL[ledShade(l, 0)]); });
    shown.current = leds.map((l) => ledShade(l, 0));
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [leds]);
  useFrame(({ clock }) => {
    const m = ref.current;
    const t = clock.elapsedTime;
    if (!m || t - last.current < 0.1) return;
    last.current = t;
    let dirty = false;
    leds.forEach((l, i) => {
      const s = ledShade(l, t);
      if (s !== shown.current[i]) { shown.current[i] = s; m.setColorAt(i, LED_COL[s]); dirty = true; }
    });
    if (dirty && m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, leds.length]} raycast={noRay} frustumCulled={false}>
      <boxGeometry args={[0.009, 0.006, 0.004]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

// ---- chairs: one merged chair (vertex colours), instanced three times

function buildChair(): BufferGeometry {
  const p = new Parts();
  const frame = col("#202327"), wheel = col("#0f1012"), post = col("#8c939d"), fabric = col("#3b414b");
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + 0.3;
    const ex = Math.sin(a) * 0.3, ez = Math.cos(a) * 0.3;
    p.bar([0, 0.075, 0], [ex, 0.055, ez], 0.04, 0.03, frame);
    p.box(0.045, 0.045, 0.045, wheel, at([ex, 0.025, ez]));
  }
  p.rod([0, 0.06, 0], [0, 0.12, 0], 0.045, frame, 12);
  p.rod([0, 0.12, 0], [0, 0.42, 0], 0.024, post, 12);
  p.box(0.3, 0.03, 0.3, frame, at([0, 0.43, 0]));
  p.box(0.5, 0.075, 0.48, fabric, at([0, 0.475, 0]));
  // The back sits behind the person (+z), leaning back a little, on a curved support.
  p.bar([0, 0.45, 0.2], [0, 0.62, 0.28], 0.06, 0.025, frame);
  // A curved back: a centre panel and two wings turned in, on a darker shell.
  const back = at([0, 0.88, 0.3], [-0.14, 0, 0]);
  p.box(0.3, 0.52, 0.05, fabric, back);
  for (const sx of [-1, 1]) p.box(0.1, 0.5, 0.05, fabric, mul(back, at([sx * 0.19, 0, -0.025], [0, -sx * 0.4, 0])));
  p.box(0.34, 0.44, 0.02, frame, mul(back, at([0, -0.01, 0.035])));
  for (const sx of [-1, 1]) {
    p.bar([sx * 0.25, 0.47, 0.02], [sx * 0.25, 0.66, 0.04], 0.03, 0.03, frame);
    p.box(0.06, 0.025, 0.26, frame, at([sx * 0.25, 0.67, 0.02]));
  }
  return p.merge();
}

function Chairs() {
  const geo = useMemo(buildChair, []);
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    CHAIRS.forEach((c, i) => m.setMatrixAt(i, at([c.x, 0, c.z], [0, c.yaw, 0])));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, []);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, CHAIRS.length]} raycast={noRay} frustumCulled={false}>
      <meshStandardMaterial vertexColors roughness={0.85} metalness={0.1} />
    </instancedMesh>
  );
}

// ---- papers: one instanced sheet with a printed-page texture

function paintPaper(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.fillStyle = "#e2e5e9";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#4a515c";
  ctx.fillRect(12, 12, 46, 7);
  ctx.fillStyle = "#9aa1ab";
  ctx.fillRect(W - 40, 12, 28, 5);
  let y = 32;
  const lens = [0.92, 0.85, 0.9, 0.6, 0, 0.88, 0.93, 0.8, 0.9, 0.45, 0, 0.9, 0.86, 0.91, 0.7];
  for (const l of lens) {
    if (l) { ctx.fillStyle = "#a9afb8"; ctx.fillRect(12, y, (W - 24) * l, 3); }
    y += 8;
  }
  // A small table.
  ctx.strokeStyle = "#b7bcc4";
  ctx.lineWidth = 1;
  for (let r = 0; r < 5; r++) ctx.strokeRect(12, y + r * 7, W - 24, 7);
  ctx.fillStyle = "#6f8fb8";
  ctx.fillRect(14, y + 2, 20, 3);
}

const PAPER_TINT = [col("#e9ebee"), col("#dfe2e6"), col("#d3d7dc"), col("#d9e0ea")];
function Papers() {
  const sheets = useMemo(() => scatterPapers(), []);
  const tex = useMemo(() => canvasTexture(128, 182, (ctx) => paintPaper(ctx, 128, 182)), []);
  const geo = useMemo(() => new PlaneGeometry(PAPER.w, PAPER.d).rotateX(-Math.PI / 2), []);
  const ref = useRef<InstancedMesh>(null);
  useEffect(() => () => { tex.dispose(); geo.dispose(); }, [tex, geo]);
  useEffect(() => {
    const m = ref.current;
    if (!m) return;
    const mat = new Matrix4(), q = new Quaternion(), e = new Euler(), v = new Vector3(), one = new Vector3(1, 1, 1);
    sheets.forEach((s, i) => {
      q.setFromEuler(e.set(s.tiltX, s.yaw, s.tiltZ, "YXZ"));
      m.setMatrixAt(i, mat.compose(v.set(s.x, s.y, s.z), q, one));
      m.setColorAt(i, PAPER_TINT[Math.floor(s.tint * PAPER_TINT.length)]);
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [sheets]);
  return (
    <instancedMesh ref={ref} args={[geo, undefined, sheets.length]} raycast={noRay} frustumCulled={false}>
      <meshStandardMaterial map={tex} roughness={0.92} metalness={0} side={DoubleSide} />
    </instancedMesh>
  );
}

// ---- textured planes: monitor screen, whiteboard, clock face

function paintMonitor(ctx: CanvasRenderingContext2D, W: number, H: number, fonts: boolean) {
  ctx.fillStyle = SUI.panel;
  ctx.fillRect(0, 0, W, H);
  if (fonts) {
    write(ctx, "ISOLATED NETWORK · HOSTS", 28, 34, { size: 18, weight: 500, color: SUI.grey2, mono: true, spacing: 2 });
    write(ctx, "4 / 4 online", W - 170, 34, { size: 20, weight: 600, color: SUI.blue });
  }
  ctx.fillStyle = SUI.raised;
  ctx.fillRect(28, 56, W - 56, 2);
  // A quiet traffic chart: a grey baseline grid and one blue series.
  const cx = 28, cy = 76, cw = W - 56, ch = 130;
  ctx.strokeStyle = "#1f2226";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(cx, cy + (i * ch) / 4); ctx.lineTo(cx + cw, cy + (i * ch) / 4); ctx.stroke(); }
  ctx.strokeStyle = SUI.blue;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const x = cx + (i / 40) * cw, y = cy + ch * (0.55 - 0.25 * Math.sin(i * 0.45) * Math.cos(i * 0.13) - (i % 7 === 0 ? 0.12 : 0));
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.stroke();
  const rows = [["rack-01", "ok"], ["rack-02", "ok"], ["rack-03", "drive 7 check"], ["rack-04", "ok"]];
  rows.forEach(([n, s], i) => {
    // Rows sit below the chart (ends at y 206) and the last one ends well above the 320 px edge.
    const y = 224 + i * 24;
    ctx.fillStyle = s === "ok" ? SUI.blue : SUI.amber;
    ctx.fillRect(30, y - 4, 8, 8);
    if (fonts) {
      write(ctx, n, 50, y, { size: 18, weight: 500, color: SUI.grey3, mono: true });
      write(ctx, s, 200, y, { size: 18, weight: 500, color: s === "ok" ? SUI.grey2 : SUI.amber, mono: true });
    }
  });
}

function paintWhiteboard(ctx: CanvasRenderingContext2D, W: number, H: number, fonts: boolean) {
  ctx.fillStyle = "#e4e7eb";
  ctx.fillRect(0, 0, W, H);
  // Faint marker: a small network sketch and a few lines of notes, half wiped.
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(31,79,134,0.55)";
  ctx.lineWidth = 4;
  const box = (x: number, y: number, w: number, h: number) => { ctx.strokeRect(x, y, w, h); };
  box(70, 90, 170, 90); box(380, 90, 170, 90); box(225, 260, 170, 90);
  ctx.beginPath(); ctx.moveTo(240, 135); ctx.lineTo(380, 135); ctx.moveTo(155, 180); ctx.lineTo(260, 260); ctx.moveTo(465, 180); ctx.lineTo(360, 260); ctx.stroke();
  ctx.strokeStyle = "rgba(200,60,60,0.45)";
  ctx.beginPath(); ctx.moveTo(290, 115); ctx.lineTo(330, 155); ctx.moveTo(330, 115); ctx.lineTo(290, 155); ctx.stroke();
  if (fonts) {
    write(ctx, "FIELD", 105, 135, { size: 30, weight: 600, color: "rgba(31,79,134,0.6)" });
    write(ctx, "OFFICE", 405, 135, { size: 30, weight: 600, color: "rgba(31,79,134,0.6)" });
    write(ctx, "DARKROOM", 238, 305, { size: 30, weight: 600, color: "rgba(31,79,134,0.6)" });
  }
  ctx.strokeStyle = "rgba(60,66,80,0.4)";
  ctx.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const y = 110 + i * 46, x = 650;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 1; k <= 12; k++) ctx.lineTo(x + k * (20 + (i % 3) * 3), y + Math.sin(k * 1.7 + i) * 4);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(200,205,212,0.5)";
  ctx.fillRect(60, 420, 500, 70);
}

function paintClock(ctx: CanvasRenderingContext2D, S: number) {
  const c = S / 2;
  ctx.clearRect(0, 0, S, S);
  ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.fillStyle = "#e6e9ed"; ctx.fill();
  ctx.fillStyle = "#2b2f35";
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2, big = i % 5 === 0;
    ctx.save(); ctx.translate(c, c); ctx.rotate(a);
    ctx.fillRect(-(big ? 3 : 1), -c + 10, big ? 6 : 2, big ? 18 : 8);
    ctx.restore();
  }
  const now = new Date();
  const hand = (a: number, len: number, w: number, color: string) => {
    ctx.save(); ctx.translate(c, c); ctx.rotate(a); ctx.fillStyle = color; ctx.fillRect(-w / 2, -len, w, len + 10); ctx.restore();
  };
  hand(((now.getHours() % 12) + now.getMinutes() / 60) / 12 * Math.PI * 2, c * 0.5, 8, "#1c1f23");
  hand((now.getMinutes() / 60) * Math.PI * 2, c * 0.75, 5, "#1c1f23");
  ctx.beginPath(); ctx.arc(c, c, 6, 0, Math.PI * 2); ctx.fillStyle = SUI.blue; ctx.fill();
}

function Flats() {
  const fonts = useFonts();
  const monTex = useMemo(() => canvasTexture(512, 320, (ctx) => paintMonitor(ctx, 512, 320, fonts)), [fonts]);
  const wbTex = useMemo(() => canvasTexture(1024, 696, (ctx) => paintWhiteboard(ctx, 1024, 696, fonts)), [fonts]);
  const clockTex = useMemo(() => canvasTexture(256, 256, (ctx) => paintClock(ctx, 256)), []);
  useEffect(() => () => { monTex.dispose(); wbTex.dispose(); clockTex.dispose(); }, [monTex, wbTex, clockTex]);
  return (
    <>
      <group position={[MONITOR.x, DESK.top, MONITOR.z]} rotation-y={MONITOR.yaw}>
        <mesh position={[0, 0.2 + MONITOR.h / 2, 0.0135]} raycast={noRay}>
          <planeGeometry args={[MONITOR.w, MONITOR.h]} />
          <meshBasicMaterial map={monTex} toneMapped={false} />
        </mesh>
      </group>
      <mesh position={[WHITEBOARD.x, WHITEBOARD.y, -4 + 0.027]} raycast={noRay}>
        <planeGeometry args={[WHITEBOARD.w, WHITEBOARD.h]} />
        <meshStandardMaterial map={wbTex} roughness={0.35} metalness={0} />
      </mesh>
      <mesh position={[CLOCK.x, CLOCK.y, -4 + 0.042]} raycast={noRay}>
        <circleGeometry args={[CLOCK.r, 32]} />
        <meshStandardMaterial map={clockTex} roughness={0.5} />
      </mesh>
    </>
  );
}

// ---- ceiling light panels (one merged mesh)

const PANELS: readonly [number, number, number, number][] = [[0, -1.2, 1.4, 0.5], [-1.7, -2.7, 1.2, 0.45], [1.9, -1.9, 1.2, 0.45], [0, 0.9, 1.2, 0.45]];
function buildPanels(): BufferGeometry {
  const parts = PANELS.map(([x, z, w, d]) => new PlaneGeometry(w, d).rotateX(Math.PI / 2).translate(x, 2.99, z));
  const out = mergeGeometries(parts, false)!;
  for (const g of parts) g.dispose();
  return out;
}

export function Furniture() {
  const props = useMemo(buildProps, []);
  const fronts = useMemo(buildFronts, []);
  const panels = useMemo(buildPanels, []);
  const frontTex = useMemo(() => canvasTexture(256, 900, (ctx) => paintRackFront(ctx, 256, 900)), []);
  useEffect(() => () => { props.dispose(); fronts.dispose(); panels.dispose(); frontTex.dispose(); }, [props, fronts, panels, frontTex]);
  return (
    <group name="twin-darkroom-furniture">
      <mesh geometry={props} raycast={noRay}>
        <meshStandardMaterial vertexColors roughness={0.75} metalness={0.15} />
      </mesh>
      <mesh geometry={fronts} raycast={noRay}>
        <meshStandardMaterial map={frontTex} roughness={0.6} metalness={0.25} />
      </mesh>
      <mesh geometry={panels} raycast={noRay}>
        <meshBasicMaterial color="#cfd5dd" toneMapped={false} />
      </mesh>
      <Leds />
      <Chairs />
      <Papers />
      <Flats />
    </group>
  );
}
