"use client";

// The incident report, drawn from one snapshot of the live Darkroom log. Pure: the screen
// (ReportScreen) hands it what useDarkroom() returns, and tests render it directly.
// Words we use: tamper-evident, isolated local network, integrity, not authenticity.

import Link from "next/link";
import type { ReactNode } from "react";
import type { LogEvent } from "../../lib/chain";
import { replayClosure, replayEvidence, replayIncidents, replayScope } from "../../lib/rules/darkroom/replay";
import type { ChainStatus } from "../../lib/rules/darkroom/status";
import { actorAt, brokenWhy, isBroken, pickIncident, teamFromLog, timelineFor, verifyCommand } from "./model";

// The part of DarkroomSnapshot (lib/darkroom-live.ts) the report reads.
export interface ReportInput {
  ready: boolean;
  connection: "connecting" | "live" | "offline";
  error: string | null;
  events: LogEvent[];
  status: ChainStatus;
}

function when(ts: string): string {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString([], {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  });
}

function who(name: string, role: string): string {
  return role ? `${name} (${role})` : name;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="card report-section">
      <h2 id={id} className="section-title">{title}</h2>
      {children}
    </section>
  );
}

function Th({ children }: { children: ReactNode }) {
  return <th className="py-2 pr-3 align-bottom font-medium">{children}</th>;
}

function Td({ children, className = "", colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`py-2 pr-3 align-top ${className}`}>{children}</td>;
}

// Red, first on the page, in words. Every non-verified status takes this path.
function BrokenBanner({ st }: { st: Extract<ChainStatus, { kind: "rollback" | "tampering" }> }) {
  return (
    <div role="alert" data-chain-status={st.kind} className="report-alert rounded-lg border-4 border-alert-solid bg-alert-solid p-4 text-white">
      <p className="text-3xl font-bold tracking-wide"><span aria-hidden="true">▲ </span>{st.text}</p>
      <p className="mt-2 text-lg">{brokenWhy(st)}</p>
      <p className="mt-1">Do not hand this report out as the record. Check the box with the command under &ldquo;How to check this record yourself&rdquo;.</p>
    </div>
  );
}

function Toolbar({ others }: { others: string[] }) {
  return (
    <nav aria-label="Report actions" className="report-no-print flex flex-wrap items-center gap-2 text-sm print:hidden">
      <button type="button" className="report-no-print btn btn-primary print:hidden" onClick={() => window.print()}>Print / Save as PDF</button>
      <Link href="/box" className="report-no-print btn print:hidden">Back to the incident room</Link>
      {others.length > 0 && (
        <span className="text-muted">
          Other incidents:{" "}
          {others.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <Link className="underline" href={`/report?incident=${id}`}>{id}</Link>
            </span>
          ))}
        </span>
      )}
    </nav>
  );
}

function ChainSection({ s, newest }: { s: ReportInput; newest: LogEvent | undefined }) {
  const st = s.status;
  return (
    <Section id="chain" title="The record">
      {st.kind === "verified" ? (
        <p className="mt-2 flex flex-wrap items-center gap-2">
          <span className="badge text-base" data-chain-status="verified"><span aria-hidden="true">✓</span>{st.text}</span>
          <span className="text-sm text-muted">The chain is whole and nothing this device saw before is missing or changed.</span>
        </p>
      ) : isBroken(st) ? (
        <p className="mt-2 text-xl font-bold text-alert"><span aria-hidden="true">▲ </span>{st.text}</p>
      ) : (
        <p className="mt-2 text-xl font-bold"><span aria-hidden="true">○ </span>{st.text}</p>
      )}
      {newest && (
        <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="text-muted">{isBroken(st) ? "On the box now" : "Entries"}</dt>
          <dd>{s.events.length} entries (#{s.events[0].seq} to #{newest.seq}), for every incident and team change on this box</dd>
          <dt className="text-muted">Head fingerprint</dt>
          <dd>
            <span className="text-muted">hash of entry #{newest.seq}, written {when(newest.ts)}</span>
            <code className="block break-all font-mono text-sm">{newest.hash}</code>
          </dd>
        </dl>
      )}
      <p className="mt-2 text-xs text-muted">Times are shown in this device&apos;s time zone; the log stores them in UTC.</p>
    </Section>
  );
}

export function ReportView({ s, requested, host, db }: { s: ReportInput; requested: string; host: string; db: string }) {
  if (!s.ready) {
    return (
      <main className="report-root mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <div role="status" className="card text-muted">
          {s.connection === "offline" && s.error ? s.error : "Loading the record from the box…"}
        </div>
      </main>
    );
  }

  const st = s.status;
  const broken = isBroken(st) ? st : null;
  const incidents = replayIncidents(s.events);
  const { incident, notFound } = pickIncident(incidents, requested);
  const others = incidents.filter(i => i.id !== incident?.id).map(i => i.id);
  const newest = s.events[s.events.length - 1];
  const scope = incident ? replayScope(s.events, incident.id) : [];
  const evidence = incident ? replayEvidence(s.events, incident.id) : [];
  const closure = incident ? replayClosure(s.events, incident.id) : null;
  const timeline = incident ? timelineFor(s.events, incident.id) : [];
  const team = teamFromLog(s.events);
  const opener = incident ? actorAt(s.events, incident.seq) : null;
  const closer = closure ? actorAt(s.events, closure.seq) : null;

  return (
    <main className="report-root mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      {broken && <BrokenBanner st={broken} />}

      <Toolbar others={others} />

      {s.connection !== "live" && (
        <p role="status" className="rounded-lg border-2 border-warn-line bg-warn-bg p-3 text-sm">
          Not connected to the box right now. This report shows the record as this screen last saw it.
        </p>
      )}

      <header className="card report-section">
        <p className="section-title">Darkroom incident report</p>
        {incident ? (
          <>
            <h1 className="mt-1 text-2xl font-bold leading-tight">{incident.id} · {incident.title}</h1>
            <p className="mt-1 text-sm">
              Opened by {who(opener?.name || incident.openedBy, opener?.role ?? "")} on {when(incident.openedAt)} (entry #{incident.seq}).
            </p>
            {closure ? (
              <p className="mt-2">
                <span className="badge"><span aria-hidden="true">✓</span>CLOSED</span>{" "}
                Closed by {who(closer?.name || closure.by, closer?.role ?? "")} on {when(closure.ts)} (entry #{closure.seq}). Resolution:{" "}
                <strong>{closure.resolution}</strong>
              </p>
            ) : (
              <p className="mt-2"><span className="badge badge-alert"><span aria-hidden="true">●</span>OPEN</span> Not closed yet.</p>
            )}
          </>
        ) : notFound ? (
          <>
            <h1 className="mt-1 text-2xl font-bold">{requested.trim().toUpperCase()} was not found in this log.</h1>
            {incidents.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {incidents.map(i => (
                  <li key={i.id}><Link className="underline" href={`/report?incident=${i.id}`}>{i.id} · {i.title}</Link></li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-sm text-muted">No incident has been opened on this box yet.</p>
            )}
          </>
        ) : (
          <h1 className="mt-1 text-2xl font-bold">No incident has been opened on this box yet.</h1>
        )}
      </header>

      <ChainSection s={s} newest={newest} />

      {incident && (
        <>
          <Section id="evidence" title="Evidence">
            <p className="mt-1 text-sm text-muted">References a person carried from the Avon console and typed in; the log records who brought each one and when.</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-muted">
                  <tr><Th>Reference</Th><Th>Fingerprint</Th><Th>Source</Th><Th>Logged by</Th><Th>When</Th><Th>Entry</Th></tr>
                </thead>
                <tbody>
                  {evidence.length === 0 && <tr><Td colSpan={6} className="text-muted">No evidence logged.</Td></tr>}
                  {evidence.map(ev => (
                    <tr key={ev.seq} className="border-b border-line-soft">
                      <Td className="font-mono font-bold">
                        {ev.ref}
                        {ev.note && <span className="block font-sans font-normal">{ev.note}</span>}
                      </Td>
                      <Td className="break-all font-mono text-xs">{ev.fingerprint || <span className="font-sans text-sm text-muted">reference only</span>}</Td>
                      <Td>{ev.source}</Td>
                      <Td>{who(ev.collector, ev.role)}</Td>
                      <Td>{when(ev.ts)}</Td>
                      <Td>#{ev.seq}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="scope" title="Scope board">
            <p className="mt-1 text-sm text-muted">Which systems and data are affected, as the board stands. The newest entry for a row wins.</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-muted">
                  <tr><Th>System or data</Th><Th>What happened</Th><Th>How sure</Th><Th>Note</Th><Th>Last change</Th></tr>
                </thead>
                <tbody>
                  {scope.length === 0 && <tr><Td colSpan={5} className="text-muted">Nothing in scope.</Td></tr>}
                  {scope.map(r => (
                    <tr key={r.key} className="border-b border-line-soft">
                      <Td className="font-medium">{r.system}</Td>
                      <Td className="font-bold">{r.state}</Td>
                      <Td className={r.certainty === "CONFIRMED" ? "font-semibold" : ""}>{r.certainty}</Td>
                      <Td>{r.note}</Td>
                      <Td>#{r.seq} by {r.by}, {when(r.ts)}{r.updates > 1 ? ` (${r.updates} changes)` : ""}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="timeline" title="Timeline">
            <p className="mt-1 text-sm text-muted">Every entry for {incident.id}, in the order the log holds them.</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line text-muted">
                  <tr><Th>Entry</Th><Th>When</Th><Th>Who</Th><Th>What</Th></tr>
                </thead>
                <tbody>
                  {timeline.map(e => (
                    <tr key={e.seq} className="border-b border-line-soft">
                      <Td className="font-mono">#{e.seq}</Td>
                      <Td className="whitespace-nowrap">{when(e.ts)}</Td>
                      <Td>{who(e.name, e.role)}</Td>
                      <Td className="whitespace-pre-wrap break-words">{e.what}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      <Section id="team" title="Team">
        <p className="mt-1 text-sm text-muted">Members and roles as the log records them. The server stamps who wrote each entry from this list.</p>
        <ul className="mt-2 space-y-1 text-sm">
          {team.length === 0 && <li className="text-muted">No members in the log.</li>}
          {team.map(m => (
            <li key={m.identity}>
              <strong>{m.name}</strong> ({m.role}) <span className="text-muted">· identity <span className="font-mono">{m.identity.slice(0, 8)}…</span> · added in entry #{m.seq}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="check" title="How to check this record yourself">
        <p className="mt-1 text-sm">
          Run the verifier on any laptop on the isolated local network. It is one file (scripts/verify-standalone.mjs in the project) and needs only Node 18 or newer.
          It reads the log from this box, rebuilds the chain and prints one status line, in the same words as the top of this report.
        </p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-line-soft bg-surface-2 p-2 font-mono text-sm">{verifyCommand(host || "<box address>", db)}</pre>
        <p className="mt-2 text-sm">
          Add <code className="font-mono">--witness witness.json</code> to keep a witness file: it remembers the newest entry the check saw, so a later run also catches
          entries deleted from the end, which the chain alone cannot show.
        </p>
        {newest && <p className="mt-1 text-sm text-muted">Its head should end at entry #{newest.seq}, fingerprint {newest.hash.slice(0, 8)}…, unless entries were added after this report.</p>}
      </Section>

      <section aria-labelledby="limits" className="report-section rounded-lg border-2 border-line p-4 text-sm leading-relaxed">
        <h2 id="limits" className="section-title">What this report can and cannot show</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
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

      <footer className="text-xs text-muted">
        Built from the live Darkroom log on {host || "this box"}, database {db}{newest ? `, through entry #${newest.seq}` : ""}. Nothing on this page comes from a stored status.
      </footer>
    </main>
  );
}
