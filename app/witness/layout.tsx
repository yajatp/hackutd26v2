import type { ReactNode } from "react";
import s from "../box/darkroom.module.css";

// The witness phone wears the same secure-room theme as /box.
export default function WitnessLayout({ children }: { children: ReactNode }) {
  return <div className={s.room}>{children}</div>;
}
