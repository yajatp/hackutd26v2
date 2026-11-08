"use client";

import { useEffect, useRef, useState } from "react";
import type { DatasetFiles } from "@/lib/eog/load";
import { validateFiles, type Validation } from "@/lib/eog/validate";
import { AvonProvider, useAvonConsole } from "@/lib/live";
import { Board, ConnBanner } from "./Board";

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

function day(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(5, 16).replace("T", " ");
}

function Checked({ v }: { v: Validation }) {
  const s = v.summary!;
  return (
    <div className="mt-2 text-xs opacity-70 tabular-nums">
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
    <main className="mx-auto max-w-4xl p-4 font-sans sm:p-8">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-current/15 pb-3">
        <h1 className="text-lg font-bold">Avon <span className="font-normal opacity-60">· every site, one view</span></h1>
        {view && (
          <p className="text-sm tabular-nums opacity-70">
            {source} · now {new Date(view.now * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC
          </p>
        )}
      </header>

      <section className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="opacity-60">Load a site:</span>
        {folders.map((f) => (
          <button key={f} onClick={() => loadServerFolder(f)}
            className={`rounded border px-2 py-1 hover:bg-current/5 ${f.endsWith(source) && source ? "border-current" : "border-current/20"}`}>
            {f.split("/").pop()}
          </button>
        ))}
        <button onClick={() => pickRef.current?.click()} className="rounded border border-current/20 px-2 py-1 hover:bg-current/5">
          Open a folder…
        </button>
        <input ref={pickRef} type="file" multiple hidden onChange={(e) => loadPicked(e.target.files)}
          {...{ webkitdirectory: "" }} />
      </section>

      <ConnBanner conn={conn} />
      {status.kind === "busy" && <p className="mt-6 animate-pulse">{status.what}…</p>}
      {status.kind === "error" && (
        <div className="mt-6 rounded border border-red-500 p-3 text-red-600 dark:text-red-400">
          <p className="font-semibold">This folder can&apos;t be used yet. Nothing was planned from it.</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{status.msg.split("\n").map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {view && status.kind === "idle" && validation?.ok && validation.summary && <Checked v={validation} />}
      {view && status.kind === "idle" && <Board view={view} dataset={source} />}
      {!view && status.kind === "idle" && (
        <p className="mt-10 opacity-60">Pick a site above, or open any folder that holds network.json, ops.json and telemetry.csv.</p>
      )}
    </main>
  );
}
