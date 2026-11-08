"use client";
// The wordmark scrambles and resolves on hover (after MECHA): five frames of 60 ms, the letters
// settling from the left while the rest are drawn from a few hard glyphs, then the word again at
// 300 ms. The width is held while it runs, so nothing beside it moves. Under
// prefers-reduced-motion it never runs. The word itself stays the element's text at rest.
import { useEffect, useRef } from "react";

const GLYPHS = "AVON#/=+0123456789<>";
const STEP_MS = 60;
const FRAMES = 5;

// Frame `i` of FRAMES: how many letters have settled, the rest random glyphs (pick(n) in 0..n-1).
export function scrambleFrame(word: string, i: number, pick: (n: number) => number): string {
  const settled = Math.floor((i * word.length) / FRAMES);
  return [...word].map((ch, k) => (k < settled || ch === " " ? ch : GLYPHS[pick(GLYPHS.length)])).join("");
}

export function Scramble({ text, className = "" }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function run() {
    const el = ref.current;
    const node = el?.firstChild;
    if (!el || !node || timer.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    el.style.display = "inline-block";
    el.style.width = `${el.getBoundingClientRect().width}px`;
    let i = 0;
    const tick = () => {
      if (i >= FRAMES) {
        clearInterval(timer.current!);
        timer.current = null;
        node.nodeValue = text;
        el.style.width = "";
        el.style.display = "";
        return;
      }
      node.nodeValue = scrambleFrame(text, i++, (n) => Math.floor(Math.random() * n));
    };
    tick();
    timer.current = setInterval(tick, STEP_MS);
  }

  // fontWeight inherit: a page's `header h1 span` rule (Phone 1 thins those) must not reach the wordmark.
  return (
    <span ref={ref} className={className} style={{ fontWeight: "inherit", whiteSpace: "nowrap" }} onPointerEnter={run}>
      {text}
    </span>
  );
}
