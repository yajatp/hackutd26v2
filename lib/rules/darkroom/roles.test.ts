import { test } from "node:test";
import assert from "node:assert/strict";
import { actorString, checkWrite, parseActor, roleAbilities } from "./roles.ts";

test("a non-member is refused with 'not a member'", () => {
  assert.deepEqual(checkWrite(null, "chat"), { ok: false, reason: "not a member" });
  assert.deepEqual(checkWrite(undefined, "scope_update"), { ok: false, reason: "not a member" });
  assert.deepEqual(checkWrite({ role: "Commander", active: false }, "chat"), { ok: false, reason: "not a member" });
});

test("a Viewer cannot scope_update or open an incident", () => {
  const viewer = { role: "Viewer", active: true };
  const r = checkWrite(viewer, "scope_update");
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.reason, /Viewer cannot/);
  assert.equal(checkWrite(viewer, "incident_opened").ok, false);
});

test("a Responder can scope_update but cannot open an incident", () => {
  const responder = { role: "Responder", active: true };
  assert.deepEqual(checkWrite(responder, "scope_update"), { ok: true });
  assert.equal(checkWrite(responder, "incident_opened").ok, false);
});

test("any member can chat; only a Commander opens an incident", () => {
  for (const role of ["Commander", "Responder", "Viewer"]) {
    assert.deepEqual(checkWrite({ role, active: true }, "chat"), { ok: true }, role);
  }
  assert.deepEqual(checkWrite({ role: "Commander", active: true }, "incident_opened"), { ok: true });
});

test("unknown roles and entry types are refused", () => {
  assert.equal(checkWrite({ role: "Root", active: true }, "chat").ok, false);
  assert.equal(checkWrite({ role: "Commander", active: true }, "member_added").ok, false);
  assert.equal(checkWrite({ role: "Commander", active: true }, "drop_table").ok, false);
});

test("the actor string is built from the member row and parses back", () => {
  const a = actorString("Dana", "Commander", "c2000453abcd");
  assert.equal(a, "Dana|Commander|c2000453abcd");
  assert.deepEqual(parseActor(a), { name: "Dana", role: "Commander", identity: "c2000453abcd" });
  assert.deepEqual(parseActor("physics-check"), { name: "physics-check", role: "", identity: "" });
});

test("what each role can and cannot do, in words for the join page", () => {
  assert.deepEqual(roleAbilities("Responder"), {
    can: ["update the scope board", "post in chat", "log evidence"],
    cannot: ["open an incident", "close an incident"],
  });
  assert.deepEqual(roleAbilities("Viewer"), {
    can: ["post in chat"],
    cannot: ["open an incident", "update the scope board", "log evidence", "close an incident"],
  });
  assert.equal(roleAbilities("Commander").cannot.length, 0);
});
