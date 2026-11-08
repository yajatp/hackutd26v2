"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ConnBadge, connState } from "@/app/ui/Badge";
import { LockdownBanner } from "@/app/ui/LockdownBanner";
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
        {children && <div className={s.checkText}>{children}</div>}
      </div>
    </li>
  );
}

const SWATCH = { alert: s.swatchAlert, warn: s.swatchWarn, ok: s.swatchOk, ring: s.swatchRing };

// content.ts marks what a person types with `backticks`; set those parts in monospace.
function code(text: string): React.ReactNode {
  return text.split("`").map((part, i) => (i % 2 ? <code key={i}>{part}</code> : part));
}

export function Station() {
  const st = useStation();
  const top = st.topState?.name ?? "the top problem";
  return (
    <div className={s.page}>
      <LockdownBanner />
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
      </div>

      <div className={s.deck}>
        <div className={s.lead}>
          <p className={s.summary}>{st.summary}</p>
          <Link href="/twin" className={s.primary}>Open the model</Link>
          <p className={s.goNote}>
            {st.xr === "vr" ? "Enter VR is at the top right of the model." : "It opens flat in this browser. The headset gets VR over the cable or the hosted link."}
          </p>
        </div>
        <section aria-labelledby="ready" className={s.rail}>
          <h2 id="ready" className={s.h2}>Before you hand it over</h2>
          <ul className={s.checks}>
            {/* A passed check is only its title; a problem says what to do. */}
            {st.checks.map((c) => (
              <Check key={c.key} mark={c.mark} title={c.title}>
                {c.mark === "ok" ? null : <>
                  {c.detail}
                  {c.key === "site" && !st.loaded && <> <Link href="/console" className={s.link}>Open the console</Link></>}
                  {c.key === "fake" && st.faked.length > 0 && <> <button type="button" className={s.inline} onClick={() => st.clearFakes()}>Clear the fake</button></>}
                </>}
              </Check>
            ))}
          </ul>
        </section>
      </div>

      <section aria-labelledby="handoff" className={s.runsheet}>
        <h2 id="handoff" className={s.h2}>The hand-off</h2>
        <ol className={s.steps}>
          {STEPS.map((x, i) => (
            <li key={i}>
              <div>
                {code(fill(x.text, { top }))}
                {x.cmd && <div className={s.cmd}><pre>{x.cmd}</pre><Copy text={x.cmd} /></div>}
                {x.note && <span className={s.aside}>{code(x.note)}</span>}
                {i === STEPS.length - 1 && <q className={s.say}>{SAY}</q>}
              </div>
            </li>
          ))}
        </ol>
        <p className={s.finish}>The judge is in VR.</p>
      </section>

      <div className={s.more}>
        <details>
          <summary>{NO_CABLE.title}</summary>
          <p className={s.moreText}>{code(fill(NO_CABLE.text, { origin: st.lanOrigin }))}</p>
        </details>
        <details>
          <summary>In the headset</summary>
          <dl className={s.pairs}>
            {CONTROLS.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          <ul className={s.legend}>
            {LEGEND.map((l) => <li key={l.tone}><span className={`${s.swatch} ${SWATCH[l.tone]}`} />{l.text}</li>)}
          </ul>
          <p className={s.aside}>{FAKED_NOTE}</p>
        </details>
        <details>
          <summary>If it goes wrong</summary>
          <dl className={s.pairs}>
            {TROUBLE.map(([k, v]) => <div key={k}><dt>{code(k)}</dt><dd>{code(v)}</dd></div>)}
          </dl>
          <p className={s.aside}>{HTTPS_NOTE}</p>
        </details>
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
