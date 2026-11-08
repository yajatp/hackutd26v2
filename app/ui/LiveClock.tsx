"use client";
// The time where the wells are and the time of the data, side by side in small mono (after the
// live clocks on signal-a.studio): "Midland 03:57 · data 15:30 UTC". Midland's time comes from
// the time zone, not the machine's setting, so it is right on any laptop. It ticks on the minute.
import { useEffect, useState } from "react";

export const MIDLAND = { place: "Midland", timeZone: "America/Chicago" } as const;

export function clockText(nowMs: number, dataUnix: number | null, where: { place: string; timeZone: string } = MIDLAND): string {
  const here = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: where.timeZone }).format(nowMs);
  const data = dataUnix === null ? null : new Date(dataUnix * 1000).toISOString().slice(11, 16);
  return data === null ? `${where.place} ${here}` : `${where.place} ${here} · data ${data} UTC`;
}

// Now, updated at the turn of every minute.
export function useMinute(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let every: ReturnType<typeof setInterval> | undefined;
    const first = setTimeout(() => {
      setNow(Date.now());
      every = setInterval(() => setNow(Date.now()), 60_000);
    }, 60_000 - (Date.now() % 60_000) + 50);
    return () => { clearTimeout(first); clearInterval(every); };
  }, []);
  return now;
}

export function LiveClock({ dataUnix = null, className = "" }: { dataUnix?: number | null; className?: string }) {
  const now = useMinute();
  return (
    <span
      className={`whitespace-nowrap font-mono text-[0.75rem] leading-5 tracking-[0.02em] tabular-nums ${className}`}
      title="Local time in Midland, Texas, and the time of the newest reading"
      suppressHydrationWarning
    >
      {clockText(now, dataUnix)}
    </span>
  );
}
