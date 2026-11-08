"use client";
// A headline that rises line by line from behind a mask (after MECHA): each word sits in a clip;
// when it plays, the words are grouped by the line they landed on and each line moves
// translateY(100%) to 0 in 380 ms, 60 ms after the line above. It plays when `text` changes (or
// `cue`, for words that rise with something else), and on load with `onMount`: then the server
// HTML already holds the words under the mask (.lr-pre), so the first paint never shows them
// before they rise, and CSS lets them rise by itself after 2.6 s if no script ever runs. The words are
// in the DOM at once, as plain text with single spaces between them (scripts/e2e and
// board.test.tsx read them). The mask exists only while it plays (.lr-play in app/ui/motion.css,
// a global sheet, so this file imports no CSS and still renders in plain Node). Under
// prefers-reduced-motion it never plays.
import { Fragment, useLayoutEffect, useRef } from "react";

const STAGGER_MS = 60;    // the rise itself (380 ms) is in app/ui/motion.css
const FALLBACK_MS = 2600; // .lr-pre's own rise in motion.css starts then

// The line each word is on, from the words' top edges (a new line starts below the last one).
export function lineIndexes(tops: number[]): number[] {
  let line = -1;
  let last = -Infinity;
  return tops.map((t) => {
    if (t > last + 2) { line++; last = t; }
    return line;
  });
}

export function LineReveal({ text, cue = text, onMount = false, delay = 0, className = "" }: {
  text: string; cue?: string; onMount?: boolean; delay?: number; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<string | null>(null);
  const settle = useRef<((e: AnimationEvent) => void) | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    const before = shown.current;
    shown.current = cue;
    if (!el) return;
    // Held under the mask since it was first drawn: play now, unless the CSS fallback has already
    // started (a slow first load), which its own clock says.
    if (el.classList.contains("lr-pre")) {
      const fallback = el.querySelector(".lr-i")?.getAnimations()[0];
      const late = Number(fallback?.currentTime ?? 0) >= FALLBACK_MS;
      el.classList.remove("lr-pre");
      if (late) return;
    }
    if (before === null ? !onMount : before === cue) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const words = Array.from(el.children) as HTMLElement[];
    const lines = lineIndexes(words.map((w) => w.getBoundingClientRect().top));
    words.forEach((w, i) => w.style.setProperty("--lr-d", `${delay + lines[i] * STAGGER_MS}ms`));
    // The mask comes off when the last word has landed (an event, not a timer, so a re-run of
    // this effect cannot strand it).
    const last = words.at(-1)?.firstElementChild ?? null;
    if (settle.current) el.removeEventListener("animationend", settle.current);
    const done = (e: AnimationEvent) => {
      if (e.target !== last) return;
      el.classList.remove("lr-play");
      el.removeEventListener("animationend", done);
      settle.current = null;
    };
    settle.current = done;
    el.addEventListener("animationend", done);
    el.classList.remove("lr-play");
    void el.offsetWidth;    // restart when it plays again mid-way
    el.classList.add("lr-play");
  }, [cue, onMount, delay]);

  return (
    <span ref={ref} className={`lr ${onMount ? "lr-pre" : ""} ${className}`}>
      {text.split(/\s+/).filter(Boolean).map((w, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className="lr-w"><span className="lr-i">{w}</span></span>
        </Fragment>
      ))}
    </span>
  );
}
