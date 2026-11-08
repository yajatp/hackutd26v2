"use client";
// Motion for the moment of change, shared by /console and /attack. House rule (docs/DESIGN.md):
// motion only when the data changes or the person acts. So a thing that is already on screen when
// the page settles on its first data appears still; one that arrives later is news and may move.
// Every effect is presentation only: the words are in the DOM the moment the data is (the e2e
// latency watcher times that), and under prefers-reduced-motion nothing moves at all.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { bringIntoView, prefersReducedMotion, tween } from "./tween";

const Armed = createContext<RefObject<boolean>>({ current: false });

// Arms its subtree `after` ms once `ready` (the first data is on screen). Renders no element.
export function Arm({ ready = true, after = 700, children }: { ready?: boolean; after?: number; children: ReactNode }) {
  const armed = useRef(false);
  useEffect(() => {
    if (!ready || armed.current) return;
    const t = setTimeout(() => { armed.current = true; }, after);
    return () => clearTimeout(t);
  }, [ready, after]);
  return <Armed.Provider value={armed}>{children}</Armed.Provider>;
}

// True when the calling component mounted after its <Arm> armed: it is new data, or the result
// of a tap or click. Fixed for the component's life; give it a key to ask again on a change.
export function useBornLive(): boolean {
  const armed = useContext(Armed);
  const [born] = useState(() => armed.current);
  return born;
}

// The gate itself, for code that animates imperatively (app/attack/useListMotion.ts): true once armed.
export function useArmed(): RefObject<boolean> {
  return useContext(Armed);
}

// A number that ticks to its new value (about 400 ms) when it changes. The real, final value is
// the element's text from the first render; the ticking digits are drawn by CSS from data-tick
// over a transparent copy (.mo-ticking in console.module.css), so nothing reading the page ever
// sees an in-between number.
export function Tick({ value, format, align = "left", ms = 400 }: {
  value: number; format: (n: number) => string; align?: "left" | "right"; ms?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  useEffect(() => {
    const el = ref.current;
    const from = shown.current;
    shown.current = value;
    if (!el || from === value || prefersReducedMotion()) return;
    el.style.setProperty("--tick-ink", getComputedStyle(el).color);
    el.dataset.tick = format(from);
    el.classList.add("mo-ticking");
    const t0 = performance.now();
    let raf = requestAnimationFrame(function step(t) {
      const k = Math.min(1, (t - t0) / ms);
      el.dataset.tick = format(tween(from, value, k));
      if (k < 1) raf = requestAnimationFrame(step);
      else el.classList.remove("mo-ticking");
    });
    return () => {
      cancelAnimationFrame(raf);
      el.classList.remove("mo-ticking");
    };
  }, [value, format, ms]);
  return <span ref={ref} className="mo-tick" data-align={align}>{format(value)}</span>;
}

// Whether the person has scrolled this page by hand (wheel, touch, scroll keys) since it loaded.
// Listened for from the moment this module loads in the browser.
let scrolledByHand = false;
const SCROLL_KEYS = new Set(["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "]);
if (typeof window !== "undefined") {
  const mark = () => { scrolledByHand = true; };
  window.addEventListener("wheel", mark, { passive: true, once: true });
  window.addEventListener("touchmove", mark, { passive: true, once: true });
  window.addEventListener("keydown", (e) => { if (SCROLL_KEYS.has(e.key)) mark(); }, { passive: true });
}

// Once, `afterMs` after `on` turns true (when the block has opened): if the element ends below
// the fold and the person has not scrolled by hand, scroll just enough to show all of it.
export function useBringIntoView(ref: RefObject<HTMLElement | null>, on: boolean, afterMs: number) {
  useEffect(() => {
    if (!on) return;
    const reduced = prefersReducedMotion();
    const t = setTimeout(() => {
      const el = ref.current;
      if (!el || !bringIntoView(el.getBoundingClientRect().bottom, window.innerHeight, scrolledByHand)) return;
      el.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
    }, reduced ? 0 : afterMs);
    return () => clearTimeout(t);
  }, [ref, on, afterMs]);
}

// Holds a block that may go away. React drops the block at once (its words leave the DOM the
// moment the data does, as the e2e expects); what it leaves behind is only space: an empty,
// aria-hidden gap at the end of this wrapper that closes over 240 ms, so the page below closes up
// instead of jumping. With `band`, the gap wears the faint amber of the warning that left and
// fades as it closes. Nothing moves before the board has armed or under prefers-reduced-motion.
// `band` is read from the render before the one where the space shrank (what was there).
export function Collapse({ band = true, children }: { band?: boolean; children: ReactNode }) {
  const armed = useArmed();
  const wrap = useRef<HTMLDivElement>(null);
  const gap = useRef<HTMLDivElement>(null);
  // The content's height as last laid out (kept current by a ResizeObserver, so also while a
  // block opens), the top margin of its last block, and the band setting of that render.
  const seen = useRef({ h: 0, mt: 0, band });
  const run = useRef<Animation | null>(null);

  useEffect(() => {
    const w = wrap.current;
    const g = gap.current;
    if (!w || !g || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => { seen.current.h = w.offsetHeight - g.offsetHeight; });
    ro.observe(w);
    return () => ro.disconnect();
  }, []);

  // After every render: it must see each state to know when something left.
  useLayoutEffect(() => {
    const w = wrap.current;
    const g = gap.current;
    if (!w || !g) return;
    const before = seen.current;
    const h = w.offsetHeight - g.offsetHeight;
    const kid = g.previousElementSibling;
    seen.current = { h, mt: kid ? parseFloat(getComputedStyle(kid).marginTop) || 0 : before.mt, band };
    const lost = before.h - h;
    if (lost <= 1 || !armed.current || prefersReducedMotion()) return;
    run.current?.cancel();
    g.toggleAttribute("data-band", before.band);
    // An emptied wrapper also gives back the block's top margin: the band starts below it.
    const pad = h === 0 ? Math.min(before.mt, lost) : 0;
    const a = g.animate(
      [{ height: `${lost}px`, paddingTop: `${pad}px`, opacity: 1 }, { height: "0px", paddingTop: "0px", opacity: before.band ? 0 : 1 }],
      { duration: 240, easing: "ease-in" },
    );
    run.current = a;
    const done = () => { if (run.current === a) run.current = null; };
    a.finished.then(done, done);
  });

  return (
    <div ref={wrap} className="flow-root">
      {children}
      <div ref={gap} aria-hidden="true" className="mo-gap" />
    </div>
  );
}
