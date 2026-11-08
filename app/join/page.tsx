"use client";

// Join the Darkroom team with a one-use code from a Commander (Add a member on /box).
// Phone-first: one column, big inputs. The server checks the code (spacetimedb-darkroom
// join_with_code) and logs the new member; this page only sends the code and the name.

import { useState, type FormEvent } from "react";
import { darkroom, useDarkroom } from "@/lib/darkroom-live";
import { LIMITS } from "@/lib/rules/darkroom/entries";
import { normalizeJoinCode } from "@/lib/rules/darkroom/joincode";
import { roleAbilities } from "@/lib/rules/darkroom/roles";
import { AppHeader } from "@/app/ui/AppHeader";
import { ConnectionChip } from "@/app/box/StatusBanner";

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function JoinPage() {
  const s = useDarkroom();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);
  const live = s.connection === "live" && s.ready;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const typed = normalizeJoinCode(code);
    if (!typed) {
      setError("A join code is 10 letters and digits, like ABCDE-FGHJK.");
      return;
    }
    setBusy(true);
    try {
      await darkroom.joinWithCode(typed, name);
      setJoined(true);
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const me = s.me;
  const abilities = me ? roleAbilities(me.role) : null;

  return (
    <main className="mx-auto min-h-dvh max-w-sm space-y-4 p-4 lg:max-w-none lg:px-10">
      <AppHeader product="Darkroom" title="join the team">
        <ConnectionChip s={s} />
      </AppHeader>

      {me && abilities ? (
        <section aria-labelledby="joined" className="card space-y-3" data-joined>
          <h2 id="joined" className="text-2xl font-bold">
            <span aria-hidden="true">✓ </span>{joined ? "You joined the team" : "This device is on the team"}
          </h2>
          <p className="text-lg">
            {me.name} · <span className="font-semibold">{me.role}</span>
          </p>
          <div>
            <h3 className="font-semibold">As a {me.role} you can</h3>
            <ul className="mt-1 space-y-1">
              {abilities.can.map(x => <li key={x}><span aria-hidden="true">✓ </span>{sentence(x)}</li>)}
            </ul>
          </div>
          {abilities.cannot.length > 0 && (
            <div>
              <h3 className="font-semibold">You cannot</h3>
              <ul className="mt-1 space-y-1 text-muted">
                {abilities.cannot.map(x => <li key={x}><span aria-hidden="true">– </span>{sentence(x)}</li>)}
              </ul>
            </div>
          )}
          <p className="text-sm text-muted">Everything you write becomes an entry in the tamper-evident log, with your name and the time.</p>
          <a className="btn btn-primary w-full justify-center text-lg lg:w-auto" href="/box">Open the incident room</a>
        </section>
      ) : joined ? (
        <p role="status" className="card text-lg">Joined. Waiting for the box to confirm…</p>
      ) : (
        <form onSubmit={submit} className="card space-y-4 lg:grid lg:grid-cols-[1fr_1fr_auto] lg:items-end lg:gap-4 lg:space-y-0">
          <p className="lg:col-span-full">Ask a Commander on the box for a join code. It works once, for 60 seconds.</p>
          <label className="block">
            <span className="block font-semibold">Join code</span>
            <input
              className="field mt-1 w-full font-mono text-2xl uppercase tracking-widest lg:h-12"
              placeholder="ABCDE-FGHJK"
              value={code}
              maxLength={14}
              onChange={e => setCode(e.target.value)}
              disabled={busy}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              inputMode="text"
            />
          </label>
          <label className="block">
            <span className="block font-semibold">Your name</span>
            <input
              className="field mt-1 w-full text-lg lg:h-12"
              placeholder="e.g. Riley"
              value={name}
              maxLength={LIMITS.name}
              onChange={e => setName(e.target.value)}
              disabled={busy}
              autoComplete="name"
            />
          </label>
          <button type="submit" className="btn btn-primary w-full justify-center text-lg lg:h-12" disabled={!live || busy || !code.trim() || !name.trim()}>
            {busy ? "Joining…" : "Join the team"}
          </button>
          {!live && <p role="status" className="text-sm text-muted lg:col-span-full">{s.connection === "offline" ? "Cannot reach the box. Are you on its network?" : "Connecting to the box…"}</p>}
          {error && <p role="alert" className="font-semibold text-alert lg:col-span-full">▲ {error}</p>}
        </form>
      )}
    </main>
  );
}
