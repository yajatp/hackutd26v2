// Run: npx tsx --test app/attack/restore.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { VERB, restoreLabel, sendWords } from "./restore.ts";

test("restoreLabel names what it undoes, with the tank's label in the line", () => {
  assert.deepEqual(restoreLabel("kill", "S5 · Facility C tank"), { verb: "Undo Kill", line: "Restore the S5 · Facility C tank sensor" });
  assert.deepEqual(restoreLabel("fake_flat", "S5 · Facility C tank"), { verb: "Undo Fake", line: "Restore the S5 · Facility C tank sensor" });
  assert.deepEqual(restoreLabel("drift", "North · Facility A tank"), { verb: "Undo Drift", line: "Restore the North · Facility A tank sensor" });
});

test("restoreLabel copes with an unknown kind and a missing or ragged label", () => {
  assert.equal(restoreLabel("melt", "S1 · Facility A tank").verb, "Undo fault");
  assert.equal(restoreLabel("kill", "").line, "Restore the sensor");
  assert.equal(restoreLabel("kill", "   ").line, "Restore the sensor");
  assert.equal(restoreLabel("kill", "  S1 ·  Facility A tank ").line, "Restore the S1 · Facility A tank sensor");
});

test("the button's accessible name (verb, then line) starts with Undo, never Fake or Clear all", () => {
  for (const kind of [...Object.keys(VERB), "melt"]) {
    const l = restoreLabel(kind, "S5 · Facility C tank");
    const name = `${l.verb} ${l.line}`;
    assert.match(name, /^Undo\b/);
    assert.doesNotMatch(name, /^Fake\b/);                 // scripts/e2e.mjs: getByRole("button", { name: /^Fake\b/ })
    assert.doesNotMatch(name.toLowerCase(), /clear all/); // getByRole("button", { name: "Clear all" }) matches a substring
  }
});

test("VERB matches the Kill / Fake / Drift buttons", () => {
  assert.deepEqual(VERB, { kill: "Kill", fake_flat: "Fake", drift: "Drift" });
});

test("sendWords: an attack says Sending… then Sent to the site; a restore says Restoring… then Sensor restored", () => {
  assert.equal(sendWords("sending", false), "Sending…");
  assert.equal(sendWords("sent", false), "Sent to the site");
  assert.equal(sendWords("sending", true), "Restoring…");
  assert.equal(sendWords("sent", true), "Sensor restored");
});
