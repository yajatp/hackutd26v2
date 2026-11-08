// Unit tests for the smoke test's safety rules and flags.
//   node --test 'scripts/smoke/*.test.mjs'
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FOLDER, SERVER, isProtected, parseArgs, publishArgs, spacetimeArgs } from "./safety.mjs";

test("defaults: the two smoke databases, mock_test, one run", () => {
  const o = parseArgs([]);
  assert.equal(o.avonDb, "avon-smoke");
  assert.equal(o.darkroomDb, "darkroom-smoke");
  assert.equal(o.folder, DEFAULT_FOLDER);
  assert.match(DEFAULT_FOLDER, /eog-data\/history\/mock_test_2026-10-10T1530$/);
  assert.equal(o.runs, 1);
});

test("flags: --avon-db, --darkroom-db, --folder, --runs", () => {
  const o = parseArgs(["--avon-db", "a-1", "--darkroom-db", "d-1", "--folder", "/tmp/x", "--runs", "3"]);
  assert.deepEqual([o.avonDb, o.darkroomDb, o.folder, o.runs], ["a-1", "d-1", "/tmp/x", 3]);
});

test("bad flags are refused", () => {
  assert.throws(() => parseArgs(["--runs", "0"]), /--runs/);
  assert.throws(() => parseArgs(["--runs", "two"]), /--runs/);
  assert.throws(() => parseArgs(["--runs"]), /needs a value/);
  assert.throws(() => parseArgs(["--bogus"]), /unknown option/);
  assert.throws(() => parseArgs(["--avon-db", "Avon_DB"]), /database name/);
  assert.throws(() => parseArgs(["--avon-db", "same", "--darkroom-db", "same"]), /different/);
});

test("only the names exactly 'avon' and 'darkroom' are protected", () => {
  assert.equal(isProtected("avon"), true);
  assert.equal(isProtected("darkroom"), true);
  assert.equal(isProtected("avon-smoke"), false);
  assert.equal(isProtected("darkroom-smoke"), false);
});

test("publish wipes the smoke databases and never the real ones", () => {
  const smoke = publishArgs("/m", "avon-smoke");
  assert.ok(smoke.includes("--delete-data=always"));
  assert.equal(smoke.at(-1), "avon-smoke");
  for (const db of ["avon", "darkroom"]) {
    const real = publishArgs("/m", db);
    assert.ok(!real.some((a) => a.startsWith("--delete-data") || a === "-c"), real.join(" "));
    assert.equal(real.at(-1), db);
  }
});

test("every spacetime command targets the local server", () => {
  assert.equal(SERVER, "http://127.0.0.1:3001");
  for (const args of [publishArgs("/m", "avon-smoke"), spacetimeArgs("sql", "darkroom-smoke", "SELECT 1"), spacetimeArgs("call", "x", "y")]) {
    const i = args.indexOf("-s");
    assert.ok(i >= 0 && args[i + 1] === SERVER, args.join(" "));
  }
  assert.throws(() => spacetimeArgs("login"), /not allowed/);
});
