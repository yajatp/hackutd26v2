"use client";

import { useEffect, useRef, useState } from "react";
import type { DatasetFiles } from "@/lib/eog/load";
import { validateFiles, type Validation } from "@/lib/eog/validate";
import { AvonProvider, useAvonConsole, useAvonRtt, type AvonStatus } from "@/lib/live";
import { Board, ConnBanner } from "./Board";
import { ConnBadge, connState } from "@/app/ui/Badge";
import { Grain } from "@/app/ui/Grain";
import { LiveClock } from "@/app/ui/LiveClock";
import { NightGate } from "@/app/ui/NightGate";
import { ScreenHeader } from "@/app/ui/ScreenHeader";
import "@/app/ui/motion.css";
import s from "./console.module.css";
import { LockdownOverlay } from "./lockdown/LockdownOverlay";
import { unlockSound } from "./lockdown/sound";

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
  const sum = v.summary!;
  return (
    <div className="mt-2 text-sm text-muted tabular-nums">
      Checked {sum.readings.toLocaleString("en-US")} readings from {sum.systems} systems, {sum.facilities} facilities and
      {" "}{sum.wells} wells, every {Math.round(sum.step_s / 60)} min, {day(sum.start)} to {day(sum.end)} UTC.
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
      {/* Once per browser session; With sound also wakes the audio, from the click itself. */}
      <NightGate onChoose={(c) => { if (c === "on") unlockSound(); }} />
      <Grain />
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

  const dataAt = view ? new Date(view.now * 1000).toISOString().slice(0, 16).replace("T", " ") : "";
  const folderButtons = folders.map((f) => {
    const on = !!source && f.endsWith(source);
    return { f, on, name: f.split("/").pop()! };
  });

  return (
    <main className={s.main}>
      <ScreenHeader current="console" title="every site, one view" clock={<LiveClock dataUnix={view?.now ?? null} />}
        status={<LiveBadge conn={conn} />}>
        <p className={s.sub}>What broke, the cheapest fix, and which sensors to trust.</p>
        {/* For scripts/e2e (readConsole takes the dataset from the text before " · now "); the
            clock and the Site data line show the same to everyone else. */}
        {view && <span className="sr-only">{source} · now {dataAt} UTC</span>}
      </ScreenHeader>

      <div className={s.column}>
      {/* Before a site is loaded, loading one is the next action, so the buttons are big. After,
          the choice folds into one line: Site data, the loaded folder, and a list to switch. */}
      <section aria-label="Site data" className={view ? "mt-8" : "card mt-8"}>
        {view ? (
          <details className={s.picker}>
            <summary className={s.pickerSum}>
              <span>Site data</span>
              <span className={s.pickerNow}>{source}</span>
              <span aria-hidden="true" className={s.pickerCaret}>▾</span>
            </summary>
            <ul className={s.pickerList}>
              {folderButtons.map(({ f, on, name }) => (
                <li key={f}>
                  <button onClick={() => loadServerFolder(f)} aria-pressed={on} className={s.pickerItem}>
                    <span>{name}</span>{on && <span className={s.pickerOn}>loaded</span>}
                  </button>
                </li>
              ))}
              <li>
                <button onClick={() => pickRef.current?.click()} className={s.pickerItem}>Open a folder…</button>
              </li>
            </ul>
          </details>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-full text-lg font-semibold">Start here: load a site&apos;s data</span>
            {folderButtons.map(({ f, on, name }) => (
              <button key={f} onClick={() => loadServerFolder(f)} aria-pressed={on} className="btn btn-primary text-base">{name}</button>
            ))}
            <button onClick={() => pickRef.current?.click()} className="btn text-base">Open a folder…</button>
          </div>
        )}
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
      </div>
    </main>
  );
}
