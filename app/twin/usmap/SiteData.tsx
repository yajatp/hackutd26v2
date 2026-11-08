"use client";
// The picked site's live data for the whole /twin tree, switched WITHOUT remounting the tree: the
// canvas (and so the headset's XR session) stays up while the data moves to another site database.
// How: a keyed <AvonProvider> per site (lib/live.ts, siteDatabase) mounts only a tiny <Feed>,
// which hands its value up; the value is then provided over the screen through the same React
// context that useAvonConsole() reads. That context object is found once, by walking up from a
// probe element to the layout's own <AvonProvider>. If the walk ever fails, `bridged` is false
// and the caller falls back to a plain navigation.
import { useCallback, useLayoutEffect, useRef, useState, type Context, type ReactNode } from "react";
import { AvonProvider, useAvonConsole, type AvonConsole } from "@/lib/live";

const CONTEXT = Symbol.for("react.context");

type FiberLike = { type: unknown; memoizedProps?: { value?: unknown } | null; return: FiberLike | null };

// The nearest context provider above `el` whose value is `value` (React 19: the provider's fiber
// type is the context itself; React 18: { _context }).
function providerOf(el: Element, value: unknown): Context<AvonConsole | null> | null {
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
  let f = key ? ((el as unknown as Record<string, FiberLike>)[key] ?? null) : null;
  while (f) {
    const t = f.type as { $$typeof?: symbol; _context?: unknown } | null;
    if (t && typeof t === "object" && f.memoizedProps?.value === value) {
      if (t.$$typeof === CONTEXT) return t as unknown as Context<AvonConsole | null>;
      if (t._context && (t._context as { $$typeof?: symbol }).$$typeof === CONTEXT) return t._context as Context<AvonConsole | null>;
    }
    f = f.return;
  }
  return null;
}

function Feed({ db, onValue }: { db: string; onValue(db: string, v: AvonConsole): void }) {
  const v = useAvonConsole();
  useLayoutEffect(() => { onValue(db, v); }, [db, v, onValue]);
  return null;
}

// `db`: the site database to show; `home`: the one the layout's provider already reads (the URL's
// site at load), which needs no second connection.
export function SiteData({ db, home, children, onBridge }: { db: string; home: string; children: ReactNode; onBridge?(ok: boolean): void }) {
  const homeValue = useAvonConsole();
  const probe = useRef<HTMLSpanElement>(null);
  const [ctx, setCtx] = useState<Context<AvonConsole | null> | null | undefined>(undefined);
  const [fed, setFed] = useState<{ db: string; v: AvonConsole } | null>(null);
  useLayoutEffect(() => {
    if (ctx !== undefined || !probe.current) return;
    const c = providerOf(probe.current, homeValue);
    setCtx(c);
    onBridge?.(c !== null);
  }, [ctx, homeValue, onBridge]);
  const onValue = useCallback((d: string, v: AvonConsole) => setFed({ db: d, v }), []);

  const away = db !== home;
  // Until the new site's first value lands (one layout pass), show it as connecting and empty
  // rather than the previous site.
  const value: AvonConsole = !away ? homeValue
    : fed && fed.db === db ? fed.v
      : { ...homeValue, status: "connecting", view: null, source: null, facilities: [], targets: [], faults: [], confirmations: {}, lockdown: null };
  return (
    <>
      <span ref={probe} hidden />
      {away && ctx && (
        <AvonProvider key={db} database={db}>
          <Feed db={db} onValue={onValue} />
        </AvonProvider>
      )}
      {ctx === undefined ? null : ctx === null ? children : <ctx.Provider value={value}>{children}</ctx.Provider>}
    </>
  );
}
