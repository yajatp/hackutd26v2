import type { Metadata } from "next";
import { AvonProvider } from "@/lib/live";

export const metadata: Metadata = { title: "Avon VR station" };

// The station reads the same avon database as the console and the model.
export default function VrLayout({ children }: { children: React.ReactNode }) {
  return <AvonProvider>{children}</AvonProvider>;
}
