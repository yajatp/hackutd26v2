"use client";
// The Darkroom on the flat page: the security alert under the bar, and the room's console as a
// side panel while the canvas shows the room. Same words and rows as the headset (logic.ts).
import { useMemo } from "react";
import { useRoomSnapshot } from "./useRoom";
import type { RoomValue } from "../usmap/EntryContext";
import { ALERT_MOVE, ALERT_TITLE, consoleRows, DOES_NOT, ISOLATED_LINE, PROTECTS } from "./logic";
import css from "./room.module.css";

export function SecurityAlert({ line, onEnter, onDismiss }: { line: string; onEnter(): void; onDismiss(): void }) {
  return (
    <section role="alertdialog" aria-labelledby="twin-alert-title" data-testid="twin-security-alert" className={css.alert}>
      <p className={css.kicker}>Security · Field network</p>
      <h2 id="twin-alert-title" className={css.title}>{ALERT_TITLE}</h2>
      <p className={css.line}>{line}</p>
      <p className={css.sub}>{ALERT_MOVE}</p>
      <div className={css.row}>
        <button type="button" data-testid="twin-alert-enter" className={css.primary} onClick={onEnter}>Enter the Darkroom</button>
        <button type="button" data-testid="twin-alert-dismiss" className={css.ghost} onClick={onDismiss}>Not now</button>
      </div>
    </section>
  );
}

export function DarkroomPanel({ room, onMap }: { room: RoomValue; onMap(): void }) {
  const snap = useRoomSnapshot();
  const rows = useMemo(() => consoleRows(snap), [snap]);
  const { incident } = room;
  return (
    <aside data-testid="twin-darkroom" data-live={rows.live ? "1" : "0"} aria-label="Darkroom console" className={css.room}>
      <p className={css.label}>Darkroom · Isolated network · No internet connection</p>
      <p className={css.label}>Incident</p>
      <p data-testid="twin-darkroom-incident" className={css.line}>{incident.line ?? "No active attack at this site."}</p>
      {incident.ref && (
        <>
          <p className={css.label}>Evidence reference</p>
          <p data-testid="twin-darkroom-ref" className={css.ref}>{incident.ref}</p>
          <p className={css.muted}>Enter this reference on the Darkroom box.</p>
        </>
      )}
      {rows.live ? (
        <>
          <p className={css.label}>Darkroom log · live</p>
          <p data-testid="twin-darkroom-status" data-tone={rows.status.tone} className={css.status}>{rows.status.text}</p>
          <p className={css.muted}>
            {rows.incident === "open" ? "Incident open" : rows.incident === "closed" ? "Incident closed" : "No incident yet"} · {rows.count} entries
          </p>
          <p className={css.label}>Newest entries (hash chain)</p>
          <ul data-testid="twin-darkroom-entries" className={css.entries}>
            {rows.entries.length === 0 && <li><span>—</span><span>No entries yet</span><span /><span /></li>}
            {rows.entries.map((e) => <li key={e.seq}><span>{e.seq}</span><span>{e.kind}</span><span>{e.who}</span><span>{e.hash}</span></li>)}
          </ul>
          <p className={css.label}>Team</p>
          <p className={css.muted}>{rows.team.length ? rows.team.map((m) => `${m.name} · ${m.role}`).join(", ") : "No members yet."}</p>
        </>
      ) : (
        <>
          <p className={css.label}>{rows.connection === "connecting" ? "Connecting to the Darkroom" : "Darkroom not reachable from here"}</p>
          <p data-testid="twin-darkroom-isolated" className={css.line}>{ISOLATED_LINE}</p>
          <p className={css.label}>Protects against</p>
          <ul className={css.list}>{PROTECTS.map((p) => <li key={p}>{p}</li>)}</ul>
          <p className={css.label}>Does not protect against</p>
          <ul className={css.list}>{DOES_NOT.map((p) => <li key={p}>{p}</li>)}</ul>
        </>
      )}
      <div className={css.controls}>
        <button type="button" data-testid="twin-darkroom-return" className={css.primary} onClick={room.leave}>Return to the site</button>
        <button type="button" data-testid="twin-darkroom-map" className={css.ghost} onClick={onMap}>Back to map</button>
      </div>
    </aside>
  );
}
