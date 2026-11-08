"use client";
// /map: the oil sites across America, each live from its own SpacetimeDB database (lib/fleet.ts).
// Click a site and the map flies there with its panel; the table below compares every site.
// ?site=<key> opens with that site selected, and selecting one writes it back to the address.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useFleet } from "@/lib/fleet";
import { Badge } from "@/app/ui/Badge";
import { Grain } from "@/app/ui/Grain";
import { Compare } from "./Compare";
import { money, totalsOf } from "./model";
import { SitePanel } from "./SitePanel";
import { UsMap } from "./UsMap";
import s from "./map.module.css";
import { BrineLogo } from "@/app/ui/BrineLogo";

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function MapScreen() {
  const { sites, ready } = useFleet();
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("site");
    if (key && sites.some((x) => x.key === key)) setSelected(key);
    // The address is read once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Bring the map to the top of the window: from the table, and on a phone, where the bottom
  // sheet would otherwise cover it.
  const showMap = () => {
    document.getElementById("map")?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
  };

  const select = useCallback((key: string | null) => {
    setSelected(key);
    const url = new URL(window.location.href);
    if (key) url.searchParams.set("site", key);
    else url.searchParams.delete("site");
    window.history.replaceState(null, "", url);
    if (!key) return;
    if (window.innerWidth < 900) showMap();
    // Wide: nudge the page only as far as needed for the whole panel to be in the window.
    else document.getElementById("map")?.scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "nearest" });
  }, []);
  const close = useCallback(() => select(null), [select]);

  const fromTable = (key: string) => {
    select(key);
    showMap();
  };

  const t = totalsOf(sites);
  const site = sites.find((x) => x.key === selected) ?? null;
  const allLive = t.live === t.sites;

  return (
    <div className={s.page}>
      <Grain />
      <header className={s.bar}>
        <Link href="/" className={s.wordmark} style={{ background: "none", padding: 0 }}><BrineLogo height={22} /></Link>
        <span className={s.barTitle}>Sites across America</span>
        <span className={s.barStatus} role="status">
          {allLive ? <Badge icon="■">{t.live} OF {t.sites} LIVE</Badge>
            : !ready ? <Badge tone="warn" icon="●">Connecting {t.live} of {t.sites}</Badge>
            : <Badge tone="warn" icon="●">{t.live} OF {t.sites} LIVE</Badge>}
        </span>
      </header>

      <section className={s.intro}>
        <h1 className={s.title}>Six oil sites, one night shift</h1>
        <div className={s.introText}>
          <p className={s.lede}>
            Each site is its own live SpacetimeDB database. Pick one to see what broke there and open its console, its model or its Phone 1.
          </p>
          <p className={s.totals}>
            {t.failures > 0
              ? <><span className={s.alertWord}>▲ {t.failures} pump failure{t.failures === 1 ? "" : "s"}</span> at {t.failingSites} site{t.failingSites === 1 ? "" : "s"} · cost if unaddressed {money(t.doNothing)} · response cost <b>{money(t.plans)}</b></>
              : ready ? "No pump failures at any site right now." : "Reading every site..."}
          </p>
        </div>
      </section>

      <div id="map" className={s.mapWrap} data-panel={site ? "open" : undefined}>
        <UsMap sites={sites} selected={selected} onSelect={select} />
        <SitePanel site={site} onClose={close} />
        <ul className={s.legend} aria-label="Marker colors">
          <li><span className={s.rowDot} data-tone="alert" aria-hidden="true" />Pump failed</li>
          <li><span className={s.rowDot} data-tone="warn" aria-hidden="true" />Sensor to check or place to inspect</li>
          <li><span className={s.rowDot} data-tone="ok" aria-hidden="true" />All clear</li>
        </ul>
      </div>

      <section className={s.compare} aria-labelledby="compare">
        <h2 id="compare" className={s.h2}>Compare the sites</h2>
        <Compare sites={sites} selected={selected} onSelect={fromTable} />
      </section>

      <footer className={s.foot}>
        <p>
          Illustrative sites built from EOG&apos;s challenge data, placed near EOG&apos;s public operating areas; they do not identify any EOG facility.
          Basin shapes are approximate. State outlines: U.S. Census Bureau, cartographic boundary file, 1:20,000,000.
        </p>
      </footer>
    </div>
  );
}
