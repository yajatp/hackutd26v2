"use client";
// The front door at /: what Avon is in one line, then every screen as a numbered index in demo
// order (after signal-a.studio's hairline rows), each row inverting to moonlight on hover (after
// MECHA). The rows are plain links rendered on the server, so they work before any JavaScript;
// the live hints and the badge fill in once the site's database answers.
import { AvonProvider, siteDatabase, useAvonConsole, useAvonRtt } from "@/lib/live";
import { ConnBadge, connState } from "@/app/ui/Badge";
import { Grain } from "@/app/ui/Grain";
import { hintFor, hrefFor, SCREENS, subtitleFor, type LiveFacts } from "./screens";
import s from "./home.module.css";
import { BrineLogo } from "@/app/ui/BrineLogo";

export function Home({ site }: { site: string | null }) {
  return (
    <AvonProvider database={siteDatabase(site)}>
      <Front site={site} />
    </AvonProvider>
  );
}

function Front({ site }: { site: string | null }) {
  const { status, view, faults, facilities, lockdown } = useAvonConsole();
  const rtt = useAvonRtt();
  const facts: LiveFacts = {
    status,
    failures: view ? view.alerts.filter((a) => a.fix).length : null,
    doNothing: view?.totals.do_nothing ?? 0,
    plans: view?.totals.plans ?? 0,
    faults: faults.length,
    facilities: facilities.length,
    lockdown: !!lockdown?.active,
    rttMs: rtt,
  };

  return (
    <div className={s.page}>
      <Grain />
      <header className={s.bar}>
        <span className={s.wordmark} style={{ background: "none", padding: 0 }}><BrineLogo height={24} /></span>
        <span className={s.barStatus}><ConnBadge state={connState(status)} ms={rtt} /></span>
      </header>

      <section className={s.hero}>
        <div className={s.crosses} aria-hidden="true" />
        <h1 className={s.title}>What broke, the cheapest fix, and which sensors to trust.</h1>
        <p className={s.sub}>{subtitleFor(site)}</p>
      </section>

      <nav className={s.index} aria-label="Brine screens, in demo order">
        <ol className={s.list}>
          {SCREENS.map((x, i) => {
            const h = hintFor(x.key, facts);
            return (
              <li key={x.key} className={s.item} style={{ "--i": i } as React.CSSProperties}>
                <a href={hrefFor(x.href, site)} className={s.row}>
                  <span className={s.num} aria-hidden="true">{String(x.n).padStart(2, "0")}</span>
                  <span className={s.name}>{x.name}</span>
                  <span className={s.what}>{x.what}</span>
                  <span className={s.hint} data-tone={h?.tone}>{h?.text ?? ""}</span>
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      <footer className={s.foot}>
        <p>Start at 1 and go down: each screen opens live on the same site. Built at HackUTD 2026 for EOG&apos;s challenge, on illustrative data.</p>
      </footer>
    </div>
  );
}
