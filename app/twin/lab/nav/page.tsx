"use client";
// PREVIEW, not linked from the demo: the headset's menu dock and dashboard (app/twin/nav) on the
// live avon data, in a plain 3D canvas at eye height. The twin layout's AvonProvider wraps it.
import dynamic from "next/dynamic";
import { C } from "../../theme";

const NavLab = dynamic(() => import("../../nav/NavLab"), {
  ssr: false,
  loading: () => <p style={{ padding: 24, margin: 0, minHeight: "100dvh", background: C.skyZenith, color: C.textDim }}>Loading the menu preview…</p>,
});

export default function NavLabPage() {
  return <NavLab />;
}
