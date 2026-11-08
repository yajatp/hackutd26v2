import type { Metadata } from "next";
import { AvonProvider } from "@/lib/live";
import { Station } from "./vr/Station";

export const metadata: Metadata = { title: "Avon · Home" };

// The landing the hosted link opens: Avon and Open the model, over the live table. The screen
// index moved to /screens.
export default function Page() {
  return <AvonProvider><Station /></AvonProvider>;
}
