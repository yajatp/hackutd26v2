"use client";
// The way into the console, once per browser session (after overworldaudio.com's sound gate): a
// full-screen night with two ways in, With sound and Without sound. The choice goes to
// app/ui/sound.ts, which the lockdown tone reads. It never stands in automation's way: it is
// skipped when navigator.webdriver is true (Playwright, so npm run e2e) or the URL has ?gate=0.
//
// It is in the server HTML, so a first visit sees it from the first paint. A small inline script
// just before it hides it at once when it is not wanted (a later visit in the same session, a
// webdriver, ?gate=0), before React loads; React then removes it.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { LiveClock } from "./LiveClock";
import { setSoundChoice, type SoundChoice } from "./sound";
import s from "./night-gate.module.css";

const SEEN = "avon-gate";

const HIDE_EARLY = `(function(){try{if(navigator.webdriver||new URLSearchParams(location.search).get("gate")==="0"||sessionStorage.getItem("${SEEN}")){var s=document.createElement("style");s.textContent="[data-night-gate]{display:none!important}";document.head.appendChild(s)}}catch(e){}})()`;

export function gateSkipped(): boolean {
  try {
    if (navigator.webdriver) return true;
    if (new URLSearchParams(window.location.search).get("gate") === "0") return true;
    return window.sessionStorage.getItem(SEEN) !== null;
  } catch {
    return false;
  }
}

const never = () => () => {};

type Phase = "first" | "open" | "leaving" | "gone";

export function NightGate({ onChoose }: { onChoose?: (c: SoundChoice) => void }) {
  // True only in the server render and while hydrating it: the inline script belongs there alone.
  const fromServer = useSyncExternalStore(never, () => false, () => true);
  const [phase, setPhase] = useState<Phase>("first");
  const first = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    setPhase(gateSkipped() ? "gone" : "open");
  }, []);

  useEffect(() => {
    if (phase !== "open") return;
    first.current?.focus();
    const html = document.documentElement;
    const was = html.style.overflow;
    html.style.overflow = "hidden";
    return () => { html.style.overflow = was; };
  }, [phase]);

  function choose(c: SoundChoice) {
    if (phase === "leaving" || phase === "gone") return;
    setSoundChoice(c);
    try { window.sessionStorage.setItem(SEEN, "1"); } catch { /* asked again next load */ }
    onChoose?.(c);
    setPhase(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "gone" : "leaving");
  }

  if (phase === "gone") return null;
  return (
    <>
      {fromServer && <script dangerouslySetInnerHTML={{ __html: HIDE_EARLY }} />}
      <div
        data-night-gate=""
        role="dialog"
        aria-modal="true"
        aria-labelledby="night-gate-title"
        className={`${s.gate} ${phase === "leaving" ? s.leaving : ""}`}
        onKeyDown={(e) => { if (e.key === "Escape") choose("off"); }}
        onAnimationEnd={(e) => { if (e.target === e.currentTarget && phase === "leaving") setPhase("gone"); }}
      >
        <div className={s.top}>
          <span className={s.mark}>Avon</span>
          <LiveClock className={s.clock} />
        </div>
        <div className={s.body}>
          <h2 id="night-gate-title" className={s.title}>
            <span className={s.line}><span className={s.rise}>Enter the</span></span>
            <span className={s.line}><span className={s.rise} style={{ animationDelay: "180ms" }}>night shift</span></span>
          </h2>
          <p className={s.lede}>
            You run the field until morning. When a site goes into lockdown the console plays a low two-tone. Choose
            whether this laptop makes it.
          </p>
          <div className={s.choices}>
            <button ref={first} type="button" className={s.with} onClick={() => choose("on")}>With sound</button>
            <button type="button" className={s.without} onClick={() => choose("off")}>Without sound</button>
          </div>
        </div>
      </div>
    </>
  );
}
