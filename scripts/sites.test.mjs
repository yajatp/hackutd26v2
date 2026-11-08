import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

test("site keys and seeds are unique, coordinates are in the contiguous US, and Permian uses the base database", async () => {
  const { SITES, DEFAULT_SITE_KEY } = await tsImport("../lib/sites.ts", import.meta.url);
  const { siteDatabase } = await tsImport("../lib/live.ts", import.meta.url);
  assert.deepEqual(SITES.map(({ key }) => key).sort(), ["delaware", "dorado", "eagleford", "permian", "powder", "williston"]);
  assert.equal(new Set(SITES.map(({ seed }) => seed)).size, SITES.length);
  for (const { key, lat, lon, source } of SITES) {
    assert.ok(lat >= 24 && lat <= 50 && lon >= -125 && lon <= -66, key);
    assert.match(source, /^history\//);
    assert.equal(siteDatabase(key, "avon-hackutd26"), key === DEFAULT_SITE_KEY ? "avon-hackutd26" : `avon-hackutd26-${key}`);
  }
  assert.equal(siteDatabase(DEFAULT_SITE_KEY, "avon"), "avon");
  assert.equal(siteDatabase(null, "avon"), "avon");
});

test("fake-site center translates the retained facilities and landmarks together", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "avon-sites-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const source = join(dir, "source");
  await mkdir(source);
  const systems = [0, 1].map((i) => ({
    id: `S${i}`,
    center: [35 + i, -102],
    truck_yard: [34 + i, -103],
    disposal_site: { id: `D${i}`, lat: 34 + i, lon: -101, pressure_psi: 400 },
    facilities: [0, 1].map((j) => ({
      id: `F${i}${j}`, lat: 35 + i + j, lon: -102 + j, wells: [],
      tank: { id: `T${i}${j}`, capacity_bbl: 800 },
      pump: { id: `P${i}${j}`, max_flow_bpd: 800 },
      pipeline: { id: `L${i}${j}`, max_bpd: 800, max_pressure_psi: 800 },
    })),
  }));
  const ops = {
    prices: { oil_per_bbl: 66, gas_per_mcf: 3 },
    emergency_trucking: { cost_per_trip: 900, truck_capacity_bbl: 150 },
    systems: Object.fromEntries(systems.map(({ id, facilities }) => [id, {
      emergency_fleet_size: 3,
      facilities: Object.fromEntries(facilities.map((f) => [f.id, { response_min: 60, cycle_min: 180 }])),
    }])),
  };
  const rows = systems.flatMap((s) => s.facilities.map((f) => `2026-01-01T00:00:00Z,1767225600,${f.tank.id},level_pct,42\n`));
  await Promise.all([
    writeFile(join(source, "network.json"), JSON.stringify({ systems })),
    writeFile(join(source, "ops.json"), JSON.stringify(ops)),
    writeFile(join(source, "telemetry.csv"), "timestamp,ts_unix,asset_id,metric,value\n" + rows.join("")),
  ]);

  const script = fileURLToPath(new URL("make-fake-site.mjs", import.meta.url));
  const generate = async (output, ...args) => {
    execFileSync(process.execPath, [script, source, join(dir, output), "--seed", "-4", ...args]);
    return JSON.parse(await readFile(join(dir, output, "network.json"), "utf8"));
  };
  const original = await generate("original");
  const centered = await generate("centered", "--name", "Eagle Ford", "--center", "29,-98");
  assert.equal(centered.name, "Eagle Ford");
  assert.deepEqual(centered, await generate("repeat", "--center", "29,-98", "--name", "Eagle Ford"));

  const [before] = original.systems;
  const [after] = centered.systems;
  assert.equal(after.id, before.id);
  const [a, b] = after.facilities;
  assert.equal((a.lat + b.lat) / 2, 29);
  assert.equal((a.lon + b.lon) / 2, -98);
  const dLat = a.lat - before.facilities[0].lat;
  const dLon = a.lon - before.facilities[0].lon;
  assert.deepEqual([b.lat, b.lon], [before.facilities[1].lat + dLat, before.facilities[1].lon + dLon]);
  for (const key of ["center", "truck_yard"]) {
    assert.deepEqual(after[key], [before[key][0] + dLat, before[key][1] + dLon]);
  }
  assert.deepEqual([after.disposal_site.lat, after.disposal_site.lon], [before.disposal_site.lat + dLat, before.disposal_site.lon + dLon]);
});
