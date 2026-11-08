"use client";
// The entry state for the scene: TwinScreen provides it, VrStage reads it (inside the canvas; the
// canvas bridges React context). `null` outside TwinScreen (lab and preview pages), which keeps
// their scenes exactly as before.
import { createContext, useContext } from "react";
import type { SiteSummary } from "@/lib/fleet";

export interface EntryValue {
  atMap: boolean;
  site: string | null;               // the picked site's display name at a site
  siteKey: string | null;            // its lib/sites.ts key (for the sky clock: world/clock.ts)
  sites: SiteSummary[];              // live fleet status, for the map
  pick(key: string): void;
  back(): void;
  room?: RoomValue;                  // the Darkroom (app/twin/darkroom/); absent on lab pages
}

// The Darkroom's state for the scene: whether the judge is in it, the security alert, the incident.
export interface RoomValue {
  in: boolean;
  enter(): void;                     // Enter the Darkroom (from the alert or the Darkroom button)
  leave(): void;                     // Return to the site
  alert: { line: string; visible: boolean } | null;
  dismiss(): void;                   // Not now
  incident: { line: string | null; ref: string | null; simulated: boolean };
}

export const EntryContext = createContext<EntryValue | null>(null);

export function useEntry(): EntryValue | null {
  return useContext(EntryContext);
}
