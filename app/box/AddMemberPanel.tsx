"use client";

import { useEffect, useState } from "react";
import { darkroom, type DarkroomSnapshot } from "@/lib/darkroom-live";
import { JOIN_ROLES, formatJoinCode, hashJoinCode, makeJoinCode } from "@/lib/rules/darkroom/joincode";
import { parseActor } from "@/lib/rules/darkroom/roles";
import { Choice } from "./Choice";

type JoinRole = (typeof JOIN_ROLES)[number];
type Made = { code: string; role: JoinRole; madeAt: number; afterSeq: number; joinUrl: string };

const TTL_MS = 60_000;

// Commander only. The code is made here (crypto.getRandomValues) and shown large; only its
// SHA-256 goes to the box. The person types it with their name on /join, once, within 60 s.
export function AddMemberPanel({ s, writable }: { s: DarkroomSnapshot; writable: boolean }) {
  const [role, setRole] = useState<JoinRole>("Responder");
  const [made, setMade] = useState<Made | null>(null);
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!made) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [made]);

  async function make() {
    setBusy(true);
    setError(null);
    try {
      const code = makeJoinCode(crypto.getRandomValues(new Uint8Array(10)));
      // Taken before the call, so this countdown ends no later than the server's 60 s.
      const madeAt = Date.now();
      const afterSeq = s.events.length ? s.events[s.events.length - 1].seq : -1;
      await darkroom.createJoinCode(hashJoinCode(code), role);
      setMade({ code, role, madeAt, afterSeq, joinUrl: `${window.location.host}/join` });
      setNow(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const left = made ? Math.max(0, Math.ceil((made.madeAt + TTL_MS - now) / 1000)) : 0;
  // The member this code let in: a member_added entry after the code was made, with me as the actor.
  const joined = made
    ? s.events.find(e => {
        const p = e.payload as Record<string, unknown> | null;
        return e.seq > made.afterSeq && e.type === "member_added" && p?.how === "joined by code" && p?.role === made.role
          && parseActor(e.actor).identity === s.identity;
      })
    : undefined;
  const who = joined ? (joined.payload as Record<string, string>) : null;

  return (
    <section aria-labelledby="add-member" className="card text-sm">
      <h2 id="add-member" className="section-title">Add a member</h2>
      <p className="mt-1 text-muted">
        Make a one-use code and show it or read it out in person. It works for 60 seconds. The box keeps only its SHA-256 fingerprint, never the code.
      </p>
      <div className="mt-3 space-y-3">
        <Choice label="Their role" options={JOIN_ROLES} value={role} onChange={setRole} disabled={!writable || busy} />
        <button type="button" className="btn btn-primary" onClick={make} disabled={!writable || busy}>
          {made && left > 0 && !joined ? "Make a new code" : "Make a join code"}
        </button>
        {error && <p role="alert" className="font-semibold text-alert">▲ {error}</p>}
      </div>

      {made && !joined && left > 0 && (
        <div className="mt-4 rounded-lg border-2 border-line p-3 text-center" data-join-code>
          <p className="text-muted">Join code for a {made.role}</p>
          <p className="my-1 font-mono text-4xl font-bold tracking-wider" aria-label={`Join code ${made.code.split("").join(" ")}`}>
            {formatJoinCode(made.code)}
          </p>
          <p className="text-base font-semibold tabular-nums" aria-live="polite">Expires in {left} s</p>
          <div className="mx-auto mt-1 h-1.5 w-full overflow-hidden rounded bg-line-soft" aria-hidden="true">
            <div className="h-full bg-current transition-[width] duration-200" style={{ width: `${(left / 60) * 100}%` }} />
          </div>
          <p className="mt-2">
            On their phone, open <span className="font-mono font-semibold">{made.joinUrl}</span> and type this code and their name.
          </p>
        </div>
      )}
      {made && !joined && left === 0 && (
        <p role="status" className="mt-3">○ That code expired and nobody used it. Make a new one when they are ready.</p>
      )}
      {joined && who && (
        <p role="status" className="mt-3 text-base font-semibold">
          <span aria-hidden="true">✓ </span>{who.name} joined as {who.role} (entry #{joined.seq}).
        </p>
      )}
    </section>
  );
}
