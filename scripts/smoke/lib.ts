// The TypeScript the smoke test runs through tsx (one tsImport, one copy of each module).
// Same code as the console, the box screens and scripts/verify.mjs.
export { openAvon, sendDataset } from "../../lib/live.ts";
export { DbConnection as DarkroomConnection, tables as darkroomTables } from "../../lib/darkroom_bindings/index.ts";
export { evidenceForIssue, refMatches } from "../../lib/evidence.ts";
export { advanceWitness, chainStatus } from "../../lib/rules/darkroom/status.ts";
export { rowToEvent } from "../../lib/rules/darkroom/replay.ts";
export { GENESIS_PREV } from "../../lib/chain.ts";
// The SDK logs "Connecting to SpacetimeDB WS..." at info; the smoke output keeps to PASS/FAIL.
export { setGlobalLogLevel } from "spacetimedb";
