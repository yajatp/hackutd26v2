import type { ReactNode } from "react";

// One status language for Avon and the Darkroom. Every badge is a word, most with an icon,
// so no status depends on color alone. Styles live in app/globals.css (.badge-*).

export type Tone = "ok" | "warn" | "alert" | "solid" | "sim";

export function Badge({ tone = "ok", icon, children, className = "" }: { tone?: Tone; icon?: string; children: ReactNode; className?: string }) {
  return (
    <span className={`badge badge-${tone} ${className}`}>
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

// Every injected fault carries this badge, on the remote and on the console.
export function SimulatedBadge() {
  return <Badge tone="sim">SIMULATED</Badge>;
}

// ▲ critical, ● warning: the same icons on /attack and /console.
export const SENSOR_STATE: Record<string, { word: string; icon: string; tone: Tone }> = {
  dead: { word: "DEAD", icon: "▲", tone: "alert" },
  lying: { word: "LYING", icon: "▲", tone: "alert" },
  drifting: { word: "DRIFTING", icon: "●", tone: "warn" },
};

export function SensorBadge({ state }: { state: string }) {
  const s = SENSOR_STATE[state];
  if (!s) return <Badge>{state.toUpperCase()}</Badge>;
  return <Badge tone={s.tone} icon={s.icon}>{s.word}</Badge>;
}

// Connection to the live data. Avon says connected/disconnected, the Darkroom live/offline.
export type ConnState = "live" | "connecting" | "offline";

export function connState(c: string): ConnState {
  if (c === "connected" || c === "live") return "live";
  if (c === "connecting") return "connecting";
  return "offline";
}

// Round trip to the database, as "1.4" below 10 ms and "12" above.
export function formatMs(ms: number): string {
  return ms < 10 ? ms.toFixed(1) : String(Math.round(ms));
}

// ms: the live probe (lib/rules/darkroom/rtt.ts), median of the last 5 pings; null until measured.
export function ConnBadge({ state, ms = null }: { state: ConnState; ms?: number | null }) {
  if (state === "live") {
    return (
      <span role="status" title="Round trip to the live database: a ping every 5 s, median of the last 5">
        <Badge icon="■" className="tabular-nums">{ms === null ? "LIVE" : `LIVE · ${formatMs(ms)} ms`}</Badge>
      </span>
    );
  }
  if (state === "connecting") return <span role="status"><Badge tone="warn" icon="●">Connecting...</Badge></span>;
  return <span role="status"><Badge tone="solid" icon="▲">DISCONNECTED</Badge></span>;
}
