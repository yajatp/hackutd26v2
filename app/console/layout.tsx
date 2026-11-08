import s from "./console.module.css";

// The console wears the night of /vr in both color schemes; the wrapper gives
// the shared tokens their night values, so the header, badges and board follow.
export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <div className={s.night}>{children}</div>;
}
