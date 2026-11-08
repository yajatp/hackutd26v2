import { AvonProvider } from "@/lib/live";
import s from "./attack.module.css";

// The remote talks to the same avon database as the console. It wears its own night, the
// red-team skin in attack.module.css, in both color schemes.
export default function AttackLayout({ children }: { children: React.ReactNode }) {
  return (
    <AvonProvider>
      <div className={s.red}>{children}</div>
    </AvonProvider>
  );
}
