"use client";
// The page's side of the entry map: the live fleet (one read-only link per site, lib/fleet.ts,
// open only while the map shows) handed up to the scene, and a plain list of the sites to click.
import { useLayoutEffect } from "react";
import { useFleet, type SiteSummary } from "@/lib/fleet";
import { siteStatusText, siteTone } from "./entry";
import css from "./picker.module.css";

export function FleetFeed({ onSites }: { onSites(s: SiteSummary[]): void }) {
  const { sites } = useFleet();
  useLayoutEffect(() => { onSites(sites); }, [sites, onSites]);
  return null;
}

export function SitePicker({ sites, onPick }: { sites: SiteSummary[]; onPick(key: string): void }) {
  return (
    <aside className={css.picker} data-testid="twin-site-picker" aria-label="Choose a site">
      <p className={css.kicker}>Site selection</p>
      <h2 className={css.title}>Choose a site</h2>
      <p className={css.hint}>Click a site on the map or in this list.</p>
      <ul className={css.list}>
        {sites.map((s) => {
          const tone = siteTone(s);
          return (
            <li key={s.key}>
              <button type="button" className={css.site} data-testid={`twin-site-${s.key}`} onClick={() => onPick(s.key)}>
                <span className={css.dot} data-tone={tone} />
                <span className={css.name}>{s.name}</span>
                <span className={css.basin}>{s.basin} · {s.state}</span>
                <span className={css.status} data-tone={tone}>{siteStatusText(s)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export function BackToMap({ onBack }: { onBack(): void }) {
  return <button type="button" className={css.back} data-testid="twin-back" onClick={onBack}>← Back to map</button>;
}
