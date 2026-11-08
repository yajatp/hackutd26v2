"use client";
// The one XR store for /twin. Quest-safe, offline-safe and simple for a first-time user:
// - emulate: false, so desktop browsers never get a fake headset (and no Enter VR button);
// - controller and hand models off: their .glb files live on a CDN. The judge sees a plain ray
//   and a round cursor from each controller or hand instead;
// - controller layouts come from our own route (app/twin/xr-profiles), not the CDN default;
// - select (trigger or pinch) is the only action: no grab, no teleport (off by default in v6);
// - no anchors, planes, meshes or hit tests: on a Quest 3 those ask for a spatial-data permission.
import { createXRStore, type XRStore } from "@react-three/xr";

export const XR_PROFILES = "/twin/xr-profiles/";

// Rays long enough to reach across the table. A trigger pull or pinch counts as a click if it is
// released within 1.5 s (the library default is 0.3 s; first-time users squeeze and hold).
const RAY = { rayModel: { maxLength: 3 }, clickThresholdMs: 1500 };

let store: XRStore | null = null;

// Created on first use in the browser: the layout URL must be absolute (same origin).
export function twinXR(): XRStore {
  store ??= createXRStore({
    emulate: false,
    offerSession: false,
    controller: { model: false, grabPointer: false, teleportPointer: false, rayPointer: RAY },
    hand: { model: false, grabPointer: false, teleportPointer: false, rayPointer: RAY },
    baseAssetPath: new URL(XR_PROFILES, window.location.origin).href,
    anchors: false,
    planeDetection: false,
    meshDetection: false,
    hitTest: false,
    depthSensing: false,
  });
  return store;
}
