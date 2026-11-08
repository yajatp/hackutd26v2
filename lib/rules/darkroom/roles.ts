// Who may write what to the Darkroom log. Pure: used by the Spacetime module
// (the real gate) and by the screens (to hide buttons a role cannot use).

export const ROLES = ["Commander", "Responder", "Viewer"] as const;
export type Role = (typeof ROLES)[number];

// Entry types a member can cause. Server-only types (member_added) are not here.
export const WRITE_TYPES = ["incident_opened", "scope_update", "chat"] as const;
export type WriteType = (typeof WRITE_TYPES)[number];

const ALLOWED: Record<WriteType, readonly Role[]> = {
  incident_opened: ["Commander"],
  scope_update: ["Commander", "Responder"],
  chat: ROLES,
};

const VERB: Record<WriteType, string> = {
  incident_opened: "open an incident",
  scope_update: "update the scope board",
  chat: "post in chat",
};

export function isRole(x: unknown): x is Role {
  return typeof x === "string" && (ROLES as readonly string[]).includes(x);
}

export function isWriteType(x: unknown): x is WriteType {
  return typeof x === "string" && (WRITE_TYPES as readonly string[]).includes(x);
}

export interface MemberLike {
  role: string;
  active: boolean;
}

export type WriteCheck = { ok: true } | { ok: false; reason: string };

export function checkWrite(member: MemberLike | null | undefined, type: string): WriteCheck {
  if (!member || !member.active) return { ok: false, reason: "not a member" };
  if (!isWriteType(type)) return { ok: false, reason: `unknown entry type ${type}` };
  if (!isRole(member.role)) return { ok: false, reason: `unknown role ${member.role}` };
  if (!ALLOWED[type].includes(member.role)) return { ok: false, reason: `${member.role} cannot ${VERB[type]}` };
  return { ok: true };
}

export function can(role: string | null | undefined, type: WriteType): boolean {
  return checkWrite(role ? { role, active: true } : null, type).ok;
}

// The server builds this from the member row it finds for ctx.sender.
export function actorString(name: string, role: string, identityHex: string): string {
  return `${name}|${role}|${identityHex}`;
}

export function parseActor(actor: string): { name: string; role: string; identity: string } {
  const parts = actor.split("|");
  if (parts.length < 3) return { name: actor, role: "", identity: "" };
  const identity = parts.pop() as string;
  const role = parts.pop() as string;
  return { name: parts.join("|"), role, identity };
}
