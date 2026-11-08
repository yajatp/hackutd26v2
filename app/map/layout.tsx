import type { Metadata } from "next";

export const metadata: Metadata = { title: "Avon sites across America" };

// No AvonProvider here: the map opens one read-only connection per site itself (lib/fleet.ts).
export default function MapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
