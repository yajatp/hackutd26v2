import type { LogEvent } from "@/lib/chain";
import { parseActor } from "@/lib/rules/darkroom/roles";

// The newest Darkroom log entries, worded the same on the box and on the witness phone.
export const ENTRY_LABEL: Record<string, string> = {
  member_added: "member added",
  incident_opened: "incident opened",
  scope_update: "scope update",
  chat: "chat",
  evidence_imported: "evidence logged",
  incident_closed: "incident closed",
};

export function LogEntries({ events, max }: { events: readonly LogEvent[]; max: number }) {
  const recent = events.slice(-max).reverse();
  return (
    <section aria-labelledby="log-entries" className="card text-sm">
      <h2 id="log-entries" className="section-title">Newest log entries</h2>
      <ol className="mt-2 space-y-1 break-words font-mono text-sm">
        {recent.length === 0 && <li className="font-sans text-muted">None yet.</li>}
        {recent.map((e) => (
          <li key={e.seq}>
            #{e.seq} {ENTRY_LABEL[e.type] ?? e.type} · {parseActor(e.actor).name} · {e.hash.slice(0, 8)}
          </li>
        ))}
      </ol>
    </section>
  );
}
