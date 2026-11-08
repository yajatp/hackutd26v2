import type { ReactNode } from "react";
import s from "./darkroom.module.css";

// The Darkroom's "secure room" theme (darkroom.module.css): the wrapper gives the shared tokens
// their teal values, so the screen follows without restyling each component.
export default function BoxLayout({ children }: { children: ReactNode }) {
  return <div className={s.room}>{children}</div>;
}
