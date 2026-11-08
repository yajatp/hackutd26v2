"use client";
// TEST PAGE, development only. /twin inside an emulated Meta Quest 3 (iwer, the Immersive Web
// Emulation Runtime that ships with @react-three/xr), so a headless browser can enter immersive VR
// and screenshot what the headset shows. Nothing links here, and the real /twin (page.tsx,
// TwinScreen.tsx, xr.ts) never imports this folder or the emulator.
import dynamic from "next/dynamic";

const EmulateScreen = dynamic(() => import("./EmulateScreen"), {
  ssr: false,
  loading: () => <p style={{ padding: 24, background: "#102231", color: "#8fa1aa", minHeight: "100dvh", margin: 0 }}>Loading the emulator test page…</p>,
});

export default function TwinEmulatePage() {
  if (process.env.NODE_ENV === "production") {
    return <p style={{ padding: 24 }}>This is a development test page. It is off in production.</p>;
  }
  return <EmulateScreen />;
}
