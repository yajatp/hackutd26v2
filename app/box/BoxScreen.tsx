"use client";

import { useMemo, useState, type FormEvent } from "react";
import { darkroom, useDarkroom } from "@/lib/darkroom-live";
import { replayChat, replayIncidents, replayScope } from "@/lib/rules/darkroom/replay";
import { CERTAINTIES, LIMITS, SCOPE_STATES, type Certainty, type ScopeState } from "@/lib/rules/darkroom/entries";
import { can, parseActor } from "@/lib/rules/darkroom/roles";
import { ConnectionChip, StatusBanner } from "./StatusBanner";
import { ThreatModelCard } from "./ThreatModelCard";

const SUGGESTED_SYSTEMS = ["Tank level sensor", "SCADA historian", "Field VPN credentials", "Royalty owner records", "Billing database"];

const TYPE_LABEL: Record<string, string> = {
  member_added: "member added",
  incident_opened: "incident opened",
  scope_update: "scope update",
  chat: "chat",
};

function time(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(fn: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

function Choice<T extends string>({ label, options, value, onChange, disabled }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void; disabled: boolean }) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2" disabled={disabled}>
      <legend className="mb-1 w-full text-sm font-medium">{label}</legend>
      {options.map(o => (
        <button
          key={o}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`rounded border px-3 py-1.5 text-sm ${value === o ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-300 bg-white"}`}
        >
          {o}
        </button>
      ))}
    </fieldset>
  );
}

export default function BoxScreen() {
  const s = useDarkroom();
  const incidents = useMemo(() => replayIncidents(s.events), [s.events]);
  const [chosen, setChosen] = useState<string | null>(null);
  const current = incidents.find(i => i.id === chosen) ?? incidents[incidents.length - 1] ?? null;
  const scope = useMemo(() => (current ? replayScope(s.events, current.id) : []), [s.events, current]);
  const chat = useMemo(() => (current ? replayChat(s.events, current.id) : []), [s.events, current]);

  const broken = s.status.kind === "rollback" || s.status.kind === "tampering";
  const writable = s.connection === "live" && s.ready && !broken && !!s.me;
  const role = s.me?.role ?? null;

  const [title, setTitle] = useState("");
  const [system, setSystem] = useState("");
  const [state, setState] = useState<ScopeState>("SUSPECTED");
  const [certainty, setCertainty] = useState<Certainty>("SUSPECTED");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const openAction = useAction();
  const scopeAction = useAction();
  const chatAction = useAction();

  async function openIncident(e: FormEvent) {
    e.preventDefault();
    if (await openAction.run(() => darkroom.openIncident(title))) {
      setTitle("");
      setChosen(null);
    }
  }

  async function updateScope(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (await scopeAction.run(() => darkroom.append(current.id, "scope_update", { system, state, certainty, note }))) {
      setSystem("");
      setNote("");
    }
  }

  async function sendChat(e: FormEvent) {
    e.preventDefault();
    if (!current) return;
    if (await chatAction.run(() => darkroom.append(current.id, "chat", { text: message }))) setMessage("");
  }

  const recent = s.events.slice(-10).reverse();

  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-5 bg-white p-4 text-neutral-900 sm:p-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Darkroom</h1>
          <p className="text-neutral-600">Incident room on the box. Every change below is an entry in a hash-chained log.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <ConnectionChip s={s} />
          <span className="text-sm text-neutral-600">
            {s.me ? `You: ${s.me.name} (${s.me.role})` : s.identity ? "You: not on the team (read only)" : ""}
          </span>
        </div>
      </header>

      <StatusBanner s={s} />

      {s.identity && s.ready && !s.me && (
        <div className="rounded-lg border border-neutral-300 p-4 text-sm">
          <p className="font-semibold">This screen can read the record but cannot write to it.</p>
          <p className="mt-1">The box owner adds it from a terminal on the box:</p>
          <pre className="mt-2 overflow-x-auto rounded bg-neutral-100 p-2 text-xs">{`node scripts/darkroom-seed.mjs --add ${s.identity} --name "Box screen" --role Commander`}</pre>
        </div>
      )}

      <section aria-labelledby="incident" className="rounded-lg border border-neutral-300 p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 id="incident" className="text-sm font-medium uppercase tracking-wide text-neutral-600">Incident</h2>
            {current ? (
              <>
                <p className="text-xl font-semibold">
                  {current.id} · {current.title}
                </p>
                <p className="text-sm text-neutral-600">
                  Opened by {current.openedBy} at {time(current.openedAt)} (entry #{current.seq})
                </p>
              </>
            ) : (
              <p className="text-xl">{s.ready ? "No incident open yet." : "…"}</p>
            )}
            {incidents.length > 1 && (
              <label className="mt-2 block text-sm">
                Show incident{" "}
                <select className="rounded border border-neutral-300 p-1" value={current?.id ?? ""} onChange={e => setChosen(e.target.value)}>
                  {incidents.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.id} · {i.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          {can(role, "incident_opened") && (
            <form onSubmit={openIncident} className="flex flex-wrap items-end gap-2">
              <label className="text-sm">
                <span className="block font-medium">Open a new incident</span>
                <input
                  className="mt-1 w-72 rounded border border-neutral-300 p-2"
                  placeholder="What happened, in a few words"
                  value={title}
                  maxLength={LIMITS.title}
                  onChange={e => setTitle(e.target.value)}
                  disabled={!writable || openAction.busy}
                />
              </label>
              <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-40" disabled={!writable || openAction.busy || !title.trim()}>
                Open incident
              </button>
              {openAction.error && <p className="w-full text-sm text-red-700">{openAction.error}</p>}
            </form>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section aria-labelledby="scope" className="rounded-lg border border-neutral-300 p-4 lg:col-span-2">
          <h2 id="scope" className="text-lg font-semibold">Scope board</h2>
          <p className="text-sm text-neutral-600">Which systems and data are affected. Rebuilt from the log on every change; the newest entry for a row wins.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-300 text-neutral-600">
                <tr>
                  <th className="py-2 pr-3 font-medium">System or data</th>
                  <th className="py-2 pr-3 font-medium">What happened</th>
                  <th className="py-2 pr-3 font-medium">How sure</th>
                  <th className="py-2 pr-3 font-medium">Note</th>
                  <th className="py-2 font-medium">Last change</th>
                </tr>
              </thead>
              <tbody>
                {scope.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-3 text-neutral-600">
                      {current ? "Nothing in scope yet." : "Open an incident first."}
                    </td>
                  </tr>
                )}
                {scope.map(r => (
                  <tr key={r.key} className="border-b border-neutral-200 align-top">
                    <td className="py-2 pr-3 font-medium">{r.system}</td>
                    <td className="py-2 pr-3 font-semibold">{r.state}</td>
                    <td className={`py-2 pr-3 ${r.certainty === "CONFIRMED" ? "font-semibold" : ""}`}>{r.certainty}</td>
                    <td className="py-2 pr-3">{r.note}</td>
                    <td className="py-2 text-neutral-600">
                      #{r.seq} by {r.by}, {time(r.ts)}
                      {r.updates > 1 ? ` (${r.updates} changes)` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {current && can(role, "scope_update") && (
            <form onSubmit={updateScope} className="mt-4 space-y-3 border-t border-neutral-200 pt-4">
              <label className="block text-sm">
                <span className="font-medium">System or data</span>
                <input
                  className="mt-1 w-full rounded border border-neutral-300 p-2"
                  list="darkroom-systems"
                  placeholder="e.g. Royalty owner records"
                  value={system}
                  maxLength={LIMITS.system}
                  onChange={e => setSystem(e.target.value)}
                  disabled={!writable || scopeAction.busy}
                />
                <datalist id="darkroom-systems">
                  {[...new Set([...scope.map(r => r.system), ...SUGGESTED_SYSTEMS])].map(x => (
                    <option key={x} value={x} />
                  ))}
                </datalist>
              </label>
              <Choice label="What happened" options={SCOPE_STATES} value={state} onChange={setState} disabled={!writable || scopeAction.busy} />
              <Choice label="How sure" options={CERTAINTIES} value={certainty} onChange={setCertainty} disabled={!writable || scopeAction.busy} />
              <label className="block text-sm">
                <span className="font-medium">Note (optional)</span>
                <input
                  className="mt-1 w-full rounded border border-neutral-300 p-2"
                  value={note}
                  maxLength={LIMITS.note}
                  onChange={e => setNote(e.target.value)}
                  disabled={!writable || scopeAction.busy}
                />
              </label>
              <button type="submit" className="rounded bg-neutral-900 px-4 py-2 text-white disabled:opacity-40" disabled={!writable || scopeAction.busy || !system.trim()}>
                Add to the record
              </button>
              {scopeAction.error && <p className="text-sm text-red-700">{scopeAction.error}</p>}
            </form>
          )}
          {current && s.me && !can(role, "scope_update") && <p className="mt-3 text-sm text-neutral-600">Your role ({role}) can read the scope board and chat, but not change scope.</p>}
        </section>

        <section aria-labelledby="chat" className="flex flex-col rounded-lg border border-neutral-300 p-4">
          <h2 id="chat" className="text-lg font-semibold">Team chat</h2>
          <p className="text-sm text-neutral-600">Every message is a log entry.</p>
          <ol className="mt-3 max-h-96 flex-1 space-y-2 overflow-y-auto text-sm">
            {chat.length === 0 && <li className="text-neutral-600">{current ? "No messages yet." : "Open an incident first."}</li>}
            {chat.map(c => (
              <li key={c.seq}>
                <span className="text-neutral-600">
                  #{c.seq} {time(c.ts)} · {c.name}
                  {c.role ? ` (${c.role})` : ""}
                </span>
                <p className="whitespace-pre-wrap break-words">{c.text}</p>
              </li>
            ))}
          </ol>
          {current && s.me && (
            <form onSubmit={sendChat} className="mt-3 flex gap-2">
              <input
                className="min-w-0 flex-1 rounded border border-neutral-300 p-2 text-sm"
                placeholder="Message the team"
                value={message}
                maxLength={LIMITS.text}
                onChange={e => setMessage(e.target.value)}
                disabled={!writable || chatAction.busy}
                aria-label="Message"
              />
              <button type="submit" className="rounded bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-40" disabled={!writable || chatAction.busy || !message.trim()}>
                Send
              </button>
            </form>
          )}
          {chatAction.error && <p className="mt-1 text-sm text-red-700">{chatAction.error}</p>}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ThreatModelCard />
        </div>
        <div className="space-y-5">
          <section aria-labelledby="record" className="rounded-lg border border-neutral-300 p-4 text-sm">
            <h2 id="record" className="text-base font-semibold">Newest log entries</h2>
            <ol className="mt-2 space-y-1 font-mono text-xs">
              {recent.length === 0 && <li className="font-sans text-neutral-600">None yet.</li>}
              {recent.map(e => (
                <li key={e.seq}>
                  #{e.seq} {TYPE_LABEL[e.type] ?? e.type} · {parseActor(e.actor).name} · {e.hash.slice(0, 8)}
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="team" className="rounded-lg border border-neutral-300 p-4 text-sm">
            <h2 id="team" className="text-base font-semibold">Team</h2>
            <ul className="mt-2 space-y-1">
              {s.members.filter(m => m.active).map(m => (
                <li key={m.identity}>
                  {m.name} · {m.role} <span className="font-mono text-xs text-neutral-600">{m.identity.slice(0, 8)}…</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
