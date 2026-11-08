// Run: npx tsx --test app/report/report.test.tsx
// The incident report without a browser: the plain-words timeline, which incident is shown,
// the team from the log, and the red banner whenever the chain status is not verified.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { appendEvent, type Json, type LogEvent } from "../../lib/chain";
import { actorString } from "../../lib/rules/darkroom/roles";
import { chainStatus, type ChainStatus } from "../../lib/rules/darkroom/status";
import { replayIncidents } from "../../lib/rules/darkroom/replay";
import { isBroken, pickIncident, teamFromLog, timelineFor, verifyCommand } from "./model";
import { ReportView, type ReportInput } from "./ReportView";

// Under this repo's "jsx": "preserve", tsx compiles JSX to React.createElement (Next uses the
// automatic runtime), so the components need React as a global when rendered here.
(globalThis as { React?: typeof React }).React = React;

const ID = {
  owner: "c2" + "0".repeat(62),
  dana: "c2" + "1".repeat(62),
  sam: "c2" + "2".repeat(62),
  lee: "c2" + "3".repeat(62),
};
const ACTOR = {
  owner: actorString("Box owner", "Commander", ID.owner),
  dana: actorString("Dana", "Commander", ID.dana),
  sam: actorString("Sam", "Responder", ID.sam),
  lee: actorString("Lee", "Viewer", ID.lee),
};
const FP = "1a2b3c4d" + "e".repeat(56);

function build(rows: Array<[incident: string, actor: string, type: string, payload: Json]>): LogEvent[] {
  const log: LogEvent[] = [];
  rows.forEach(([incident_id, actor, type, payload], i) => {
    const ts = new Date(Date.UTC(2026, 10, 8, 6, 0, i)).toISOString();
    log.push(appendEvent(log, { incident_id, ts, actor, type, payload }));
  });
  return log;
}

const LOG = build([
  ["", ACTOR.owner, "member_added", { name: "Box owner", role: "Commander", identity: ID.owner }],
  ["", ACTOR.owner, "member_added", { name: "Dana", role: "Commander", identity: ID.dana }],
  ["", ACTOR.owner, "member_added", { name: "Sam", role: "Responder", identity: ID.sam }],
  ["", ACTOR.owner, "member_added", { name: "Lee", role: "Viewer", identity: ID.lee }],
  ["INC-0001", ACTOR.dana, "incident_opened", { title: "Spoofed tank level at the Permian site" }],
  ["INC-0001", ACTOR.sam, "scope_update", { system: "Tank level sensor", state: "ACCESSED", certainty: "SUSPECTED", note: "Flat while physics says rising" }],
  ["INC-0001", ACTOR.sam, "evidence_imported", { ref: "AV-1A2B-3C4D", fingerprint: FP, source: "Avon console", note: "tank sensor LYING" }],
  ["INC-0002", ACTOR.dana, "incident_opened", { title: "A second incident" }],
  ["INC-0001", ACTOR.sam, "scope_update", { system: "Royalty owner records", state: "EXFILTRATED", certainty: "CONFIRMED", note: "Owner list copied out" }],
  ["INC-0001", ACTOR.sam, "evidence_imported", { ref: "AV-9F8E-7D6C", fingerprint: "", source: "Phone photo", note: "" }],
  ["INC-0001", ACTOR.lee, "chat", { text: "Legal is on the way" }],
  ["INC-0001", ACTOR.dana, "incident_closed", { resolution: "Sensor replaced and owners notified" }],
]);

const VERIFIED = chainStatus(LOG, null);

function input(status: ChainStatus, events: LogEvent[] = LOG): ReportInput {
  return { ready: true, connection: "live", error: null, events, status };
}

function render(s: ReportInput, requested = "INC-0001"): string {
  return renderToStaticMarkup(<ReportView s={s} requested={requested} host="127.0.0.1" db="darkroom" />);
}

function text(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");
}

// ---- model ------------------------------------------------------------------

test("the fixture log verifies", () => {
  assert.equal(VERIFIED.kind, "verified");
});

test("pickIncident: the newest with no parameter, the asked one otherwise, not found for an unknown id", () => {
  const incidents = replayIncidents(LOG);
  assert.equal(pickIncident(incidents, "").incident?.id, "INC-0002");
  assert.equal(pickIncident(incidents, "INC-0001").incident?.id, "INC-0001");
  assert.equal(pickIncident(incidents, " inc-0001 ").incident?.id, "INC-0001");
  const missing = pickIncident(incidents, "INC-0099");
  assert.equal(missing.incident, null);
  assert.equal(missing.notFound, true);
  assert.deepEqual(pickIncident([], ""), { incident: null, notFound: false });
});

test("timelineFor: every entry of this incident, in seq order, in plain words", () => {
  const t = timelineFor(LOG, "INC-0001");
  assert.deepEqual(t.map(e => e.seq), [4, 5, 6, 8, 9, 10, 11]);
  assert.match(t[0].what, /^opened the incident/);
  assert.match(t[1].what, /^marked Tank level sensor ACCESSED \(SUSPECTED\)/);
  assert.match(t[2].what, /^logged evidence AV-1A2B-3C4D/);
  assert.match(t[3].what, /^marked Royalty owner records EXFILTRATED \(CONFIRMED\)/);
  assert.match(t[3].what, /Owner list copied out/);
  assert.match(t[4].what, /^logged evidence AV-9F8E-7D6C.*reference only/);
  assert.equal(t[5].what, "wrote: Legal is on the way");
  assert.equal(t[6].what, "closed it: Sensor replaced and owners notified");
  assert.deepEqual([t[1].name, t[1].role], ["Sam", "Responder"]);
  assert.deepEqual([t[5].name, t[5].role], ["Lee", "Viewer"]);
});

test("teamFromLog: members and roles from member_added entries, newest per identity wins", () => {
  const relog = build([
    ["", ACTOR.owner, "member_added", { name: "Box owner", role: "Commander", identity: ID.owner }],
    ["", ACTOR.owner, "member_added", { name: "Box owner", role: "Commander", identity: ID.owner }],
    ["", ACTOR.owner, "member_added", { name: "Sam", role: "Viewer", identity: ID.sam }],
    ["", ACTOR.owner, "member_added", { name: "Sam", role: "Responder", identity: ID.sam }],
  ]);
  assert.deepEqual(teamFromLog(relog).map(m => `${m.name} (${m.role})`), ["Box owner (Commander)", "Sam (Responder)"]);
  assert.deepEqual(teamFromLog(LOG).map(m => `${m.name} (${m.role})`), ["Box owner (Commander)", "Dana (Commander)", "Sam (Responder)", "Lee (Viewer)"]);
});

test("verifyCommand names this box's host and database", () => {
  assert.equal(verifyCommand("127.0.0.1", "darkroom"), "node verify-standalone.mjs --host 127.0.0.1 --db darkroom");
});

test("isBroken: only rollback and tampering", () => {
  assert.equal(isBroken(VERIFIED), false);
  assert.equal(isBroken({ kind: "empty", text: "NO ENTRIES YET" }), false);
  assert.equal(isBroken({ kind: "rollback", text: "ROLLBACK DETECTED AT #3", at: 3 }), true);
  assert.equal(isBroken({ kind: "tampering", text: "TAMPERING AT #3", at: 3 }), true);
});

// ---- view -------------------------------------------------------------------

test("verified: every section, the full head hash, the count, and no alert", () => {
  const html = render(input(VERIFIED));
  const t = text(html);
  for (const want of [
    "LOG VERIFIED", "INC-0001", "Spoofed tank level at the Permian site", "CLOSED", "Sensor replaced and owners notified",
    "opened the incident", "marked Royalty owner records EXFILTRATED (CONFIRMED)", "logged evidence AV-", "wrote: ", "closed it: ",
    LOG[LOG.length - 1].hash, `${LOG.length} entries`, FP, "reference only",
    "Dana (Commander)", "Sam (Responder)", "Lee (Viewer)", "Box owner (Commander)",
    "node verify-standalone.mjs --host 127.0.0.1 --db darkroom", "witness", "integrity, not authenticity", "Print / Save as PDF",
  ]) {
    assert.ok(t.includes(want), `missing: ${want}`);
  }
  assert.ok(!html.includes('role="alert"'));
  assert.ok(!t.includes("A second incident"), "another incident leaks into the report");
  const timeline = t.slice(t.indexOf("Timeline"));
  const seqs = [...timeline.matchAll(/#(\d+)\b/g)].map(m => Number(m[1]));
  assert.deepEqual(seqs.slice(0, 7), [4, 5, 6, 8, 9, 10, 11]);
});

test("the closer and the opener are named in the header", () => {
  const t = text(render(input(VERIFIED)));
  assert.match(t, /Opened by Dana \(Commander\)/);
  assert.match(t, /Closed by Dana \(Commander\)/);
});

test("an open incident says OPEN", () => {
  const t = text(render(input(VERIFIED), "INC-0002"));
  assert.ok(t.includes("INC-0002") && t.includes("OPEN"));
  assert.ok(!t.includes("CLOSED"));
});

for (const status of [
  { kind: "rollback", text: "ROLLBACK DETECTED AT #12", at: 12 },
  { kind: "tampering", text: "TAMPERING AT #5", at: 5 },
  { kind: "tampering", text: "MEMBER LIST CHANGED OUTSIDE THE LOG (c2222222)", at: 12 },
] as ChainStatus[]) {
  test(`${status.text}: a red alert first, in words, and nothing says verified`, () => {
    const html = render(input(status));
    const alertAt = html.indexOf('role="alert"');
    assert.ok(alertAt >= 0, "no alert");
    assert.ok(alertAt < html.indexOf("<h1"), "the alert is not above the incident header");
    assert.ok(alertAt < html.indexOf("Print / Save as PDF"), "the alert is not the first block");
    const alertHtml = html.slice(alertAt, html.indexOf("</div>", alertAt));
    assert.ok(alertHtml.includes(status.text), "the alert does not carry the status text");
    assert.match(html.slice(html.lastIndexOf("<div", alertAt), alertAt + 200), /report-alert/);
    assert.doesNotMatch(text(html), /verified/i);
  });
}

test("an unknown incident gets a plain not found message", () => {
  const t = text(render(input(VERIFIED), "INC-0099"));
  assert.match(t, /INC-0099 was not found/);
  assert.ok(t.includes("INC-0001") && t.includes("INC-0002"), "lists the incidents that exist");
});

test("before the record loads, nothing claims a status", () => {
  const t = text(render({ ready: false, connection: "connecting", error: null, events: [], status: { kind: "empty", text: "NO ENTRIES YET" } }));
  assert.match(t, /Loading the record/);
  assert.doesNotMatch(t, /verified/i);
});

test("app/report imports by relative path, so the parent project's tsc and build also resolve it", () => {
  // The parent folder (/home/mohan/hackutd) is a second Next.js project whose tsconfig also
  // type-checks darkroom/**, and there "@/..." points at the parent, not at darkroom.
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const files = readdirSync(dir).filter(f => /\.(ts|tsx)$/.test(f));
  assert.ok(files.length >= 4, `expected the report sources, found ${files.join(", ")}`);
  for (const f of files) {
    const aliased = readFileSync(path.join(dir, f), "utf8").split("\n").filter(l => /^\s*import\b.*from\s+["']@\//.test(l));
    assert.deepEqual(aliased, [], `${f} imports through the "@/" alias`);
  }
});

test("the report never uses the words we ban", () => {
  // Built from parts so a grep for these words over app/report finds nothing.
  const banned = ["air" + "-gapped", "tamper" + "-proof", "unhack" + "able", "independently " + "secure"];
  const t = text(render(input(VERIFIED))).toLowerCase() + text(render(input({ kind: "rollback", text: "ROLLBACK DETECTED AT #12", at: 12 }))).toLowerCase();
  for (const w of banned) assert.ok(!t.includes(w), w);
});
