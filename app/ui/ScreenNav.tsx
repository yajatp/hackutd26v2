import s from "./screen-nav.module.css";

// The Avon screens as one row of hairline-underlined tabs (after signal-a.studio's nav). A dot
// marks this screen and slides to the tab under the pointer or keyboard focus, in CSS only
// (screen-nav.module.css), so it is right from the first paint. A tab inverts on hover.
// Plain links: each screen opens fresh with its own live connection.
export const SCREENS = [
  { key: "console", href: "/console", label: "Console" },
  { key: "attack", href: "/attack", label: "Phone 1" },
  { key: "insight", href: "/insight", label: "Insight" },
  { key: "twin", href: "/twin", label: "The model" },
  { key: "vr", href: "/vr", label: "VR station" },
  { key: "spacetime", href: "/spacetime", label: "SpacetimeDB" },
] as const;

export type ScreenKey = (typeof SCREENS)[number]["key"];

// `search` (e.g. "?site=permian") is carried to every tab, so the next screen opens the same site.
export function ScreenNav({ current, search = "", className = "" }: { current: ScreenKey; search?: string; className?: string }) {
  const at = SCREENS.findIndex((x) => x.key === current);
  const pos = { "--at": at, "--c3": at % 3, "--r3": Math.floor(at / 3) } as React.CSSProperties;
  return (
    <nav aria-label="Avon screens" className={`${s.nav} ${className}`} style={pos}>
      <ul className={s.list}>
        {SCREENS.map((x) => (
          <li key={x.key}>
            <a href={`${x.href}${search}`} className={s.tab} aria-current={x.key === current ? "page" : undefined}>{x.label}</a>
          </li>
        ))}
      </ul>
      <span className={s.rail} aria-hidden="true"><span className={s.dot} /></span>
    </nav>
  );
}
