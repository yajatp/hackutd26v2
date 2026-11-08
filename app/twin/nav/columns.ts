// The dashboard's four columns and its one detail pop-out, as plain data (no canvas, no three, so
// columns.test.ts runs it in Node). Each column is a calm summary with one button; the button pops
// that column's detail out of the dashboard's left edge (the Health charts open on the right). Only
// one detail is open at a time: another button replaces it, the same button closes it.
export type ColumnId = "pump" | "why" | "forecast" | "site";
export type DetailKind = ColumnId | "goto";

export const COLUMNS: readonly { id: ColumnId; label: string; button: string }[] = [
  { id: "pump", label: "PROBLEM", button: "Pump details" },
  { id: "why", label: "ACTION", button: "Why this plan" },
  { id: "forecast", label: "FORECAST", button: "Forecast and simulate" },
  { id: "site", label: "SITE", button: "Site insight" },
];

export const DETAIL_TITLE: Record<DetailKind, string> = {
  pump: "Pump details", why: "Why this plan", forecast: "Forecast and simulate", site: "Site insight", goto: "Go to a pad",
};

export interface Rect { x: number; y: number; w: number; h: number }

// `n` equal columns across [x0, x1] with `gap` px between, from y0 to y1.
export function columnRects(x0: number, x1: number, y0: number, y1: number, gap: number, n = 4): Rect[] {
  const w = (x1 - x0 - (n - 1) * gap) / n;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + i * (w + gap), y: y0, w, h: y1 - y0 }));
}

// One slot on the left: pressing the open detail closes it, any other replaces it.
export function toggleDetail(cur: DetailKind | null, next: DetailKind): DetailKind | null {
  return cur === next ? null : next;
}

// True when no two rects overlap (touching edges is fine).
export function disjoint(rs: readonly Rect[]): boolean {
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return false;
    }
  }
  return true;
}

// Every rect inside `outer`.
export function inside(rs: readonly Rect[], outer: Rect): boolean {
  return rs.every((r) => r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h);
}
