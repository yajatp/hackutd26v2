"use client";
// The wordmark scrambles and resolves on hover (after MECHA): five frames of 60 ms, the letters
// settling from the left while the rest are drawn from a few hard glyphs, then the word again at
// 300 ms. The width is held while it runs, so nothing beside it moves. Under
// prefers-reduced-motion it never runs. The word itself stays the element's text at rest.

const GLYPHS = "AVON#/=+0123456789<>";
const FRAMES = 5;

// Frame `i` of FRAMES: how many letters have settled, the rest random glyphs (pick(n) in 0..n-1).
export function scrambleFrame(word: string, i: number, pick: (n: number) => number): string {
  const settled = Math.floor((i * word.length) / FRAMES);
  return [...word].map((ch, k) => (k < settled || ch === " " ? ch : GLYPHS[pick(GLYPHS.length)])).join("");
}

// Sui style: no scramble effect. The wordmark is plain text with the same DOM.
export function Scramble({ text, className = "" }: { text: string; className?: string }) {
  // fontWeight inherit: a page's `header h1 span` rule (Phone 1 thins those) must not reach the wordmark.
  return (
    <span className={className} style={{ fontWeight: "inherit", whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}
