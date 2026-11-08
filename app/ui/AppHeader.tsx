import type { ReactNode } from "react";

// The same header on every screen: product name, what this screen is, then status on the right.
// Avon on /console and /attack; Darkroom on /box and /witness.
export function AppHeader({ product, title, sub, children }: { product: "Avon" | "Darkroom"; title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line pb-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight">
          {product}
          <span className="font-normal text-muted"> · {title}</span>
        </h1>
        {sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 text-sm text-muted">{children}</div>}
    </header>
  );
}
