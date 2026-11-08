"use client";

import dynamic from "next/dynamic";

// The attack moment's effects on a stand-in tank (app/twin/fx/FxLab.tsx). Not linked from the demo.
const FxLab = dynamic(() => import("../../fx/FxLab"), { ssr: false });

export default function FxLabPage() {
  return <FxLab />;
}
