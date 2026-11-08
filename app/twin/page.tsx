"use client";

import dynamic from "next/dynamic";

// three.js and WebXR need the browser, so the screen renders on the client only.
const TwinScreen = dynamic(() => import("./TwinScreen"), {
  ssr: false,
  loading: () => (
    <p style={{ margin: 0, minHeight: "100dvh", padding: "20px 48px", background: "#102231", color: "#8fa1aa", fontFamily: '"Barlow", system-ui, sans-serif' }}>
      Loading the model…
    </p>
  ),
});

export default function TwinPage() {
  return <TwinScreen />;
}
