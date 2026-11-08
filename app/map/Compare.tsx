"use client";
// The sites side by side: one hairline row per site, sortable by any column, the selected site
// marked. Money columns carry a thin bar against the column's largest value (small multiples).
// On a phone the table fits the screen with no sideways scroll: Site, Failures and Saving, with the
// plans, the cost if unaddressed and any sensors to check folded under each site's name.
import { useMemo, useState } from "react";
import type { SiteSummary } from "@/lib/fleet";
import { COLUMNS, money, nextSort, saving, sortSites, toneOf, type Sort, type SortKey } from "./model";
import s from "./map.module.css";

const val = (x: SiteSummary, k: SortKey) => (k === "saving" ? saving(x) : k === "name" ? 0 : x[k]);

export function Compare({ sites, selected, onSelect }: { sites: SiteSummary[]; selected: string | null; onSelect(key: string): void }) {
  const [sort, setSort] = useState<Sort>({ key: "pumpFailures", dir: "desc" });
  const rows = useMemo(() => sortSites(sites, sort), [sites, sort]);
  const max = useMemo(() => {
    const m: Partial<Record<SortKey, number>> = {};
    for (const c of COLUMNS) if (c.money) m[c.key] = Math.max(1, ...sites.map((x) => val(x, c.key)));
    return m;
  }, [sites]);

  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <caption className={s.caption}>Every site tonight. Click a column to sort, a site to open it on the map.</caption>
        <thead>
          <tr>
            {COLUMNS.map((c) => {
              const on = sort.key === c.key;
              return (
                <th key={c.key} scope="col" aria-sort={on ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} data-num={c.key !== "name" || undefined} data-wide={c.wide}>
                  <button type="button" className={s.sortBtn} onClick={() => setSort(nextSort(sort, c.key))} aria-label={c.label}>
                    <span className={s.longHead}>{c.label}</span><span className={s.shortHead} aria-hidden="true">{c.short}</span>
                    <span className={s.sortMark} aria-hidden="true">{on ? (sort.dir === "asc" ? "↑" : "↓") : ""}</span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((x) => {
            const tone = toneOf(x);
            return (
              <tr key={x.key} data-on={x.key === selected || undefined} data-site={x.key}>
                <th scope="row">
                  <button type="button" className={s.rowBtn} onClick={() => onSelect(x.key)} aria-pressed={x.key === selected}>
                    <span className={s.rowDot} data-tone={tone} aria-hidden="true" />
                    <span className={s.rowName}>{x.name}</span>
                    <span className={s.rowBasin}>{x.basin}</span>
                    <span className={s.rowCost}>
                      <span>Response cost {money(x.plans)}</span>
                      <span>Cost if unaddressed {money(x.doNothing)}</span>
                      {x.sensorIssues > 0 && <span data-tone="warn">● {x.sensorIssues} sensor{x.sensorIssues === 1 ? "" : "s"} to check</span>}
                    </span>
                  </button>
                </th>
                <td data-num data-tone={x.pumpFailures ? "alert" : undefined}>{x.pumpFailures ? `▲ ${x.pumpFailures}` : "0"}</td>
                <td data-num data-wide data-tone={x.sensorIssues ? "warn" : undefined}>{x.sensorIssues ? `● ${x.sensorIssues}` : "0"}</td>
                {COLUMNS.filter((c) => c.money).map((c) => (
                  <td key={c.key} data-num data-wide={c.wide}>
                    <span className={s.cellMoney}>{money(val(x, c.key))}</span>
                    <span className={s.cellBar} data-ink={c.key === "doNothing" ? "dust" : "moon"} style={{ "--w": val(x, c.key) / (max[c.key] ?? 1) } as React.CSSProperties} aria-hidden="true" />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
