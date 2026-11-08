"use client";
// `SpacetimeDB.log` (docs/LOCKDOWN.md, "The look"): a narrow monospace column on the console during
// lockdown, one line per reducer as its rows land through the subscription (lib/rules/lockdown-log.ts).
import { useEffect, useRef, useState } from "react";
import { useAvonConsole } from "@/lib/live";
import { appendLog, logLines, logTime, type LogLine, type LogSnapshot } from "@/lib/rules/lockdown-log";
import s from "./lockdown.module.css";

export function EventLog() {
  const { faults, confirmations, lockdown } = useAvonConsole();
  const [lines, setLines] = useState<LogLine[]>([]);
  const prev = useRef<LogSnapshot | null>(null);
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const next: LogSnapshot = { faults, confirmations, lockdown };
    const add = logLines(prev.current, next, Date.now());
    prev.current = next;
    if (add.length) setLines((l) => appendLog(l, add));
  }, [faults, confirmations, lockdown]);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <section className={s.log} aria-label="SpacetimeDB log">
      <p className={s.logTitle}>SpacetimeDB.log</p>
      <ol ref={list} className={s.logList} aria-live="polite">
        {lines.map((l, i) => (
          <li key={`${i}-${l.reducer}-${l.atMs}`} className={s.logLine}>
            <span className={s.logTime}>{logTime(l.atMs)}</span>{" "}
            <span className={l.reducer.endsWith("lockdown") ? s.logHot : s.logReducer}>{l.reducer}</span>{" "}
            <span>{l.detail}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
