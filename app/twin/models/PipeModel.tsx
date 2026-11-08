"use client";
// Pipes along polylines, with rounded bends: TubeGeometry whose uv.x is meters along the pipe, so
// the dashes keep their size on any length. Flowing: holo light dashes move along the pipe in the
// order of its points. Not flowing: they stand still and dim. Failed: the dashes stop and the
// whole pipe pulses alert. One draw call per PipeModel; PipeBundle merges many paths into one.
import { useEffect, useMemo } from "react";
import { CurvePath, LineCurve3, QuadraticBezierCurve3, TubeGeometry, Vector3, type BufferGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { pipeMaterial, type PipeMode } from "./shaders";
import { useModelClock } from "./common";

export type P3 = [number, number, number];

export interface PipeStyle {
  flowing: boolean;
  failed?: boolean;
  radius?: number;        // meters (default 0.15, a 12" line is about 0.16)
  dashSpacing?: number;   // meters between dashes (default 2.4)
  speed?: number;         // meters per second (default 1.6)
}

// A polyline with each corner rounded by a short bend.
export function pipeCurve(points: P3[], bend = 0.5): CurvePath<Vector3> {
  const v = points.map((p) => new Vector3(...p));
  const path = new CurvePath<Vector3>();
  if (v.length < 2) return path;
  let from = v[0].clone();
  for (let i = 1; i < v.length - 1; i++) {
    const inDir = v[i].clone().sub(v[i - 1]), outDir = v[i + 1].clone().sub(v[i]);
    const b = Math.min(bend, inDir.length() * 0.45, outDir.length() * 0.45);
    const a = v[i].clone().addScaledVector(inDir.normalize(), -b), c = v[i].clone().addScaledVector(outDir.normalize(), b);
    if (from.distanceTo(a) > 1e-4) path.add(new LineCurve3(from, a));
    path.add(new QuadraticBezierCurve3(a, v[i].clone(), c));
    from = c;
  }
  path.add(new LineCurve3(from, v[v.length - 1].clone()));
  return path;
}

export function pipeGeometry(paths: P3[][], radius = 0.15): BufferGeometry | null {
  const parts: BufferGeometry[] = [];
  for (const pts of paths) {
    if (pts.length < 2) continue;
    const curve = pipeCurve(pts);
    const len = curve.getLength();
    if (len < 1e-3) continue;
    const g = new TubeGeometry(curve, Math.min(600, Math.max(8, Math.ceil(len / 0.3))), radius, 8, false);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len);
    parts.push(g);
  }
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  const out = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return out;
}

const modeOf = (s: PipeStyle): PipeMode => (s.failed ? "failed" : s.flowing ? "flowing" : "idle");

// Many pipes in one draw call, all in one state.
export function PipeBundle({ paths, ...style }: { paths: P3[][] } & PipeStyle) {
  const key = JSON.stringify(paths);
  const geo = useMemo(() => pipeGeometry(paths, style.radius), [key, style.radius]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geo?.dispose(), [geo]);
  useModelClock();
  if (!geo) return null;
  return <mesh geometry={geo} material={pipeMaterial(modeOf(style), style.dashSpacing, style.speed)} />;
}

export function PipeModel({ points, ...style }: { points: P3[] } & PipeStyle) {
  const paths = useMemo(() => [points], [points]);
  return <PipeBundle paths={paths} {...style} />;
}
