"use client";

import { useSyncExternalStore } from "react";
import { DARKROOM_DB, useDarkroom } from "../../lib/darkroom-live";
import { ReportView } from "./ReportView";

const noop = () => () => {};

// The same live store /box uses: the report is a replay of the log on this box, never a stored status.
export default function ReportScreen({ requested }: { requested: string }) {
  const s = useDarkroom();
  // The box's address as this browser reached it, for the verifier command.
  const host = useSyncExternalStore(noop, () => window.location.hostname, () => "");
  return <ReportView s={s} requested={requested} host={host} db={DARKROOM_DB} />;
}
