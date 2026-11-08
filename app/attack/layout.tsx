import { AvonProvider } from "@/lib/live";

// The remote talks to the same avon database as the console.
export default function AttackLayout({ children }: { children: React.ReactNode }) {
  return <AvonProvider>{children}</AvonProvider>;
}
