"use client";
// The selected site: a panel beside the map on a wide screen, a bottom sheet on a phone. It keeps
// the last site while it slides out, so closing animates too. Most important first, so all of it
// fits a 1440 x 900 laptop: who and how live, the top card, the night's cost, then the counts in one
// row. When a shorter window still clips it, the body scrolls and its foot fades to say so.
import { useCallback, useEffect, useRef, useState } from "react";
import type { SiteSummary } from "@/lib/fleet";
import { ConnBadge, connState } from "@/app/ui/Badge";
import { money, pretty, saving, shortIds } from "./model";
import s from "./map.module.css";

export function SitePanel({ site, onClose }: { site: SiteSummary | null; onClose(): void }) {
  const [last, setLast] = useState<SiteSummary | null>(site);
  useEffect(() => { if (site) setLast(site); }, [site]);
  const shown = site ?? last;
  const open = site !== null;
  const body = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  const check = useCallback(() => {
    const el = body.current;
    if (el) setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4);
  }, []);
  useEffect(() => {
    const el = body.current;
    if (!el) return;
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const c of el.children) ro.observe(c);
    return () => ro.disconnect();
  }, [check, shown]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!shown) return <aside className={s.panel} data-open={false} aria-hidden="true" inert />;
  const q = `?site=${encodeURIComponent(shown.key)}`;
  const max = Math.max(shown.doNothing, shown.plans, 1);
  // One row of counts; the rarer two only when there is something to count.
  const stats: [string, number, string?][] = [
    ["Facilities", shown.facilities],
    ["Pump failures", shown.pumpFailures, shown.pumpFailures ? "alert" : undefined],
    ["Sensors to check", shown.sensorIssues, shown.sensorIssues ? "warn" : undefined],
    ...(shown.inspections ? [["To inspect", shown.inspections, "warn"] as [string, number, string]] : []),
    ...(shown.simulatedFaults ? [["Simulated faults", shown.simulatedFaults, "warn"] as [string, number, string]] : []),
  ];
  const top = shown.top ? `${pretty(shown.top.facilityId)} ${shortIds(shown.top.text)}` : null;

  return (
    <aside className={s.panel} data-open={open} aria-label={`${shown.name} site`} aria-hidden={!open} inert={!open}>
      <div className={s.panelBody} ref={body} onScroll={check} data-more={more || undefined}>
        <div className={s.panelHead}>
          <p className={s.panelBasin}>{shown.basin}</p>
          <button type="button" className={s.close} onClick={onClose} aria-label="Close the site panel">Close</button>
        </div>
        <h2 className={s.panelName}>{shown.name}</h2>
        <p className={s.panelCity}>{shown.city}, {shown.state}</p>
        <div className={s.panelStatus}>
          <ConnBadge state={connState(shown.status)} />
          <code className={s.dbName}>{shown.db}</code>
          {shown.lockdown && <span className={s.tag} data-tone="alert"><span className={s.tagIcon}>▲</span>LOCKDOWN</span>}
        </div>

        <section className={s.top} aria-label="Top card">
          <p className={s.sectionLabel}>Top card</p>
          {shown.top ? (
            <p className={s.topLine} title={top ?? undefined}><b>{pretty(shown.top.facilityId)}</b> {shortIds(shown.top.text)}</p>
          ) : (
            <p className={s.topLine}>{shown.datasetId ? "No pump failures right now. Every tank is draining normally." : "No data from this site yet."}</p>
          )}
        </section>

        <section className={s.cost} aria-label="The night's cost">
          <p className={s.sectionLabel}>The night&apos;s cost</p>
          <div className={s.costRow}>
            <span>Response cost</span>
            <span className={s.costBar} style={{ "--w": shown.plans / max } as React.CSSProperties} data-ink="moon" />
            <b>{money(shown.plans)}</b>
          </div>
          <div className={s.costRow}>
            <span>Cost if unaddressed</span>
            <span className={s.costBar} style={{ "--w": shown.doNothing / max } as React.CSSProperties} data-ink="dust" />
            <b>{money(shown.doNothing)}</b>
          </div>
          <p className={s.saving}>Savings <b>{money(saving(shown))}</b></p>
        </section>

        <dl className={s.stats}>
          {stats.map(([label, n, tone]) => (
            <div key={label} className={s.stat}>
              <dt>{label}</dt>
              <dd data-tone={tone}>{tone === "alert" ? "▲ " : tone === "warn" ? "● " : ""}{n}</dd>
            </div>
          ))}
        </dl>
      </div>

      <nav className={s.actions} aria-label={`Open ${shown.name}`}>
        <a href={`/console${q}`} className={s.action}><span>Open console</span><span className={s.actionHint}>the night operator&apos;s screen</span></a>
        <a href={`/twin${q}`} className={s.action}><span>Open the model</span><span className={s.actionHint}>the site in 3D and VR</span></a>
        <a href={`/attack${q}`} className={s.action}><span>Phone 1</span><span className={s.actionHint}>break a sensor at this site</span></a>
      </nav>
    </aside>
  );
}
