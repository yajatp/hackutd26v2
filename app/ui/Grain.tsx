import s from "./grain.module.css";

// Film grain over a night screen (after ascension.pegassi.be and overworldaudio.com): a fixed
// layer of grey SVG noise, overlay-blended so it adds texture without tinting, that jumps between a few offsets about ten times a second
// (a steps() animation), never takes a pointer, and holds still under prefers-reduced-motion.
// Mount it once per page; it covers the viewport whatever the page scrolls.
export function Grain() {
  return <div aria-hidden="true" className={s.grain} />;
}
