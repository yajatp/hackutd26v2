"use client";
// The Darkroom snapshot for the room's console. The Darkroom database is served over plain ws://
// from the laptop (lib/darkroom-live.ts), so a page served over https (the hosted URL, the field
// network) never tries to reach it: it shows the isolation instead, by design. A module constant
// picks the hook, so the hook order never changes between renders.
import { useDarkroom, type DarkroomSnapshot } from "@/lib/darkroom-live";

const OFFLINE: DarkroomSnapshot = {
  connection: "offline", ready: false, identity: null, events: [], members: [], me: null, head: null,
  status: { kind: "empty", text: "NO ENTRIES YET" }, witness: null, error: null, rttMs: null,
};

const reachable = typeof window !== "undefined" && window.location.protocol === "http:";
const offline = (): DarkroomSnapshot => OFFLINE;

export const useRoomSnapshot: () => DarkroomSnapshot = reachable ? useDarkroom : offline;
