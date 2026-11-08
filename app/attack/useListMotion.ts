"use client";
// Active faults slide in and out. React drops a cleared <li> at once (the words leave the DOM the
// moment the data does, as the e2e expects), so the slide out is played by a copy: an inert,
// aria-hidden <div> (never an <li>, so nothing reading "the faults" counts it) drawn in a layer
// over the list where the item was. The items that stay glide to their new place, and the
// list's height follows instead of jumping. Nothing moves under prefers-reduced-motion.
import { useLayoutEffect, useRef, type RefObject } from "react";
import { prefersReducedMotion } from "@/app/console/tween";

const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";

interface Snap { node: HTMLElement; top: number; left: number; width: number; height: number }

// A still copy of a list item that has just left, placed where it was.
function ghostOf(s: Snap): HTMLDivElement {
  const g = document.createElement("div");
  g.className = s.node.className;
  g.innerHTML = s.node.innerHTML;
  g.setAttribute("aria-hidden", "true");
  g.inert = true;
  Object.assign(g.style, {
    position: "absolute", top: `${s.top}px`, left: `${s.left}px`, width: `${s.width}px`, height: `${s.height}px`,
    margin: "0", pointerEvents: "none",
  });
  for (const el of [g, ...g.querySelectorAll<HTMLElement>("*")]) el.style.animation = "none";
  return g;
}

// wrap: the list's positioned box. layer: an empty, absolutely placed child of wrap that React
// never fills. Items are the <li data-id> inside wrap. armed: false until the page has settled on
// its first data (app/console/motion.tsx), so the first load of the list does not move.
export function useListMotion(wrap: RefObject<HTMLElement | null>, layer: RefObject<HTMLElement | null>, armed: RefObject<boolean>) {
  const last = useRef<{ ids: string; h: number; items: Map<string, Snap> } | null>(null);
  const grow = useRef<Animation | null>(null);

  // Runs after every render: it must see each list state to know what left.
  useLayoutEffect(() => {
    const w = wrap.current;
    const g = layer.current;
    if (!w || !g) return;
    const els = [...w.querySelectorAll<HTMLElement>("li[data-id]")];
    const ids = els.map((e) => e.dataset.id).join("|");
    const before = last.current;
    const changed = before !== null && before.ids !== ids;
    if (changed) grow.current?.cancel();
    const growing = grow.current?.playState === "running";
    const base = g.getBoundingClientRect();
    const items = new Map<string, Snap>();
    for (const el of els) {
      const r = el.getBoundingClientRect();
      items.set(el.dataset.id!, { node: el, top: r.top - base.top, left: r.left - base.left, width: r.width, height: r.height });
    }
    const h = growing && before ? before.h : w.offsetHeight;
    last.current = { ids, h, items };
    if (!changed || !before || !armed.current || prefersReducedMotion()) return;

    // The items that stay glide from where they were.
    for (const [id, now] of items) {
      const was = before.items.get(id);
      const dy = was ? was.top - now.top : 0;
      if (Math.abs(dy) > 1) now.node.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 300, easing: EASE });
    }
    // The ones that left slide out to the right, a beat apart (Clear all reads as one wave).
    let i = 0;
    for (const [id, was] of before.items) {
      if (items.has(id)) continue;
      const ghost = ghostOf(was);
      g.appendChild(ghost);
      const out = ghost.animate(
        [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateX(40px)" }],
        { duration: 320, delay: i++ * 70, easing: "cubic-bezier(0.5, 0, 0.75, 0)", fill: "both" },
      );
      out.finished.then(() => ghost.remove(), () => ghost.remove());
    }
    // The list's own height follows, clipped top and bottom while it does.
    if (Math.abs(before.h - h) > 1) {
      w.style.overflowY = "clip";
      const a = w.animate([{ height: `${before.h}px` }, { height: `${h}px` }], { duration: 340 + Math.max(0, i - 1) * 70, easing: EASE });
      grow.current = a;
      const done = () => { if (grow.current === a) { w.style.overflowY = ""; grow.current = null; } };
      a.finished.then(done, done);
    }
  });
}
