"use client";
// Imperative motion for the phone remote (Web Animations), next to the CSS in attack.module.css.
// Same house rules: presentation only (the words follow the data at once), nothing on the first
// load of the data unless it says so, and nothing at all under prefers-reduced-motion.
// CSS transitions on a property beat a Web Animation of it, so the elements animated here never
// transition transform or opacity in the stylesheet.
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { prefersReducedMotion } from "@/app/console/tween";
import { useArmed } from "@/app/console/motion";

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const EASE_IN = "cubic-bezier(0.5, 0, 0.75, 0)";

// Keeps the last value on screen for exitMs after it goes away, so it can play its way out.
// hold: while true, a value that is not on screen yet waits (one already showing just updates).
export function usePresence<T>(value: T | null, same: (a: T, b: T) => boolean, exitMs: number, hold = false): { item: T | null; leaving: boolean } {
  const [kept, setKept] = useState<T | null>(null);
  const shown = value !== null && !(hold && kept === null) ? value : null;
  // Adopt a new value during render (React's "adjust state when a prop changes" pattern).
  if (shown !== null && (kept === null || !same(kept, shown))) setKept(shown);
  const gone = shown === null && kept !== null;
  useEffect(() => {
    if (!gone) return;
    const t = setTimeout(() => setKept(null), prefersReducedMotion() ? 0 : exitMs);
    return () => clearTimeout(t);
  }, [gone, exitMs]);
  return { item: shown ?? kept, leaving: gone };
}

// A block that unfolds to its height when it arrives as news (born: after the page armed) and
// folds to nothing while `leaving`. Clipped only while it moves, so rings drawn past its edge show.
export function useFold(ref: RefObject<HTMLElement | null>, born: boolean, leaving: boolean, foldMs: number) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !born || prefersReducedMotion()) return;
    el.style.overflowY = "clip";
    const a = el.animate(
      [{ height: "0px", opacity: 0 }, { height: `${el.offsetHeight}px`, opacity: 1 }],
      { duration: 280, easing: EASE },
    );
    const done = () => { el.style.overflowY = ""; };
    a.finished.then(done, done);
    return () => a.cancel();
  }, [ref, born]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !leaving || prefersReducedMotion()) return;
    el.style.overflowY = "clip";
    const a = el.animate(
      [{ height: `${el.offsetHeight}px`, opacity: 1 }, { height: "0px", opacity: 0 }],
      { duration: foldMs, easing: EASE_IN, fill: "forwards" },
    );
    return () => { a.cancel(); el.style.overflowY = ""; };
  }, [ref, leaving, foldMs]);
}

// A DEAD sensor's dot at rest: a dim flat line (.dot[data-state="dead"] in attack.module.css).
const FLAT: Keyframe = { transform: "scale(1.9, 0.24)", opacity: 0.6 };

// What the console says about a tank's level sensor, played on its dot when that is news.
// Each move ends where the stylesheet's resting state for it is (.dot[data-state] in the CSS).
const DOT_MOVES: Record<string, { frames: Keyframe[]; opts: KeyframeAnimationOptions }> = {
  // DEAD: one last beat, then the pulse drops to a flat line and dims.
  dead: {
    frames: [
      { transform: "none", opacity: 1 },
      { transform: "scale(0.8, 1.7)", opacity: 1, offset: 0.3 },
      FLAT,
    ],
    opts: { duration: 380, easing: EASE },
  },
  // LYING: three frames of jitter, then it reads amber (its color waits for this in the CSS).
  lying: {
    frames: [
      { transform: "translate(-2px, 1px)", filter: "brightness(1.9)", easing: "steps(1, end)" },
      { transform: "translate(2px, -1px)", opacity: 0.35, easing: "steps(1, end)" },
      { transform: "translate(-1px, 0.5px)", filter: "brightness(1.5)", easing: "steps(1, end)" },
      { transform: "none", opacity: 1, filter: "none" },
    ],
    opts: { duration: 180 },
  },
  // DRIFTING: one slow wobble while the color slides to amber.
  drifting: {
    frames: [
      { transform: "none" },
      { transform: "translateX(-2.5px) rotate(-12deg)", offset: 0.28 },
      { transform: "translateX(2.5px) rotate(10deg)", offset: 0.64 },
      { transform: "none" },
    ],
    opts: { duration: 420, easing: "ease-in-out" },
  },
};

// Back from a flat line (Undo Kill, Clear, or the console no longer calling it DEAD).
const REVIVE = { frames: [FLAT, { transform: "none", opacity: 1 }], opts: { duration: 300, easing: EASE } };

export function useDotMotion(ref: RefObject<HTMLElement | null>, state: string | undefined) {
  const armed = useArmed();
  const was = useRef(state);
  useLayoutEffect(() => {
    const from = was.current;
    was.current = state;
    const el = ref.current;
    if (from === state || !el || !armed.current || prefersReducedMotion()) return;
    const revive = from === "dead";
    if (revive) el.animate(REVIVE.frames, REVIVE.opts);
    const move = state ? DOT_MOVES[state] : undefined;
    if (move) el.animate(move.frames, { ...move.opts, delay: revive ? 300 : 0 });
  }, [ref, armed, state]);
}

// The connection badge: LIVE / Connecting... / DISCONNECTED crossfade, and DISCONNECTED shakes
// once. The old badge fades out as a still copy in `layer`, with its role removed, so the header
// only ever holds one [role=status] (scripts/e2e/screens.mjs reads the first).
export function useConnSwap(
  wrap: RefObject<HTMLElement | null>, now: RefObject<HTMLElement | null>, layer: RefObject<HTMLElement | null>,
  state: string, shakeOn: string,
) {
  const last = useRef<{ state: string; html: string } | null>(null);
  useLayoutEffect(() => {
    const w = wrap.current;
    const c = now.current;
    const l = layer.current;
    if (!w || !c || !l) return;
    const before = last.current;
    last.current = { state, html: c.innerHTML };
    if (!before || before.state === state || prefersReducedMotion()) return;
    const ghost = document.createElement("span");
    ghost.innerHTML = before.html;
    for (const el of ghost.querySelectorAll("[role],[title]")) { el.removeAttribute("role"); el.removeAttribute("title"); }
    l.appendChild(ghost);
    const out = ghost.animate(
      [{ opacity: 1, transform: "none", filter: "none" }, { opacity: 0, transform: "scale(0.92)", filter: "blur(2px)" }],
      { duration: 220, easing: "ease-out", fill: "forwards" },
    );
    out.finished.then(() => ghost.remove(), () => ghost.remove());
    c.animate(
      [{ opacity: 0, transform: "scale(1.08)", filter: "blur(2px)" }, { opacity: 1, transform: "none", filter: "none" }],
      { duration: 260, easing: EASE },
    );
    if (state === shakeOn) {
      w.animate(
        [{ transform: "none" }, { transform: "translateX(-6px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(2px)" }, { transform: "none" }],
        { duration: 380, delay: 80, easing: EASE },
      );
    }
  }, [wrap, now, layer, state, shakeOn]);
}
