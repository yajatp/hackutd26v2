"use client";
// TEST PAGE (see page.tsx). Installs iwer's emulated Meta Quest 3 in place of this browser's
// WebXR, then creates this page's own XR store and hands it to the real TwinScreen. The store
// options are app/twin/xr.ts's own (twinStoreOptions: offline controller layouts, no models, the
// Walk view's teleport arc, no anchors, planes, meshes or hit tests); only the headset is fake.
// window.__twinEmu lets a script drive it.
import { useEffect, useState } from "react";
import { createXRStore, type XRStore } from "@react-three/xr";
import TwinScreen from "../TwinScreen";
import { twinStoreOptions } from "../xr";

declare global {
  interface Window { __twinEmu?: { store: XRStore; device: { quaternion: { set(x: number, y: number, z: number, w: number): void } } } }
}

export default function EmulateScreen() {
  const [store, setStore] = useState<XRStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    import("iwer").then(({ XRDevice, metaQuest3 }) => {
      if (!live) return;
      const device = new XRDevice(metaQuest3);
      device.installRuntime({ forceInstall: true });     // over the desktop browser's own WebXR
      const s = createXRStore(twinStoreOptions());   // emulate: false; iwer is installed above, by hand
      window.__twinEmu = { store: s, device };
      setStore(s);
    }, (e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    return () => { live = false; };
  }, []);

  if (error) return <p role="alert" style={{ padding: 24 }}>The emulator did not load: {error}</p>;
  if (!store) return <p style={{ padding: 24, background: "#102231", color: "#8fa1aa", minHeight: "100dvh", margin: 0 }}>Installing the emulated Quest 3…</p>;
  return (
    <>
      <TwinScreen store={store} />
      <p data-testid="emulator-note" style={{
        position: "fixed", left: "50%", bottom: 48, transform: "translateX(-50%)", zIndex: 30, margin: 0,
        padding: "2px 8px", background: "#102231", color: "#d7dee0", border: "1px solid #d7dee0", fontSize: 13,
      }}>
        Test page: emulated Meta Quest 3 (iwer). The real headset uses /twin.
      </p>
    </>
  );
}
