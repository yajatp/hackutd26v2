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
}

export const EntryContext = createContext<EntryValue | null>(null);

export function useEntry(): EntryValue | null {
  return useContext(EntryContext);
}
