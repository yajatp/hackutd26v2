"use client";

import dynamic from "next/dynamic";

// The /twin models at life size (app/twin/models/Preview.tsx). three.js needs the browser.
const Preview = dynamic(() => import("@/app/twin/models/Preview"), { ssr: false, loading: () => null });

export default function ModelsLab() {
  return <Preview />;
}
