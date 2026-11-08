"use client";
// What only the headset shows, around the model and outside its turning group: the How to use
// card and a big Reset view button straight ahead, the info panel on the right, a legend on the
// left, and the thumbstick turning the model. Placement and rules live in stage.ts (unit-tested).
import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { useXR } from "@react-three/xr";
import { money } from "@/lib/eog/alerts";
import type { TankState } from "./model";
import { CanvasCard, type TextRow } from "./CanvasText";
import { facing, HOW_TO, LEGEND, LINE_HEX, PANEL, RESET, snapTurn, stickX } from "./stage";

const HOW_TO_TEXT = "Point at a tank and pull the trigger. Thumbstick turns the site.";
const PANEL_TILT = -0.25;               // the panel leans back a little toward the judge's eyes

// Each controller's thumbstick: one push, one 30 degree step of the model (snapTurn). Only the
// model turns: the judge never moves. Raw gamepad axes, so it works with any controller layout.
function SnapTurn({ onTurn }: { onTurn(dir: 1 | -1): void }) {
  const armed = useRef(new WeakMap<XRInputSource, boolean>());
  useFrame((state, _dt, frame?: XRFrame) => {
    const session = frame?.session ?? state.gl.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      if (!src.gamepad || src.hand) continue;
      const r = snapTurn(stickX(src.gamepad.axes), armed.current.get(src) ?? true);
      armed.current.set(src, r.armed);
      if (r.step !== 0) onTurn(r.step);
    }
  });
  return null;
}

function HowTo() {
  return (
    <group position={HOW_TO.at} rotation-y={facing(HOW_TO.at)}>
      <CanvasCard
        worldWidth={HOW_TO.widthM} pxPerM={HOW_TO.pxPerM} padM={0.02} border="#a1a1aa"
        rows={[
          { text: "How to use", color: "#a1a1aa", size: 40, bold: true },
          { text: HOW_TO_TEXT, color: "#ffffff", size: 50, bold: true },
          { text: "Reset view puts the site back.", color: "#d4d4d8", size: 42 },
        ]}
      />
    </group>
  );
}

// Big and in front, outside the turning group: puts the model back to north-up.
function ResetButton({ onReset }: { onReset(): void }) {
  const [hover, setHover] = useState(false);
  return (
    <group
      position={RESET.at} rotation-y={facing(RESET.at)}
      onClick={(e) => { e.stopPropagation(); onReset(); }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
      onPointerOut={() => setHover(false)}
    >
      <mesh position={[0, 0, -0.012]}>
        <boxGeometry args={[RESET.w + 0.01, RESET.h + 0.01, 0.02]} />
        <meshStandardMaterial color={hover ? "#52525b" : "#27272a"} />
      </mesh>
      <CanvasCard
        rows={[{ text: "Reset view", color: "#ffffff", size: 56, bold: true }]}
        worldWidth={RESET.w} worldHeight={RESET.h} pxPerM={1000} padM={0.01}
        bg={hover ? "#3f3f46" : "#27272a"} border={hover ? "#ffffff" : "#a1a1aa"}
      />
    </group>
  );
}

// The selected tank's story, beside the model: name, state, evidence, fix and what to bring.
function InfoPanel({ s }: { s: TankState | null }) {
  const head = (text: string): TextRow => ({ text, color: "#a1a1aa", size: PANEL.headPx, bold: true });
  const body = (text: string): TextRow => ({ text, color: "#e4e4e7", size: PANEL.bodyPx });
  const rows: TextRow[] = s
    ? [
      { text: s.name, color: "#ffffff", size: PANEL.titlePx, bold: true },
      ...s.lines.map((l) => ({ text: l.text, color: LINE_HEX[l.tone], size: PANEL.linePx, bold: true })),
      ...(s.evidence.length ? [head("EVIDENCE"), ...s.evidence.map(body)] : []),
      ...(s.fix ? [head("FIX"), { text: `${s.fix.headline} · ${money(s.fix.cost)}`, color: "#ffffff", size: PANEL.linePx, bold: true }] : []),
      head("WHAT TO BRING"),
      ...s.bring.map(body),
    ]
    : [body("Select a tank to see what is wrong, the fix and what to bring.")];
  return (
    <group position={PANEL.at} rotation-y={facing(PANEL.at)}>
      <group rotation-x={PANEL_TILT}>
        <CanvasCard
          rows={rows} worldWidth={PANEL.widthM} pxPerM={PANEL.pxPerM} padM={0.022} anchor="bottom" align="left"
          border={s ? (s.tone === "ok" ? "#71717a" : LINE_HEX[s.tone]) : "#52525b"}
        />
      </group>
    </group>
  );
}

function Legend() {
  const row = (text: string, color = "#e4e4e7"): TextRow => ({ text, color, size: 32 });
  return (
    <group position={LEGEND.at} rotation-y={facing(LEGEND.at)}>
      <group rotation-x={PANEL_TILT}>
        <CanvasCard
          worldWidth={LEGEND.widthM} pxPerM={LEGEND.pxPerM} padM={0.02} anchor="bottom" align="left"
          rows={[
            { text: "WHAT THE COLORS MEAN", color: "#a1a1aa", size: 28, bold: true },
            row("Red: pump failed", LINE_HEX.alert),
            row("Amber: check a sensor or inspect", LINE_HEX.warn),
            row("Gray: OK", LINE_HEX.ok),
            row("Pulsing: a sensor is dead, drifting or lying."),
            row("Fill: the tank level an alert reports. Gray half fill: not reported."),
            row("Expanding ring: the console's top problem."),
          ]}
        />
      </group>
    </group>
  );
}

export function VrStage({ s, onReset, onTurn }: { s: TankState | null; onReset(): void; onTurn(dir: 1 | -1): void }) {
  const inXR = useXR((x) => x.session != null);
  if (!inXR) return null;
  return (
    <>
      <HowTo />
      <ResetButton onReset={onReset} />
      <InfoPanel s={s} />
      <Legend />
      <SnapTurn onTurn={onTurn} />
    </>
  );
}
