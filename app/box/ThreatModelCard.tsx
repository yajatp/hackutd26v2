// The honest threat model, shown on the box. Keep it true to what is built.
// Words we use: isolated local network, tamper-evident, integrity, not authenticity.

export function ThreatModelCard() {
  return (
    <section aria-labelledby="threat-model" className="card text-sm leading-relaxed">
      <h2 id="threat-model" className="section-title">Threat model</h2>
      <p className="mt-1 text-muted">An isolated incident documentation and evidence-integrity room.</p>

      <h3 className="mt-3 font-semibold">Protects against</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>
          An attacker on the company network reading or changing the incident record. The box runs on an isolated local network: its own router, with nothing plugged into the internet port. This holds only while the box is set up that way.
        </li>
        <li>
          Someone quietly editing or deleting log entries afterward. The log is tamper-evident: each entry carries the fingerprint (hash) of the one before it, every screen and witness phone remembers the newest entry it saw, and a separate verifier laptop checks the chain.
        </li>
        <li>
          People writing to the record without being let in. Only members the box owner added can write, and the server checks each member&apos;s role (Commander, Responder, Viewer). The server stamps who wrote each entry; a screen cannot choose that name.
        </li>
      </ul>

      <h3 className="mt-3 font-semibold">Does not protect against</h3>
      <ul className="mt-1 list-disc space-y-1 pl-5">
        <li>Someone with physical control of the Darkroom laptop changing what it displays live.</li>
        <li>A compromised phone.</li>
        <li>
          Proving the original sensor evidence was true. We prove the record was not changed after it was written: integrity, not authenticity.
        </li>
        <li>
          Root on the box deleting or rewriting entries. We do not stop that; we detect it on every device that already saw those entries. A device that never saw an entry cannot miss it.
        </li>
        <li>Anyone who gets onto the Darkroom network reading the record. Its tables can be read without signing in; the verifier laptop relies on that.</li>
      </ul>
    </section>
  );
}
