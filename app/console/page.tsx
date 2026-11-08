"use client";

import { useEffect, useRef, useState } from "react";
import type { DatasetFiles } from "@/lib/eog/load";
import { validateFiles, type Validation } from "@/lib/eog/validate";
import { AvonProvider, useAvonConsole, useAvonRtt, type AvonStatus } from "@/lib/live";
import { Board, ConnBanner } from "./Board";
import { AppHeader } from "@/app/ui/AppHeader";
import { ConnBadge, connState } from "@/app/ui/Badge";
import { LockdownOverlay } from "./lockdown/LockdownOverlay";

type Status = { kind: "idle" } | { kind: "busy"; what: string } | { kind: "error"; msg: string };

const NAMES = ["network.json", "ops.json", "telemetry.csv"] as const;

// The view comes only from the Spacetime subscription: loading a folder checks it here, then
// sends it to the avon database, where finish_ingest runs the engine and every screen updates.
function useConsoleData() {
  const avon = useAvonConsole();
  const [validation, setValidation] = useState<Validation | null>(null);
  async function load(files: DatasetFiles, name: string) {
    await new Promise((r) => setTimeout(r, 0));    // let "Reading" paint before the heavy work
    const { validation: v } = validateFiles(files);
    setValidation(v);
    if (!v.ok) throw new Error(v.errors.join("\n"));
    await avon.load(files, name);
  }
  return { view: avon.view, conn: avon.status, source: avon.source?.datasetId ?? "", validation, load };
}

// Its own component: the round trip updates every 5 s without re-rendering the board.
function LiveBadge({ conn }: { conn: AvonStatus }) {
  return <ConnBadge state={connState(conn)} ms={useAvonRtt()} />;
}

function day(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(5, 16).replace("T", " ");
}

function Checked({ v }: { v: Validation }) {
  const s = v.summary!;
  return (
    <div className="mt-2 text-sm text-muted tabular-nums">
      Checked: {s.readings.toLocaleString("en-US")} readings · {s.systems} systems · {s.facilities} facilities ·
      {" "}{s.wells} wells · every {Math.round(s.step_s / 60)} min · {day(s.start)} to {day(s.end)} UTC
      {v.warnings.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer">{v.warnings.length} data warning{v.warnings.length > 1 ? "s" : ""}</summary>
          <ul className="mt-1 list-disc pl-5">{v.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </details>
      )}
    </div>
  );
}

export default function ConsolePage() {
  return (
    <AvonProvider>
      <ConsoleScreen />
    </AvonProvider>
  );
}

function ConsoleScreen() {
  const [folders, setFolders] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const pickRef = useRef<HTMLInputElement>(null);
  const { view, conn, source, validation, load } = useConsoleData();

  useEffect(() => {
    fetch("/api/eog").then((r) => r.json()).then((j) => setFolders(j.folders ?? [])).catch(() => setFolders([]));
  }, []);

  async function run(name: string, get: () => Promise<DatasetFiles>) {
    setStatus({ kind: "busy", what: `Reading ${name}` });
    try {
      await load(await get(), name);
      setStatus({ kind: "idle" });
    } catch (e) {
      setStatus({ kind: "error", msg: `${name}: ${e instanceof Error ? e.message : String(e)}` });
    }
  }

  function loadServerFolder(folder: string) {
    run(folder.split("/").pop()!, async () => {
      const [network, ops, telemetry] = await Promise.all(NAMES.map(async (n) => {
        const r = await fetch(`/api/eog?folder=${encodeURIComponent(folder)}&file=${n}`);
        if (!r.ok) throw new Error(`missing ${n}`);
        return r.text();
      }));
      return { network, ops, telemetry };
    });
  }

  function loadPicked(list: FileList | null) {
    if (!list || list.length === 0) return;
    const byName = new Map<string, File>();
    for (const f of Array.from(list)) byName.set(f.name, f);    // answer_key.json is never read
    const name = list[0].webkitRelativePath.split("/")[0] || "picked files";
    const missing = NAMES.filter((n) => !byName.has(n));
    if (missing.length) {
      setStatus({ kind: "error", msg: `${name}: missing ${missing.join(", ")}` });
      return;
    }
    run(name, async () => {
      const [network, ops, telemetry] = await Promise.all(NAMES.map((n) => byName.get(n)!.text()));
      return { network, ops, telemetry };
    });
  }

  return (
    <main className="mx-auto max-w-4xl p-4 sm:p-8">
      <AppHeader product="Avon" title="every site, one view" sub="What broke, the cheapest fix, and which sensors to trust.">
        {view && (
          <span className="tabular-nums">
            {source} · now {new Date(view.now * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC
          </span>
        )}
        <LiveBadge conn={conn} />
      </AppHeader>

      {/* Before a site is loaded, loading one is the next action, so the buttons are big. After, they step back. */}
      <section aria-label="Site data" className={`flex flex-wrap items-center gap-2 ${view ? "mt-3 text-sm" : "card mt-6"}`}>
        <span className={view ? "text-muted" : "w-full text-lg font-semibold"}>{view ? "Site data:" : "Start here: load a site's data"}</span>
        {folders.map((f) => {
          const on = !!source && f.endsWith(source);
          return (
            <button key={f} onClick={() => loadServerFolder(f)} aria-pressed={on}
              className={`btn ${view ? `min-h-8 px-2.5 py-1 ${on ? "btn-on" : "font-normal"}` : "btn-primary text-base"}`}>
              {on && <span aria-hidden="true">✓ </span>}{f.split("/").pop()}
            </button>
          );
        })}
        <button onClick={() => pickRef.current?.click()} className={`btn ${view ? "min-h-8 px-2.5 py-1 font-normal" : "text-base"}`}>
          Open a folder…
        </button>
        <input ref={pickRef} type="file" multiple hidden onChange={(e) => loadPicked(e.target.files)}
          {...{ webkitdirectory: "" }} />
      </section>

      <ConnBanner conn={conn} />
      {status.kind === "busy" && <p role="status" className="mt-6 animate-pulse text-lg font-semibold">{status.what}…</p>}
      {status.kind === "error" && (
        <div role="alert" className="mt-6 rounded-lg border-2 border-alert-line bg-alert-bg p-3 text-alert">
          <p className="font-semibold">▲ This folder can&apos;t be used yet. Nothing was planned from it.</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{status.msg.split("\n").map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {view && status.kind === "idle" && validation?.ok && validation.summary && <Checked v={validation} />}
      {view && status.kind === "idle" && <Board view={view} dataset={source} />}
      <LockdownOverlay />
      {!view && status.kind === "idle" && (
        <p className="mt-4 text-muted">Pick a site above, or open any folder that holds network.json, ops.json and telemetry.csv.</p>
      )}
    </main>
  );
}
