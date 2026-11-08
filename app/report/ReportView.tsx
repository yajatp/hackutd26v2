"use client";

// The incident report, drawn from one snapshot of the live Darkroom log. Pure: the screen
// (ReportScreen) hands it what useDarkroom() returns, and tests render it directly.
// Words we use: tamper-evident, isolated local network, integrity, not authenticity.
//
// Page 1 on paper is the cover: title, chain status, head fingerprint, who was in the room, and
// when it opened and closed. Then the log drawn as a chain, the evidence, the scope board, how to
// check the record yourself, and its limits. report.css holds the screen and the print design.

import Link from "next/link";
import type { ReactNode } from "react";
import type { LogEvent } from "../../lib/chain";
import { replayClosure, replayEvidence, replayIncidents, replayScope } from "../../lib/rules/darkroom/replay";
import { parseActor } from "../../lib/rules/darkroom/roles";
import type { ChainStatus } from "../../lib/rules/darkroom/status";
import { actorAt, brokenWhy, describeEntry, isBroken, pickIncident, teamFromLog, verifyCommand } from "./model";

// The part of DarkroomSnapshot (lib/darkroom-live.ts) the report reads.
export interface ReportInput {
  ready: boolean;
  connection: "connecting" | "live" | "offline";
  error: string | null;
  events: LogEvent[];
  status: ChainStatus;
}

type Broken = Extract<ChainStatus, { kind: "rollback" | "tampering" }>;

function when(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString([], {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  });
}

function day(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function clock(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function who(name: string, role: string): string {
  return role ? `${name} (${role})` : name;
}

function hex8(hash: string): string {
  return hash.slice(0, 8);
}

function Section({ id, title, lead, children }: { id: string; title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="r-section">
      <div className="r-section-head">
        <h2 id={id} className="r-h2">{title}</h2>
        {lead && <p className="r-lead">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

// The status, worded exactly as the box screen says it. When the chain is broken this is the red
// alert, first in the page's markup; report.css places the title above it on the cover.
function CoverStatus({ st }: { st: ChainStatus }) {
  if (isBroken(st)) {
    return (
      <div role="alert" data-chain-status={st.kind} className="report-alert r-status r-status-broken">
        <p className="r-status-word"><span aria-hidden="true">▲ </span>{st.text}</p>
        <p className="r-status-why">{brokenWhy(st)}</p>
        <p className="r-status-why">Do not hand this report out as the record. Check the box with the command under &ldquo;How to check this record yourself&rdquo;.</p>
      </div>
    );
  }
  return (
    <div data-chain-status={st.kind} className="r-status">
      <p className="r-status-word">
        <span aria-hidden="true">{st.kind === "verified" ? "✓ " : "○ "}</span>{st.text}
      </p>
      {st.kind === "verified" && (
        <p className="r-status-why">The chain is whole and nothing this device saw before is missing or changed.</p>
      )}
    </div>
  );
}

function Toolbar({ others }: { others: string[] }) {
  return (
    <nav aria-label="Report actions" className="report-no-print r-tools">
      <button type="button" className="r-btn r-btn-primary" onClick={() => window.print()}>Print / Save as PDF</button>
      <Link href="/box" className="r-btn">Back to the incident room</Link>
      {others.length > 0 && (
        <span className="r-muted">
          Other incidents:{" "}
          {others.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <Link className="r-link" href={`/report?incident=${id}`}>{id}</Link>
            </span>
          ))}
        </span>
      )}
    </nav>
  );
}

// Where the break goes in the drawn chain: on the entry itself when it is still there, or as a
// marker where the missing entries would start.
function breakPlacement(st: ChainStatus, events: readonly LogEvent[]): { onSeq: number | null; markerBefore: number | null } {
  if (!isBroken(st)) return { onSeq: null, markerBefore: null };
  const present = events.some(e => e.seq === st.at);
  if (st.kind === "tampering" && present) return { onSeq: st.at, markerBefore: null };
  const idx = events.findIndex(e => e.seq >= st.at);
  return { onSeq: null, markerBefore: idx < 0 ? events.length : idx };
}

function BreakMarker({ st }: { st: Broken }) {
  return (
    <li className="r-entry r-entry-broken r-marker" data-break={st.at}>
      <span className="r-rail" aria-hidden="true"><span className="r-node">▲</span></span>
      <div className="r-entry-body">
        <p className="r-break-word"><span aria-hidden="true">▲ </span>{st.text}</p>
        <p className="r-payload">
          {st.kind === "rollback"
            ? `Entry #${st.at} and every entry after it were here when this device last looked, and are gone now.`
            : brokenWhy(st)}
        </p>
      </div>
    </li>
  );
}

function ChainEntry({ e, incidentId, isLast, broken, showDay }: {
  e: LogEvent; incidentId: string | null; isLast: boolean; broken: Broken | null; showDay: boolean;
}) {
  const a = parseActor(e.actor);
  // Team changes belong to every report; another incident's entries keep their place in the chain
  // (their fingerprints are what link it) but not their words.
  const shown = !e.incident_id || e.incident_id === incidentId;
  const what = shown ? describeEntry(e) : `entry for ${e.incident_id}, left out of this report`;
  const genesis = /^0+$/.test(e.prev_hash);
  return (
    <li className={`r-entry${broken ? " r-entry-broken" : ""}${shown ? "" : " r-entry-other"}`} data-seq={e.seq} data-break={broken ? broken.at : undefined}>
      <span className="r-rail" aria-hidden="true"><span className="r-node">{broken ? "▲" : ""}</span></span>
      <div className="r-entry-body">
        {broken && <p className="r-break-word"><span aria-hidden="true">▲ </span>{broken.text}: this entry no longer matches its fingerprint.</p>}
        <p className="r-entry-head">
          <span className="r-seq">#{e.seq}</span>
          <span>{showDay ? `${day(e.ts)}, ` : ""}{clock(e.ts)}</span>
          <span>{who(a.name, a.role)}</span>
          <span className="r-type">{e.type}</span>
        </p>
        <p className="r-payload" title={what}>{what}</p>
      </div>
      <div className="r-hashes">
        <p className="r-hash-prev">
          <span className="r-hash-label">prev</span> <code className="r-mono">{hex8(e.prev_hash)}</code>
          {genesis && <span className="r-hash-note"> start of the log</span>}
        </p>
        <p className="r-hash-this">
          <span className="r-hash-label">hash</span> <code className="r-mono">{hex8(e.hash)}</code>
        </p>
        {!isLast && <span className="r-chainlink" aria-hidden="true" />}
      </div>
    </li>
  );
}

function ChainSection({ s, incidentId }: { s: ReportInput; incidentId: string | null }) {
  const st = s.status;
  const broken = isBroken(st) ? st : null;
  const events = [...s.events].sort((x, y) => x.seq - y.seq);
  const { onSeq, markerBefore } = breakPlacement(st, events);
  const items: ReactNode[] = [];
  events.forEach((e, i) => {
    if (broken && markerBefore === i) items.push(<BreakMarker key="break" st={broken} />);
    const showDay = i === 0 || day(events[i - 1].ts) !== day(e.ts);
    items.push(
      <ChainEntry key={e.seq} e={e} incidentId={incidentId} isLast={i === events.length - 1}
        broken={broken && onSeq === e.seq ? broken : null} showDay={showDay} />,
    );
  });
  if (broken && markerBefore === events.length) items.push(<BreakMarker key="break" st={broken} />);

  return (
    <Section
      id="chain"
      title="The log, entry by entry"
      lead={<>Every entry on this box, oldest first. Each entry stores the fingerprint of the one above it (prev), and the line joins the two: if any entry were changed or removed, the next one would stop matching.</>}
    >
      {events.length === 0 ? <p className="r-muted">No entries yet.</p> : <ol className="r-chain">{items}</ol>}
      <p className="r-fine">Fingerprints show their first 8 characters; the full head fingerprint is on page 1. Times are in this device&apos;s time zone; the log stores them in UTC.</p>
    </Section>
  );
}

function EvidenceSection({ evidence }: { evidence: ReturnType<typeof replayEvidence> }) {
  return (
    <Section id="evidence" title="Evidence" lead="References a person carried from the Avon console and typed in. The log records who brought each one and when.">
      {evidence.length === 0 ? (
        <p className="r-muted">No evidence logged.</p>
      ) : (
        <ul className="r-rows">
          {evidence.map(ev => (
            <li key={ev.seq} className="r-row r-evidence">
              <p className="r-ref r-mono">{ev.ref}</p>
              <p>Brought by <strong>{who(ev.collector, ev.role)}</strong> from {ev.source}, {when(ev.ts)}, entry #{ev.seq}.</p>
              {ev.note && <p>{ev.note}</p>}
              <p className="r-fp">
                {ev.fingerprint
                  ? <><span className="r-muted">Fingerprint </span><code className="r-mono">{ev.fingerprint}</code></>
                  : <span className="r-muted">reference only, no fingerprint</span>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function ScopeSection({ scope }: { scope: ReturnType<typeof replayScope> }) {
  return (
    <Section id="scope" title="Scope board" lead="Which systems and data are affected, as the board stands. The newest entry for a row wins.">
      {scope.length === 0 ? (
        <p className="r-muted">Nothing in scope.</p>
      ) : (
        <table className="r-table">
          <thead>
            <tr><th>System or data</th><th>What happened</th><th>How sure</th><th>Note</th><th>Last change</th></tr>
          </thead>
          <tbody>
            {scope.map(r => (
              <tr key={r.key}>
                <td className="r-strong">{r.system}</td>
                <td className="r-strong">{r.state}</td>
                <td className={r.certainty === "CONFIRMED" ? "r-strong" : ""}>{r.certainty}</td>
                <td>{r.note}</td>
                <td>#{r.seq} by {r.by}, {when(r.ts)}{r.updates > 1 ? ` (${r.updates} changes)` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Section>
  );
}

export function ReportView({ s, requested, host, db }: { s: ReportInput; requested: string; host: string; db: string }) {
  if (!s.ready) {
    return (
      <main className="report-root r-page">
        <p role="status" className="r-muted">
          {s.connection === "offline" && s.error ? s.error : "Loading the record from the box…"}
        </p>
      </main>
    );
  }

  const st = s.status;
  const incidents = replayIncidents(s.events);
  const { incident, notFound } = pickIncident(incidents, requested);
  const others = incidents.filter(i => i.id !== incident?.id).map(i => i.id);
  const newest = s.events.reduce<LogEvent | undefined>((m, e) => (!m || e.seq > m.seq ? e : m), undefined);
  const oldest = s.events.reduce<LogEvent | undefined>((m, e) => (!m || e.seq < m.seq ? e : m), undefined);
  const scope = incident ? replayScope(s.events, incident.id) : [];
  const evidence = incident ? replayEvidence(s.events, incident.id) : [];
  const closure = incident ? replayClosure(s.events, incident.id) : null;
  const team = teamFromLog(s.events);
  const opener = incident ? actorAt(s.events, incident.seq) : null;
  const closer = closure ? actorAt(s.events, closure.seq) : null;
  const command = verifyCommand(host || "<box address>", db);

  return (
    <main className="report-root r-page">
      <section aria-label="Summary" className="r-cover">
        <CoverStatus st={st} />

        <div className="r-cover-title">
          {incident ? (
            <>
              <p className="r-kicker">Darkroom incident record <span className="r-mono">{incident.id}</span></p>
              <h1 className="r-h1">{incident.title}</h1>
            </>
          ) : notFound ? (
            <>
              <h1 className="r-h1">{requested.trim().toUpperCase()} was not found in this log.</h1>
              {incidents.length > 0 ? (
                <ul className="r-list">
                  {incidents.map(i => (
                    <li key={i.id}><Link className="r-link" href={`/report?incident=${i.id}`}>{i.id}, {i.title}</Link></li>
                  ))}
                </ul>
              ) : (
                <p className="r-muted">No incident has been opened on this box yet.</p>
              )}
            </>
          ) : (
            <h1 className="r-h1">No incident has been opened on this box yet.</h1>
          )}
        </div>

        <Toolbar others={others} />

        {s.connection !== "live" && (
          <p role="status" className="r-notice">
            Not connected to the box right now. This report shows the record as this screen last saw it.
          </p>
        )}

        {newest && oldest && (
          <div className="r-cover-head">
            <p className="r-label">Head fingerprint, the hash of entry #{newest.seq}</p>
            <p className="r-head8 r-mono" aria-label={`first 8 characters ${newest.hash.slice(0, 8).split("").join(" ")}`}>{hex8(newest.hash)}</p>
            <p className="r-muted">
              The box screen shows the same first 8 characters. {s.events.length} entries (#{oldest.seq} to #{newest.seq}),
              for every incident and team change on this box; the newest was written {when(newest.ts)}.
            </p>
            <p className="r-head64 r-mono">{newest.hash}</p>
          </div>
        )}

        <div className="r-cover-room">
          <p className="r-label">Who was in the room</p>
          {team.length === 0 ? (
            <p className="r-muted">No members in the log.</p>
          ) : (
            <ul className="r-room">
              {team.map(m => (
                <li key={m.identity}>
                  <strong>{who(m.name, m.role)}</strong>{" "}
                  <span className="r-muted">identity <code className="r-mono">{m.identity.slice(0, 8)}</code>, added in entry #{m.seq}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="r-fine">The server stamps who wrote each entry from this list.</p>
        </div>

        {incident && (
          <dl className="r-cover-times">
            <div>
              <dt className="r-label">Opened</dt>
              <dd>
                <span className="r-time">{when(incident.openedAt)}</span>
                <span className="r-muted"> Opened by {who(opener?.name || incident.openedBy, opener?.role ?? "")} (entry #{incident.seq}).</span>
              </dd>
            </div>
            <div>
              <dt className="r-label">{closure ? "Closed" : "Now"}</dt>
              <dd>
                {closure ? (
                  <>
                    <span className="r-time">{when(closure.ts)}</span>
                    <span className="r-muted"> <span className="r-word">CLOSED</span>. Closed by {who(closer?.name || closure.by, closer?.role ?? "")} (entry #{closure.seq}).</span>
                    <span className="r-resolution">Resolution: <strong>{closure.resolution}</strong></span>
                  </>
                ) : (
                  <span className="r-time"><span className="r-word">OPEN</span>, not closed yet</span>
                )}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <ChainSection s={s} incidentId={incident?.id ?? null} />

      {incident && (
        <>
          <EvidenceSection evidence={evidence} />
          <ScopeSection scope={scope} />
        </>
      )}

      <Section
        id="check"
        title="How to check this record yourself"
        lead="Run the verifier on any laptop on the isolated local network. It is one file (scripts/verify-standalone.mjs in the project) and needs only Node 18 or newer. It reads the log from this box, rebuilds the chain and prints one status line, in the same words as page 1."
      >
        <ol className="r-steps">
          <li>
            <p>Check the chain once:</p>
            <pre className="r-cmd r-mono">{command}</pre>
          </li>
          <li>
            <p>Keep a witness file, and run the same line again later. The file remembers the newest entry the check saw, so a later run also catches entries deleted from the end, which the chain alone cannot show.</p>
            <pre className="r-cmd r-mono">{command} --witness witness.json</pre>
          </li>
        </ol>
        {newest && (
          <p className="r-muted">Its head should end at entry #{newest.seq}, fingerprint <code className="r-mono">{hex8(newest.hash)}</code>, unless entries were added after this report.</p>
        )}
      </Section>

      <section aria-labelledby="limits" className="r-section r-limits">
        <h2 id="limits" className="r-h2">What this report can and cannot show</h2>
        <ul className="r-list">
          <li>
            The log is tamper-evident: each entry carries the fingerprint of the one before it, so an entry changed or removed after it was written shows up as a break,
            here and on every device that saw it. It does not stop root on the box from trying.
          </li>
          <li>
            The log proves integrity, not authenticity: the record shows nothing was changed after it was written. It does not prove the original sensor reading was true.
          </li>
          <li>A compromised phone can still write as its member, and someone with physical control of the box can change what its screen shows live.</li>
        </ul>
      </section>

      <footer className="r-fine r-footer">
        Built from the live Darkroom log on {host || "this box"}, database {db}{newest ? `, through entry #${newest.seq}` : ""}. Nothing on this page comes from a stored status.
      </footer>
    </main>
  );
}
