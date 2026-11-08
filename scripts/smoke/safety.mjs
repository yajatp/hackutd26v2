// Flags and safety rules for scripts/smoke.mjs. Every spacetime command goes to the LOCAL
// server; only the smoke databases are ever wiped.

export const SERVER = "avonlocal"; // spacetime server nickname for http://127.0.0.1:3001
export const HTTP = "http://127.0.0.1:3001";
export const WS = "ws://127.0.0.1:3001";
export const DEFAULT_FOLDER = "/home/mohan/hackutd/eog-data/history/mock_test_2026-10-10T1530";

// The real demo databases. The smoke test never wipes these, even when passed by name.
const PROTECTED = new Set(["avon", "darkroom"]);
const DB_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ALLOWED = new Set(["publish", "sql", "call"]);

export function isProtected(db) {
  return PROTECTED.has(db);
}

export function parseArgs(argv) {
  const o = { avonDb: "avon-smoke", darkroomDb: "darkroom-smoke", folder: DEFAULT_FOLDER, runs: 1 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--avon-db") o.avonDb = val();
    else if (a === "--darkroom-db") o.darkroomDb = val();
    else if (a === "--folder") o.folder = val();
    else if (a === "--runs") {
      const v = val();
      o.runs = Number(v);
      if (!/^\d+$/.test(v) || o.runs < 1) throw new Error(`--runs must be a whole number of 1 or more, got ${v}`);
    } else throw new Error(`unknown option ${a} (use --avon-db, --darkroom-db, --folder, --runs)`);
  }
  for (const db of [o.avonDb, o.darkroomDb]) {
    if (!DB_NAME.test(db)) throw new Error(`bad database name ${db}: lowercase letters, digits and dashes only`);
  }
  if (o.avonDb === o.darkroomDb) throw new Error("--avon-db and --darkroom-db must be different databases");
  return o;
}

// spacetime <sub> -s avonlocal <rest...>. Only publish, sql and call; never login.
export function spacetimeArgs(sub, ...rest) {
  if (!ALLOWED.has(sub)) throw new Error(`spacetime ${sub} is not allowed in the smoke test`);
  return [sub, "-s", SERVER, ...rest];
}

// A fresh database on every run, except the real ones: those are only ever updated in place.
export function publishArgs(modulePath, db) {
  const wipe = isProtected(db) ? [] : ["--delete-data=always"];
  return spacetimeArgs("publish", "--module-path", modulePath, ...wipe, "-y", db);
}
