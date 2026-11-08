import { AvonProvider } from "@/lib/live";

// The dashboard reads the same avon database as the console.
export default function InsightLayout({ children }: { children: React.ReactNode }) {
  return <AvonProvider>{children}</AvonProvider>;
}
