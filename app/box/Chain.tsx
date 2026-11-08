"use client";

import type { CSSProperties } from "react";
import { GENESIS_PREV, type LogEvent, type Witness } from "@/lib/chain";
import type { ChainStatus } from "@/lib/rules/darkroom/status";
import { parseActor } from "@/lib/rules/darkroom/roles";
import { ENTRY_LABEL } from "@/app/ui/LogEntries";
import { crackOf, dropDelays, gapBefore, linkState, sealedAt, windowOf } from "./chain-view";
import c from "./chain.module.css";

const cls = (...xs: Array<string | false | null | undefined>) => xs.filter(Boolean).join(" ");

// The link above's hash is where this one's characters roll from: each hash is built on it.
function Hash({ hash, from, roll }: { hash: string; from: string; roll: boolean }) {
  const h = hash.slice(0, 8);
  if (!roll) return <span className={c.hash}>{h}</span>;
  return (
    <span className={c.hash}>
      {[...h].map((ch, k) => (
        <span key={k} className={c.hc} style={{ "--k": k } as CSSProperties}>
          <span className={c.hcIn} data-from={from[k] ?? "0"}>{ch}</span>
        </span>
      ))}
    </span>
  );
}

// The joint from a link up to the one above it, drawn upward (stroke-dashoffset) when it arrives.
function Connector() {
  return (
    <svg className={c.connector} viewBox="0 0 2 14" preserveAspectRatio="none" aria-hidden="true">
      <line x1="1" y1="14" x2="1" y2="0" pathLength={1} />
    </svg>
  );
}

function Fracture() {
  return (
    <svg className={c.fracture} viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <polyline points="0,15 9,10 17,17 27,7 38,15 47,9 55,18 66,8 77,14 86,6 100,12" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// The log as a hash chain, oldest at the top, newest at the bottom. Each link reads exactly as the
// old list did ("#4 member added · Box owner · 96a2d605"). A link that arrives live drops in, its
// hash rolls into place and its joint draws up to the link above. ROLLBACK DETECTED or TAMPERING
// cracks the chain where lib/rules/darkroom/status.ts says; closing the last open incident seals
// the newest link and the chain eases from moonlight to mint.
export function Chain({ events, status, witness, fresh, batch, max, compact = false }: {
  events: readonly LogEvent[];
  status: ChainStatus;
  witness: Witness | null;
  fresh: ReadonlySet<number>;
  // The seqs of the newest batch of live arrivals: only these are staggered as they drop in.
  batch: readonly number[];
  max: number;
  compact?: boolean;
}) {
  const crack = crackOf(status, events, witness);
  const sealed = sealedAt(events, status);
  const shown = windowOf(events, max, crack);
  const prevHash = new Map(events.map((e, i) => [e.seq, i > 0 ? events[i - 1].hash : GENESIS_PREV]));
  const tail = crack && crack.link === null;
  const delays = dropDelays(batch, shown.map(e => e.seq));

  return (
    <section
      aria-labelledby="log-entries"
      className={cls("card text-sm", c.chain, compact && c.compact)}
      data-chain={crack ? crack.kind : sealed !== null ? "sealed" : "verified"}
    >
      <h2 id="log-entries" className="section-title">Newest log entries</h2>
      <ol className={cls("font-mono", c.links)}>
        {shown.length === 0 && !tail && <li className="font-sans text-muted">None yet.</li>}
        {shown.map((e, i) => {
          const state = linkState(e.seq, crack);
          const isFresh = fresh.has(e.seq);
          const style = isFresh ? ({ "--d": `${delays.get(e.seq) ?? 0}ms` } as CSSProperties) : undefined;
          return (
            <li
              key={e.seq}
              data-seq={e.seq}
              data-link={state}
              className={cls(c.link, isFresh && c.fresh, state === "cracked" && c.cracked, state === "below" && c.below, sealed === e.seq && c.sealed)}
              style={style}
            >
              {i > 0 && <Connector />}
              <span className={c.seq}>#{e.seq}</span>{" "}
              <span className={c.what}>
                {ENTRY_LABEL[e.type] ?? e.type} · {parseActor(e.actor).name} · <Hash hash={e.hash} from={prevHash.get(e.seq) ?? GENESIS_PREV} roll={isFresh} />
              </span>
              {state === "cracked" && <Fracture />}
              {sealed === e.seq && <span className={c.seal} aria-hidden="true">✓</span>}
            </li>
          );
        })}
        {/* Past the newest link: what this device saw that the box no longer has, or a bare break. */}
        {tail && crack.ghosts.length === 0 && (
          <li className={c.rupture} aria-hidden="true">
            {shown.length > 0 && <Connector />}
            <Fracture />
          </li>
        )}
        {tail && crack.ghosts.map((seq, i) => (
          <li
            key={`ghost-${seq}`}
            aria-hidden="true"
            data-link={i === 0 ? "cracked" : "below"}
            className={cls(c.link, c.ghost, i === 0 ? c.cracked : c.below, gapBefore(crack.ghosts, i) && c.skip)}
          >
            {(shown.length > 0 || i > 0) && !gapBefore(crack.ghosts, i) && <Connector />}
            <span className={c.seq}>#{seq}</span>
            {witness && seq === witness.seq && (
              <span className={c.what}> · <span className={c.hash}>{witness.head.slice(0, 8)}</span></span>
            )}
            {i === 0 && <Fracture />}
          </li>
        ))}
      </ol>
    </section>
  );
}
