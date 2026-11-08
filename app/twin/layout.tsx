import type { Metadata } from "next";
import { AvonProvider } from "@/lib/live";

export const metadata: Metadata = { title: "Avon · site twin" };

// The twin reads the same avon database as the console.
export default function TwinLayout({ children }: { children: React.ReactNode }) {
  return <AvonProvider>{children}</AvonProvider>;
}
