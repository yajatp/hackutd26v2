import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  JOIN_ALPHABET, JOIN_CODE_LENGTH, JOIN_CODE_TTL_MICROS,
  checkCreateJoinCode, checkJoin, formatJoinCode, hashJoinCode, joinCodeExpiry, makeJoinCode, normalizeJoinCode,
} from "./joincode.ts";

const commander = { role: "Commander", active: true };
const T0 = BigInt("1762600000000000"); // a creation time in microseconds
const SECOND = BigInt(1_000_000);

function bytes(...xs: number[]): Uint8Array {
  return Uint8Array.from(xs);
}

test("the alphabet is 32 characters with no 0, 1, I or O", () => {
  assert.equal(JOIN_ALPHABET.length, 32);
  assert.equal(new Set(JOIN_ALPHABET).size, 32);
  for (const bad of "01IO") assert.ok(!JOIN_ALPHABET.includes(bad), bad);
});

test("a code is 10 characters from the alphabet, one per random byte", () => {
  const code = makeJoinCode(bytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9));
  assert.equal(code, "23456789AB");
  assert.equal(code.length, JOIN_CODE_LENGTH);
  // 256 is a multiple of 32, so byte & 31 picks every character equally often.
  assert.equal(makeJoinCode(bytes(31, 63, 95, 127, 159, 191, 223, 255, 32, 64)), "ZZZZZZZZ22");
  for (let i = 0; i < 50; i++) {
    const random = Uint8Array.from({ length: 10 }, () => Math.floor(Math.random() * 256));
    const c = makeJoinCode(random);
    assert.match(c, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/);
  }
  assert.throws(() => makeJoinCode(bytes(1, 2, 3)), /10 random bytes/);
});

test("typed codes are normalised: case, spaces and dashes do not matter", () => {
  assert.equal(normalizeJoinCode("abcde-fghjk"), "ABCDEFGHJK");
  assert.equal(normalizeJoinCode(" ABCDE FGHJK "), "ABCDEFGHJK");
  assert.equal(formatJoinCode("ABCDEFGHJK"), "ABCDE-FGHJK");
  assert.equal(normalizeJoinCode("ABCDE-FGHJ"), null, "too short");
  assert.equal(normalizeJoinCode("ABCDE-FGHJKL"), null, "too long");
  assert.equal(normalizeJoinCode("ABCDE-FGH0K"), null, "0 is not in the alphabet");
  assert.equal(normalizeJoinCode("ABCDE-FGHIK"), null, "I is not in the alphabet");
});

test("the hash is the SHA-256 hex of the normalised code, so the server can match it", () => {
  const want = bytesToHex(sha256(utf8ToBytes("ABCDEFGHJK")));
  assert.equal(hashJoinCode("ABCDEFGHJK"), want);
  assert.equal(hashJoinCode("abcde-fghjk"), want);
  assert.match(want, /^[0-9a-f]{64}$/);
  assert.notEqual(hashJoinCode("ABCDEFGHJM"), want);
  assert.throws(() => hashJoinCode("nope"), /10 letters and digits/);
});

test("only an active Commander may create a code", () => {
  const h = hashJoinCode("ABCDEFGHJK");
  assert.deepEqual(checkCreateJoinCode(commander, "Responder", h), { ok: true });
  for (const role of ["Responder", "Viewer"]) {
    const r = checkCreateJoinCode({ role, active: true }, "Viewer", h);
    assert.equal(r.ok, false, role);
    assert.match(r.ok ? "" : r.reason, /only a Commander/);
  }
  assert.deepEqual(checkCreateJoinCode(null, "Viewer", h), { ok: false, reason: "not a member" });
  assert.deepEqual(checkCreateJoinCode({ role: "Commander", active: false }, "Viewer", h), { ok: false, reason: "not a member" });
});

test("the role of a code must be Responder or Viewer", () => {
  const h = hashJoinCode("ABCDEFGHJK");
  assert.deepEqual(checkCreateJoinCode(commander, "Viewer", h), { ok: true });
  for (const role of ["Commander", "Root", ""]) {
    const r = checkCreateJoinCode(commander, role, h);
    assert.equal(r.ok, false, role);
    assert.match(r.ok ? "" : r.reason, /Responder or Viewer/);
  }
});

test("the server stores only a 64-hex hash; a plaintext code is refused", () => {
  const r = checkCreateJoinCode(commander, "Responder", "ABCDEFGHJK");
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.reason, /hash/);
  assert.equal(checkCreateJoinCode(commander, "Responder", hashJoinCode("ABCDEFGHJK").toUpperCase()).ok, false);
});

test("a code expires 60 s after it was made", () => {
  assert.equal(JOIN_CODE_TTL_MICROS, BigInt(60_000_000));
  const expires = joinCodeExpiry(T0);
  assert.equal(expires, T0 + BigInt(60) * SECOND);
  const code = { role: "Responder", expiresAtMicros: expires, used: false };
  assert.deepEqual(checkJoin(code, T0 + BigInt(59) * SECOND, null, "Riley"), { ok: true, name: "Riley", role: "Responder" });
  const at60 = checkJoin(code, T0 + BigInt(60) * SECOND, null, "Riley");
  assert.equal(at60.ok, false);
  assert.match(at60.ok ? "" : at60.reason, /expired/);
  assert.equal(checkJoin(code, T0 + BigInt(61) * SECOND, null, "Riley").ok, false);
});

test("a used code is refused, and so is an unknown one", () => {
  const used = checkJoin({ role: "Viewer", expiresAtMicros: joinCodeExpiry(T0), used: true }, T0, null, "Riley");
  assert.equal(used.ok, false);
  assert.match(used.ok ? "" : used.reason, /already used/);
  const unknown = checkJoin(null, T0, null, "Riley");
  assert.equal(unknown.ok, false);
  assert.match(unknown.ok ? "" : unknown.reason, /not valid/);
});

test("the name rules: 1-40 characters, trimmed, no |", () => {
  const code = { role: "Viewer", expiresAtMicros: joinCodeExpiry(T0), used: false };
  assert.deepEqual(checkJoin(code, T0, null, "  Riley Chen "), { ok: true, name: "Riley Chen", role: "Viewer" });
  for (const bad of ["", "   ", "x".repeat(41), "Dana|Commander"]) {
    const r = checkJoin(code, T0, null, bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.match(r.ok ? "" : r.reason, /name/);
  }
  assert.equal(checkJoin(code, T0, null, "x".repeat(40)).ok, true);
});

test("a device that is already on the team cannot use a code (no quiet role change)", () => {
  const code = { role: "Responder", expiresAtMicros: joinCodeExpiry(T0), used: false };
  const r = checkJoin(code, T0, { role: "Viewer", active: true }, "Lee");
  assert.equal(r.ok, false);
  assert.match(r.ok ? "" : r.reason, /already on the team/);
  assert.equal(checkJoin(code, T0, { role: "Viewer", active: false }, "Lee").ok, true, "an inactive row may join again");
});
