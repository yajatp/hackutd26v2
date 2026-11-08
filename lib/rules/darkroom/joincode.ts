// Join by code: a Commander makes a one-use code, says it out loud or shows it, and the new
// member types it with their name on /join. Pure: the darkroom module (the real gate) and the
// screens both use these rules.
//
// The browser sends only hashJoinCode(code) when it creates a code, so the box never stores the
// code itself. join_with_code receives the typed code and hashes it on the server.

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import { isRole, type MemberLike, type Role, type WriteCheck } from "./roles.ts";
import { validName } from "./entries.ts";

// Base32 without 0, 1, I and O, so a code read aloud or from a screen cannot be mistyped.
export const JOIN_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const JOIN_CODE_LENGTH = 10;                       // 50 bits
export const JOIN_CODE_TTL_MICROS = BigInt(60_000_000);   // 60 s
export const JOIN_ROLES = ["Responder", "Viewer"] as const;

// One character per random byte. 256 is a multiple of 32, so byte & 31 has no bias.
export function makeJoinCode(random: Uint8Array): string {
  if (random.length < JOIN_CODE_LENGTH) throw new Error(`a join code needs ${JOIN_CODE_LENGTH} random bytes`);
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += JOIN_ALPHABET[random[i] & 31];
  return code;
}

// What a person typed, as the code: case, spaces and dashes ignored. null if it cannot be a code.
export function normalizeJoinCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, "");
  if (s.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of s) if (!JOIN_ALPHABET.includes(ch)) return null;
  return s;
}

// "ABCDEFGHJK" -> "ABCDE-FGHJK", easier to read aloud.
export function formatJoinCode(code: string): string {
  return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function hashJoinCode(input: string): string {
  const code = normalizeJoinCode(input);
  if (!code) throw new Error(`a join code is ${JOIN_CODE_LENGTH} letters and digits`);
  return bytesToHex(sha256(utf8ToBytes(code)));
}

export function isCodeHash(x: string): boolean {
  return /^[0-9a-f]{64}$/.test(x);
}

export function joinCodeExpiry(createdMicros: bigint): bigint {
  return createdMicros + JOIN_CODE_TTL_MICROS;
}

export function checkCreateJoinCode(creator: MemberLike | null | undefined, role: string, codeHash: string): WriteCheck {
  if (!creator || !creator.active) return { ok: false, reason: "not a member" };
  if (creator.role !== "Commander") return { ok: false, reason: "only a Commander can add a member" };
  if (!(JOIN_ROLES as readonly string[]).includes(role)) return { ok: false, reason: "a join code is for a Responder or Viewer" };
  if (!isCodeHash(codeHash)) return { ok: false, reason: "send the SHA-256 hash of the code (64 hex characters), not the code" };
  return { ok: true };
}

export interface JoinCodeLike {
  role: string;
  expiresAtMicros: bigint;
  used: boolean;
}

export type JoinCheck = { ok: true; name: string; role: Role } | { ok: false; reason: string };

// code: the stored row for the typed code's hash (null if none). joiner: the sender's member row.
export function checkJoin(code: JoinCodeLike | null | undefined, nowMicros: bigint, joiner: MemberLike | null | undefined, name: string): JoinCheck {
  if (!code) return { ok: false, reason: "This code is not valid. Ask a Commander for a new one." };
  if (code.used) return { ok: false, reason: "This code was already used. Ask a Commander for a new one." };
  if (nowMicros >= code.expiresAtMicros) return { ok: false, reason: "This code has expired (codes last 60 seconds). Ask a Commander for a new one." };
  if (joiner && joiner.active) return { ok: false, reason: `This device is already on the team as ${joiner.role}.` };
  const clean = validName(name);
  if (!clean) return { ok: false, reason: "Your name must be 1-40 characters, with no |." };
  if (!isRole(code.role)) return { ok: false, reason: "This code has no valid role." };
  return { ok: true, name: clean, role: code.role };
}
