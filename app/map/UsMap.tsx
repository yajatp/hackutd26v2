"use client";
// The zoomable map: state outlines (public/geo, drawn once), EOG's basins as soft shapes, and one
// HTML marker per site over the SVG so tags and focus rings stay sharp at any zoom. Zoom and pan
// are hand-written (zoom.ts): wheel or pinch about the pointer, drag to pan, double-click to zoom
// in, buttons and keys; every zoom eases over about 300 ms unless the person prefers reduced motion.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { SiteSummary } from "@/lib/fleet";
import { DEFAULT_SITE_KEY } from "@/lib/sites";
import {
  BASINS, LABEL_SIDE, basinLabelWidth, dotRect, inside, labelRank, labelRect, labelWidth, overlaps, placeLabels,
  tagsOf, toneOf, type LabelBox, type Rect, type Tag,
} from "./model";
import { ellipsePath, H, pathOf, project, W, type Geometry } from "./projection";
import {
  EASE_MS, SITE_K, US, clampView, easeInOut, focusOn, onScreen, panBy, toFrame, tween, wheelFactor, zoomAt,
  type Box, type View,
} from "./zoom";
import s from "./map.module.css";

interface Outline { id: string; name: string; d: string }

const easeOut = (t: number) => 1 - (1 - t) ** 3;
const PANEL_PX = 400;                         // the side panel's width on a wide screen (map.module.css)
const WIDE = 900;                             // at and above this the panel is beside, below it a bottom sheet

function useReducedMotion(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setR(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return r;
}

export function UsMap({ sites, selected, onSelect }: {
  sites: SiteSummary[];
  selected: string | null;
  onSelect(key: string | null): void;
}) {
  const stage = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>({ width: W, height: H });
  const [view, setView] = useState<View>(US);
  const [outlines, setOutlines] = useState<Outline[] | null>(null);
  const [geoError, setGeoError] = useState(false);
  const reduced = useReducedMotion();
  const now = useRef<View>(US);                 // what is on screen
  const target = useRef<View>(US);              // where the current ease ends
  const anim = useRef<{ from: View; to: View; t0: number; dur: number; ease: (t: number) => number } | null>(null);
  const raf = useRef(0);
  const boxRef = useRef(box);
  boxRef.current = box;

  // The outlines: a local file, so the map draws with no internet.
  useEffect(() => {
    let live = true;
    fetch("/geo/us-states.json")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((geo: { features: { id: string; properties: { name: string }; geometry: Geometry }[] }) => {
        if (live) setOutlines(geo.features.map((f) => ({ id: f.id, name: f.properties.name, d: pathOf(f.geometry) })));
      })
      .catch(() => { if (live) setGeoError(true); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const wide = box.width >= WIDE;
  const panelOpen = selected !== null;
  // Room for an edge site to come out from under the panel, in frame units.
  const slack = useCallback(() => {
    const b = boxRef.current;
    const scale = Math.min(b.width / W, b.height / H) || 1;
    return panelOpen ? (b.width >= WIDE ? PANEL_PX : b.height * 0.3) / scale : 40 / scale;
  }, [panelOpen]);

  // What a label must not sit under, in stage px: the zoom buttons, the hint, the legend and, on a
  // wide screen, the open panel. Measured after each layout and again when their slide ends.
  const [chrome, setChrome] = useState<Rect[]>([]);
  useLayoutEffect(() => {
    const el = stage.current;
    const wrap = el?.parentElement;
    if (!el || !wrap) return;
    const measure = () => {
      const o = el.getBoundingClientRect();
      const rects: Rect[] = [];
      for (const cls of [s.controls, s.hint, s.legend, s.panel]) {
        const n = wrap.querySelector<HTMLElement>(`.${cls}`);
        const r = n?.getBoundingClientRect();
        if (!n || !r || !r.width) continue;
        const cs = getComputedStyle(n);
        // A hidden panel, or the phone's bottom sheet (fixed; the page scrolls the map clear of it).
        if (cs.visibility === "hidden" || cs.position === "fixed") continue;
        const at: Rect = [r.left - o.left, r.top - o.top, r.right - o.left, r.bottom - o.top];
        if (overlaps(at, [0, 0, o.width, o.height])) rects.push(at.map((v) => Math.round(v)) as Rect);
      }
      setChrome((prev) => (JSON.stringify(prev) === JSON.stringify(rects) ? prev : rects));
    };
    measure();
    let live = true;
    document.fonts?.ready.then(() => { if (live) measure(); });
    wrap.addEventListener("transitionend", measure);
    return () => {
      live = false;
      wrap.removeEventListener("transitionend", measure);
    };
  }, [box.width, box.height, panelOpen]);

  const show = useCallback((v: View) => {
    now.current = v;
    setView(v);
  }, []);

  const stop = useCallback(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = 0;
    anim.current = null;
  }, []);

  const go = useCallback((to: View, dur = EASE_MS, ease = easeInOut) => {
    target.current = to;
    if (reduced || dur <= 0) {
      stop();
      show(to);
      return;
    }
    anim.current = { from: now.current, to, t0: performance.now(), dur, ease };
    const step = (t: number) => {
      const a = anim.current;
      if (!a) return;
      const p = Math.min(1, (t - a.t0) / a.dur);
      show(tween(a.from, a.to, a.ease(p)));
      raf.current = p < 1 ? requestAnimationFrame(step) : 0;
      if (p >= 1) anim.current = null;
    };
    if (!raf.current) raf.current = requestAnimationFrame(step);
  }, [reduced, show, stop]);

  useEffect(() => () => stop(), [stop]);

  const positions = useMemo(() => new Map(sites.map((x) => [x.key, project(x.lon, x.lat)])), [sites]);

  // A selection flies there: the site lands in the middle of the map left of the panel (wide), or
  // a little below the middle on a phone, clear of the zoom buttons (the page has scrolled the map
  // above the bottom sheet).
  const flyTo = useCallback((key: string) => {
    const p = positions.get(key);
    if (!p) return;
    const b = boxRef.current;
    const [cx, cy] = toFrame(b, b.width >= WIDE ? (b.width - PANEL_PX) / 2 : b.width / 2, b.width >= WIDE ? b.height / 2 : b.height * 0.56);
    const k = Math.max(SITE_K, Math.min(target.current.k, 8));
    go(focusOn(p[0], p[1], k, cx, cy, slack()), 420);
  }, [positions, go, slack]);

  const sizeKnown = box.width !== W || box.height !== H;
  useEffect(() => {
    if (selected && sizeKnown) flyTo(selected);
    // Only a new selection (or the first measured size) moves the map; data updates do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, sizeKnown]);

  const zoomOut = () => go(US, 420);
  const zoomBy = (f: number) => {
    const b = boxRef.current;
    const [cx, cy] = toFrame(b, b.width / 2, b.height / 2);
    go(zoomAt(target.current, cx, cy, f, slack()));
  };

  // Wheel: zoom about the cursor. At the US view a scroll down passes through to the page.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (target.current.k <= 1.0001 && e.deltaY > 0 && !e.ctrlKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const [fx, fy] = toFrame(boxRef.current, e.clientX - r.left, e.clientY - r.top);
      go(zoomAt(target.current, fx, fy, wheelFactor(e.deltaY, e.deltaMode), slack()), 220, easeOut);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [go, slack]);

  // Drag and pinch with pointer events; markers and buttons keep their own clicks.
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; mx: number; my: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button, a")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    stop();
    target.current = now.current;
    pinch.current = null;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pts.current.get(e.pointerId);
    if (!prev) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const scale = Math.min(box.width / W, box.height / H) || 1;
    const r = e.currentTarget.getBoundingClientRect();
    if (pts.current.size === 1) {
      const v = panBy(now.current, (e.clientX - prev.x) / scale, (e.clientY - prev.y) / scale, slack());
      target.current = v;
      show(v);
    } else if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      const last = pinch.current;
      pinch.current = { dist, mx, my };
      if (!last || last.dist < 1) return;
      const [fx, fy] = toFrame(box, mx, my);
      let v = zoomAt(now.current, fx, fy, dist / last.dist, slack());
      v = panBy(v, (mx - last.mx) / scale, (my - last.my) / scale, slack());
      target.current = v;
      show(v);
    }
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pts.current.delete(e.pointerId);
    if (pts.current.size < 2) pinch.current = null;
    if (pts.current.size === 0) setDragging(false);
  };
  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button, a")) return;
    const r = e.currentTarget.getBoundingClientRect();
    const [fx, fy] = toFrame(box, e.clientX - r.left, e.clientY - r.top);
    go(zoomAt(target.current, fx, fy, 2, slack()));
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as Element) !== e.currentTarget) return;
    const step = 60 / (Math.min(box.width / W, box.height / H) || 1);
    const moves: Record<string, () => void> = {
      "+": () => zoomBy(1.6), "=": () => zoomBy(1.6), "-": () => zoomBy(1 / 1.6), "0": zoomOut,
      ArrowLeft: () => go(panBy(target.current, step, 0, slack()), 200, easeOut),
      ArrowRight: () => go(panBy(target.current, -step, 0, slack()), 200, easeOut),
      ArrowUp: () => go(panBy(target.current, 0, step, slack()), 200, easeOut),
      ArrowDown: () => go(panBy(target.current, 0, -step, slack()), 200, easeOut),
    };
    const m = moves[e.key];
    if (m) { e.preventDefault(); m(); }
  };

  // Re-clamp when the panel opens or closes (the allowed slack changes).
  useEffect(() => {
    const v = clampView(target.current, slack());
    if (v.x !== target.current.x || v.y !== target.current.y) go(v);
  }, [slack, go]);

  const siteStates = useMemo(() => new Set(sites.map((x) => x.state)), [sites]);
  const selectedState = sites.find((x) => x.key === selected)?.state ?? null;
  const basins = useMemo(() => BASINS.map((b) => ({ ...b, d: ellipsePath(b.lon, b.lat, b.a, b.b, b.rot), at: project(b.label[0], b.label[1]) })), []);
  // Which tags each marker shows (all of them when selected or zoomed in), and which labels fit.
  const shownTags = useMemo(() => new Map<string, Tag[]>(sites.map((x) => {
    const t = tagsOf(x);
    return [x.key, x.key === selected || view.k >= 3 ? t : t.slice(0, 1)];
  })), [sites, selected, view.k]);
  const items = useMemo(() => sites.map((x): LabelBox => {
    const p = positions.get(x.key)!;
    const [bx, by] = onScreen(box, view, p[0], p[1]);
    const tags = shownTags.get(x.key) ?? [];
    return {
      key: x.key, x: bx, y: by, side: LABEL_SIDE[x.key] ?? "right",
      w: labelWidth(x.name, tags.map((t) => t.text)), h: 22 + tags.length * 20,
      rank: labelRank(x.key, toneOf(x), selected, DEFAULT_SITE_KEY),
    };
  }), [sites, positions, box, view, selected, shownTags]);
  const placed = useMemo(() => placeLabels(items, { bounds: [0, 0, box.width, box.height], blocked: chrome }), [items, box, chrome]);
  // What a basin's name must keep off: the buttons, every marker and every shown label.
  const busy = useMemo(() => [
    ...chrome,
    ...items.map(dotRect),
    ...items.flatMap((m) => { const p = placed.get(m.key); return p ? [labelRect(m, p)] : []; }),
  ], [chrome, items, placed]);
  const transform = `translate(${view.x.toFixed(2)} ${view.y.toFixed(2)}) scale(${view.k.toFixed(4)})`;
  const zoomed = view.k > 1.02;

  return (
    <div
      ref={stage}
      className={s.stage}
      data-zoomed={zoomed || undefined}
      data-dragging={dragging || undefined}
      tabIndex={0}
      role="application"
      aria-label="Map of the contiguous United States with the oil sites. Drag to pan, scroll or pinch to zoom, plus and minus keys to zoom, arrow keys to pan."
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      style={{ "--px": `${(view.x * 0.08).toFixed(1)}px`, "--py": `${(view.y * 0.08).toFixed(1)}px` } as React.CSSProperties}
    >
      <div className={s.floor} aria-hidden="true" />
      <div className={s.crosses} aria-hidden="true" />
      <svg className={s.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <g transform={transform}>
          <g className={s.land}>
            {outlines?.map((o) => (
              <path key={o.id} d={o.d} data-site={siteStates.has(o.id) || undefined} data-on={o.id === selectedState || undefined}>
                <title>{o.name}</title>
              </path>
            ))}
          </g>
          <g className={s.basins}>
            {basins.map((b) => <path key={b.key} d={b.d} data-on={b.key === selected || undefined} />)}
          </g>
        </g>
      </svg>

      <div className={s.overlay}>
        {basins.map((b) => {
          const [x, y] = onScreen(box, view, b.at[0], b.at[1]);
          // Fade in by on-screen scale, so a phone's small US view keeps them hidden.
          const scale = view.k * Math.min(box.width / W, box.height / H);
          // Hidden while the word would cross the map's edge or sit under the buttons or panel.
          const w = basinLabelWidth(b.name);
          const r: Rect = [x - w / 2, y - 8, x + w / 2, y + 8];
          const fits = inside(r, [0, 0, box.width, box.height], 2) && !busy.some((c) => overlaps(r, c));
          const o = fits ? Math.max(0, Math.min(1, (scale - b.minK + 0.4) / 0.6)) : 0;
          return (
            <span key={b.key} className={s.basinLabel} style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`, opacity: o }} aria-hidden="true">
              {b.name}
            </span>
          );
        })}
        {sites.map((site, i) => {
          const p = positions.get(site.key)!;
          const [x, y] = onScreen(box, view, p[0], p[1]);
          const tone = toneOf(site);
          const tags = tagsOf(site);
          const on = site.key === selected;
          const shown = shownTags.get(site.key) ?? tags;
          const place = placed.get(site.key);
          // The selected marker above all, then the worst states, so a red dot is never under a calm ring.
          const z = on ? 4 : tone === "alert" ? 3 : tone === "warn" ? 2 : 1;
          return (
            <div key={site.key} className={s.pin} style={{ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, "--i": i, "--z": z } as React.CSSProperties}>
              <button
                type="button"
                className={s.marker}
                data-side={place?.side ?? LABEL_SIDE[site.key] ?? "right"}
                data-compact={!place || undefined}
                data-tone={tone}
                data-status={site.status}
                data-site={site.key}
                aria-pressed={on}
                aria-label={`${site.name}, ${site.basin}: ${tags.map((t) => t.text.toLowerCase()).join(", ")}`}
                onClick={() => onSelect(on ? null : site.key)}
              >
                <span className={s.dot} aria-hidden="true"><span className={s.ring} /><span className={s.ring2} /></span>
                <span className={s.label} aria-hidden="true" style={{ "--dy": `${place?.dy ?? 0}px` } as React.CSSProperties}>
                  <span className={s.name}>{site.name}</span>
                  {shown.map((t) => (
                    <span key={t.text} className={s.tag} data-tone={t.tone}><span className={s.tagIcon}>{t.icon}</span>{t.text}</span>
                  ))}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className={s.controls}>
        <button type="button" className={s.ctl} onClick={() => zoomBy(1.6)} aria-label="Zoom in">+</button>
        <button type="button" className={s.ctl} onClick={() => zoomBy(1 / 1.6)} aria-label="Zoom out">−</button>
        <button type="button" className={`${s.ctl} ${s.ctlWide}`} onClick={zoomOut} disabled={!zoomed}>Zoom out to the US</button>
      </div>
      <p className={s.hint} aria-hidden="true">
        {wide ? "Drag to pan, scroll to zoom, double-click to zoom in" : "Pinch to zoom, drag to pan"}
      </p>
      {geoError && <p className={s.geoError}>The state outlines did not load. The sites still work.</p>}
    </div>
  );
}
