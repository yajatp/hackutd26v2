import Link from "next/link";
import type { ReactNode } from "react";
import { LiveClock } from "./LiveClock";
import { Scramble } from "./Scramble";
import { ScreenNav, type ScreenKey } from "./ScreenNav";
import s from "./screen-header.module.css";

// One header on every Avon screen (after signal-a.studio, which keeps one fixed nav row):
//   row 1  the screen tabs (ScreenNav), on the page's margin, 20 px from the top
//   row 2  the wordmark and this screen's name in the first columns, the clock under the fifth
//          tab, the one connection badge ([role=status]) right-aligned under the sixth.
// Row 2 is a grid with the tabs' own column lines, so the clock and the badge sit under their
// tabs on every screen. In a narrow column the tabs fold to two rows of three and row 2 follows.
// The page puts it first in <main> (scripts/e2e reads `main > header`) or, on /vr, over the
// table. `as`: h1 when the name is the page's heading; p when the page has its own <h1>.
export function ScreenHeader({ current, title, search = "", clock, status, as = "h1", className = "", children }: {
  current: ScreenKey;
  title: string;
  search?: string;
  clock?: ReactNode;
  status?: ReactNode;
  as?: "h1" | "p";
  className?: string;
  children?: ReactNode;
}) {
  const Name = as;
  return (
    <header className={`${s.head} ${className}`}>
      <ScreenNav current={current} search={search} />
      <div className={s.row}>
        <Name className={s.name}>
          <Link href="/" className={s.mark}><Scramble text="Avon" /></Link>
          <span className={s.title}>{title}</span>
        </Name>
        <span className={s.clock}>{clock ?? <LiveClock />}</span>
        {status && <span className={s.status}>{status}</span>}
      </div>
      {children}
    </header>
  );
}
