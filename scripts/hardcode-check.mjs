import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const reference = resolve(root, "../eog-data/history/full_week");
const readJson = (name) => JSON.parse(readFileSync(join(reference, name), "utf8"));
const skipped = new Set(["__fixtures__", "module_bindings", "node_modules"]);
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".json", ".css", ".html", ".md", ".mdx"]);
const testFile = /\.(?:test|spec)\.[^.]+$/;
const numberLiteral = /(?<![\w.])(?:0x[\da-f](?:_?[\da-f])*|0b[01](?:_?[01])*|0o[0-7](?:_?[0-7])*|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:e[+-]?\d(?:_?\d)*)?)(?![\w.])/gi;
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function* sourceFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && !skipped.has(entry.name)) yield* sourceFiles(path);
    if (entry.isFile() && extensions.has(extname(entry.name)) && !testFile.test(entry.name)) yield path;
  }
}

function scan() {
  const network = readJson("network.json");
  const ops = readJson("ops.json");
  const systems = network.systems;
  const facilities = systems.flatMap((system) => system.facilities);
  const wells = facilities.flatMap((facility) => facility.wells);
  const ids = [
    ...systems, ...systems.map((system) => system.disposal_site), ...facilities, ...wells,
    ...facilities.flatMap(({ tank, pump, pipeline }) => [tank, pump, pipeline]),
  ].map(({ id }) => escapeRegex(id));
  const assetId = new RegExp(`(?<![\\w$])(?:${ids.join("|")})(?![\\w$])`);

  const routes = Object.values(ops.systems).flatMap((system) => Object.values(system.facilities));
  // Common numbers need context: 60 is usually a time conversion, and 150 can be a timeout.
  const checks = [
    [null, [ops.emergency_trucking.cost_per_trip]],
    [/truck.?cap|truck.*(?:bbl|barrel)|(?:bbl|barrel).*truck/i, [ops.emergency_trucking.truck_capacity_bbl]],
    [/\boil\b|oil.*(?:price|bbl|barrel)|price.*oil|prices?\s*[:=]/i, [ops.prices.oil_per_bbl]],
    [/\bgas\b|gas.*(?:price|mcf)|price.*gas|prices?\s*[:=]/i, [ops.prices.gas_per_mcf]],
    [/fleet/i, Object.values(ops.systems).map((system) => system.emergency_fleet_size)],
    [/response.?min|response.?time/i, routes.map((route) => route.response_min)],
    [/cycle.?min|cycle.?time/i, routes.map((route) => route.cycle_min)],
    [/repair.?(?:hours?|horizon)/i, [ops.expected_repair_hours.pump_failure]],
    [/shutdown/i, [network.defaults.tank_limits_pct.shutdown]],
    [/warning/i, [network.defaults.tank_limits_pct.warning]],
    [/tank.*cap|capacity.?bbl/i, facilities.map(({ tank }) => tank.capacity_bbl)],
    [/max.?flow/i, facilities.map(({ pump }) => pump.max_flow_bpd)],
    [/baseline.?water/i, wells.map((well) => well.baseline_water_bpd)],
    [/disposal|pressure|discharge|psi/i, systems.map((system) => system.disposal_site.pressure_psi)],
    // Nominal pressure offsets are in the EOG spec, separate from disposal pressures.
    [/pressure|discharge|psi|offset/i, [150, 50]],
  ].map(([context, values]) => [context, new Set(values)]);

  const sourceRoots = ["app", "lib"];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("spacetimedb")) continue;
    if (readdirSync(join(root, entry.name), { withFileTypes: true }).some((child) => child.isDirectory() && child.name === "src")) {
      sourceRoots.push(join(entry.name, "src"));
    }
  }

  let found = false;
  for (const dir of sourceRoots) {
    for (const path of sourceFiles(join(root, dir))) {
      const lines = readFileSync(path, "utf8").split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        const numbers = Array.from(line.matchAll(numberLiteral), ([literal]) => Number(literal.replaceAll("_", "")));
        if (assetId.test(line) || checks.some(([context, values]) =>
          (!context || context.test(line)) && numbers.some((value) => values.has(value))
        )) {
          console.log(`${relative(root, path)}:${index + 1}: ${line.trim()}`);
          found = true;
        }
      }
    }
  }
  return found;
}

try {
  if (scan()) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
