import { Fragment } from "react";
import { numberRuns } from "./chain-view";

// Text in Pixelify Sans with its numbers in a face whose 5 is not an S (darkroom.module.css,
// .dr-num). Same characters, same order: only the numbers' font changes.
export function Digits({ text }: { text: string }) {
  return (
    <>
      {numberRuns(text).map((r, i) => (r.num ? <span key={i} className="dr-num">{r.text}</span> : <Fragment key={i}>{r.text}</Fragment>))}
    </>
  );
}
