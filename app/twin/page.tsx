"use client";

import dynamic from "next/dynamic";

// three.js and WebXR need the browser, so the screen renders on the client only.
const TwinScreen = dynamic(() => import("./TwinScreen"), {
  ssr: false,
  loading: () => <p className="p-6 text-muted">Loading the site twin…</p>,
});

export default function TwinPage() {
  return <TwinScreen />;
}
