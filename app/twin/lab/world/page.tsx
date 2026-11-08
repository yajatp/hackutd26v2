"use client";

import dynamic from "next/dynamic";

// The /twin environment on its own (app/twin/world/Lab.tsx). three.js needs the browser.
const Lab = dynamic(() => import("../../world/Lab"), { ssr: false });

export default function WorldLabPage() {
  return <Lab />;
}
