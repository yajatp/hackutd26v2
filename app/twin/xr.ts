"use client";
// The one XR store for /twin. Quest-safe, offline-safe and simple for a first-time user:
// - emulate: false, so desktop browsers never get a fake headset (and no Enter VR button);
// - controller and hand models off: their .glb files live on a CDN. The judge sees a plain ray
//   and a round cursor from each controller or hand instead;
// - controller layouts come from our own route (app/twin/xr-profiles), not the CDN default;
// - select (trigger or pinch) only ever picks: tanks, signs, buttons, panels. In the Walk view the
//   thumbstick pushed forward aims a teleport arc and letting it go jumps (nav/GroundTeleport.tsx
//   draws it). The library's teleport pointer stays off: sharing the trigger, its arc (landing
//   about 2.5 m ahead) beat the ray to a tank 6 m away, so the trigger teleported instead of
//   opening the tank's panel. No grab. Hands get no teleport;
// - no anchors, planes, meshes or hit tests: on a Quest 3 those ask for a spatial-data permission.
import { createXRStore, type XRStore, type XRStoreOptions } from "@react-three/xr";
import { TELEPORT_STORE_OPTIONS } from "./nav/GroundTeleport";
import { C } from "./theme";

export const XR_PROFILES = "/twin/xr-profiles/";

// Rays long enough to reach a tank across the pad in the Walk view (the table is a step away). A
// trigger pull or pinch counts as a click if it is released within 1.5 s (the library default is
// 0.3 s; first-time users squeeze and hold).
// The ray is the data layer's holo cyan.
const RAY = { rayModel: { maxLength: 24, color: C.holo, opacity: 0.7 }, clickThresholdMs: 1500 };

// The store's options, shared with the emulator test page (app/twin/emulate) so the two never drift.
export function twinStoreOptions(): XRStoreOptions {
  return {
    emulate: false,
    offerSession: false,
    controller: { model: false, grabPointer: false, rayPointer: RAY, ...TELEPORT_STORE_OPTIONS.controller },
    hand: { model: false, grabPointer: false, rayPointer: RAY, ...TELEPORT_STORE_OPTIONS.hand },
    baseAssetPath: new URL(XR_PROFILES, window.location.origin).href,
    anchors: false,
    planeDetection: false,
    meshDetection: false,
    hitTest: false,
    depthSensing: false,
  };
}

let store: XRStore | null = null;

// Created on first use in the browser: the layout URL must be absolute (same origin).
export function twinXR(): XRStore {
  store ??= createXRStore(twinStoreOptions());
  return store;
}
