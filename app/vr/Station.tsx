"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnBadge, connState } from "@/app/ui/Badge";
import { Field } from "./Field";
import { useStation, type Mark } from "./useStation";
import { CONTROLS, FAKED_NOTE, HTTPS_NOTE, LEGEND, NO_CABLE, SAY, STEPS, TITLE, TROUBLE, fill } from "./content";
import s from "./vr.module.css";

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  const [can, setCan] = useState(false);
  useEffect(() => setCan(!!navigator.clipboard && window.isSecureContext), []);
  if (!can) return null;
  return (
    <button
      type="button"
      className={s.copy}
      onClick={() => navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }, () => {})}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Check({ mark, title, children }: { mark: Mark; title: string; children: React.ReactNode }) {
  const glyph = { ok: "■", warn: "●", alert: "▲", info: "□" }[mark];
  return (
    <li className={s.check}>
      <span className={`${s.mark} ${s[`mark_${mark}`]}`} aria-hidden>{glyph}</span>
      <div>
        <p className={s.checkTitle}>{title}</p>
        <div className={s.checkText}>{children}</div>
      </div>
    </li>
  );
}

const SWATCH = { alert: s.swatchAlert, warn: s.swatchWarn, ok: s.swatchOk, ring: s.swatchRing };

export function Station() {
  const st = useStation();
  const top = st.topState?.name ?? "the top problem";
  return (
    <div className={s.page}>
      <section className={s.hero}>
        <Field tanks={st.tanks} pads={st.pads} states={st.states} top={st.top} />
        <header className={s.bar}>
          <Link href="/" className={s.wordmark}>Avon</Link>
          <span className={s.barTitle}>VR station</span>
          <span className={s.barStatus}><ConnBadge state={connState(st.status)} /></span>
        </header>
        <p className={s.hint}>Move the pointer to light the table.</p>
      </section>

      <div className={s.intro}>
        <h1 className={s.title}>{TITLE}</h1>
        <p className={s.summary}>{st.summary}</p>
      </div>

      <div className={s.grid}>
        <section aria-labelledby="ready">
          <h2 id="ready" className={s.h2}>Before you hand it over</h2>
          <ul className={s.checks}>
            {st.checks.map((c) => (
              <Check key={c.key} mark={c.mark} title={c.title}>
                {c.detail}
                {c.key === "site" && !st.loaded && <> <Link href="/console" className={s.link}>Open the console</Link></>}
                {c.key === "fake" && st.faked.length > 0 && <> <button type="button" className={s.inline} onClick={() => st.clearFakes()}>Clear the fake</button></>}
              </Check>
            ))}
          </ul>
          <div className={s.go}>
            <Link href="/twin" className={s.primary}>Open the model</Link>
            <p className={s.goNote}>
              {st.xr === "vr" ? "Enter VR is at the top right of the model." : "It opens flat in this browser. The headset gets VR over the cable."}
            </p>
          </div>
        </section>

        <section aria-labelledby="handoff">
          <h2 id="handoff" className={s.h2}>The hand-off</h2>
          <ol className={s.steps}>
            {STEPS.map((x, i) => (
              <li key={i}>
                {fill(x.text, { top })}
                {x.cmd && <div className={s.cmd}><pre>{x.cmd}</pre><Copy text={x.cmd} /></div>}
                {x.note && <span className={s.aside}>{x.note}</span>}
                {i === STEPS.length - 1 && <q className={s.say}>{SAY}</q>}
              </li>
            ))}
          </ol>
          <div className={s.alt}>
            <h3 className={s.h3}>{NO_CABLE.title}</h3>
            <p>{fill(NO_CABLE.text, { origin: st.lanOrigin })}</p>
          </div>
        </section>

        <section aria-labelledby="inside">
          <h2 id="inside" className={s.h2}>In the headset</h2>
          <dl className={s.pairs}>
            {CONTROLS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <ul className={s.legend}>
            {LEGEND.map((l) => <li key={l.tone}><span className={`${s.swatch} ${SWATCH[l.tone]}`} />{l.text}</li>)}
          </ul>
          <p className={s.aside}>{FAKED_NOTE}</p>
        </section>

        <section aria-labelledby="wrong">
          <h2 id="wrong" className={s.h2}>If it goes wrong</h2>
          <dl className={s.pairs}>
            {TROUBLE.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <p className={s.aside}>{HTTPS_NOTE}</p>
        </section>
      </div>

      <footer className={s.foot}>
        <Link href="/console" className={s.link}>Console</Link>
        <Link href="/attack" className={s.link}>Phone 1</Link>
        <Link href="/twin" className={s.link}>The model</Link>
        <span className={s.footNote}>Setup in full: docs/QUEST.md</span>
      </footer>
    </div>
  );
}
