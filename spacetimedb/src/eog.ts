// Adapter between the reading table and the EOG engine in lib/eog (pure TypeScript, imported,
// not copied). finish_ingest rebuilds the same Dataset that loadDataset() makes from the files
// and runs the same buildConsole() the Node tests run.
import { buildConsole, type ConsoleView } from "../../lib/eog/alerts.ts";
import type { Dataset } from "../../lib/eog/load.ts";
import type { NetworkJson, OpsJson } from "../../lib/eog/types.ts";
import { datasetFromRows, type WideRow } from "./wide.ts";

export function datasetFromReadings(networkJson: string, opsJson: string, rows: Iterable<WideRow>): Dataset {
  return datasetFromRows(JSON.parse(networkJson) as NetworkJson, JSON.parse(opsJson) as OpsJson, rows);
}

export function consoleOf(ds: Dataset): ConsoleView {
  return buildConsole(ds);
}
