import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const HEADER = "timestamp,ts_unix,asset_id,metric,value";
const FLOW_METRICS = new Set(["inflow_bpd", "water_bpd", "flow_bpd", "receive_flow_bpd"]);
const PRESSURE_METRICS = new Set(["pressure_psi", "discharge_psi"]);

function seededRandom(seed) {
  let draw = 0;
  return () => createHash("sha256").update(`${seed}:${draw++}`).digest().readUInt32BE() / 2 ** 32;
}

function transformSite(network, ops, seed) {
  if (network.systems.length < 2) throw new Error("network.json needs at least two systems");
  const random = seededRandom(seed);
  const integer = (min, max) => min + Math.floor(random() * (max - min + 1));
  const differentInteger = (min, max, oldValue) => {
    const value = integer(min, max);
    if (value !== oldValue) return value;
    return value === max ? min : value + 1;
  };
  const droppedIndex = integer(0, network.systems.length - 1);
  const seconds = integer(14, 90) * 86400;

  const assets = new Map();
  const register = (asset, kind, dropped, scale, pressureShift) => {
    const oldId = asset.id;
    const suffix = createHash("sha256").update(`${seed}:${oldId}`).digest("hex").slice(0, 12);
    asset.id = `${kind}-${suffix}`;
    assets.set(oldId, { id: asset.id, dropped, scale, pressureShift });
  };

  const systems = [];
  const systemOps = {};
  for (const [index, system] of network.systems.entries()) {
    const dropped = index === droppedIndex;
    const pressureShift = differentInteger(-150, 200, 0);
    const sourceOps = ops.systems[system.id];
    register(system, "Region", dropped, 1, pressureShift);
    register(system.disposal_site, "Disposal", dropped, 1, pressureShift);
    system.disposal_site.pressure_psi += pressureShift;

    const facilities = {};
    for (const facility of system.facilities) {
      const route = sourceOps.facilities[facility.id];
      const scale = 0.8 + random() * 0.5;
      for (const [kind, asset] of [
        ["Facility", facility], ["Tank", facility.tank], ["Pump", facility.pump],
        ["Line", facility.pipeline], ...facility.wells.map((well) => ["Well", well]),
      ]) {
        register(asset, kind, dropped, scale, pressureShift);
      }
      facility.tank.capacity_bbl *= scale;
      facility.pump.max_flow_bpd *= scale;
      facility.pipeline.max_bpd *= scale;
      facility.pipeline.max_pressure_psi += pressureShift;
      for (const well of facility.wells) well.baseline_water_bpd *= scale;

      facilities[facility.id] = {
        ...route,
        response_min: differentInteger(45, 110, route.response_min),
        cycle_min: differentInteger(180, 290, route.cycle_min),
      };
    }

    if (dropped) continue;
    systems.push(system);
    systemOps[system.id] = {
      ...sourceOps,
      emergency_fleet_size: differentInteger(1, 4, sourceOps.emergency_fleet_size),
      facilities,
    };
  }

  network.systems = systems;
  if (ops.dataset_id) ops.dataset_id = `fake-${systems[0].id}`;
  ops.systems = systemOps;
  ops.prices = {
    oil_per_bbl: differentInteger(5500, 8000, Math.round(ops.prices.oil_per_bbl * 100)) / 100,
    gas_per_mcf: differentInteger(200, 400, Math.round(ops.prices.gas_per_mcf * 100)) / 100,
  };
  ops.emergency_trucking = {
    cost_per_trip: differentInteger(650, 1300, ops.emergency_trucking.cost_per_trip),
    truck_capacity_bbl: differentInteger(110, 210, ops.emergency_trucking.truck_capacity_bbl),
  };
  return { assets, seconds };
}

const isoTime = (unix) => new Date(unix * 1000).toISOString().replace(/\.000Z$/, "Z");

async function* transformTelemetry(path, assets, seconds) {
  const input = await open(path);
  try {
    let lineNumber = 0;
    let previousUnix;
    let shiftedUnix;
    let shiftedTimestamp;
    for await (const line of input.readLines()) {
      lineNumber++;
      if (lineNumber === 1) {
        if (line.trim() !== HEADER) throw new Error("telemetry.csv: unexpected header");
        yield HEADER + "\n";
        continue;
      }
      if (!line.trim()) continue;

      const [, unix, assetId, metric, value] = line.split(",");
      const asset = assets.get(assetId);
      if (value === undefined || !unix?.trim() || !Number.isSafeInteger(Number(unix)) || !asset) {
        throw new Error(`telemetry.csv:${lineNumber}: invalid row or unknown asset`);
      }
      if (asset.dropped) continue;

      if (unix !== previousUnix) {
        shiftedUnix = Number(unix) + seconds;
        shiftedTimestamp = isoTime(shiftedUnix);
        previousUnix = unix;
      }

      let shiftedValue = value;
      if (value.trim()) {
        const reading = Number(value);
        if (!Number.isFinite(reading)) throw new Error(`telemetry.csv:${lineNumber}: invalid reading`);
        if (FLOW_METRICS.has(metric)) shiftedValue = reading * asset.scale;
        if (PRESSURE_METRICS.has(metric)) shiftedValue = reading + asset.pressureShift;
      }
      yield `${shiftedTimestamp},${shiftedUnix},${asset.id},${metric},${shiftedValue}\n`;
    }
    if (shiftedUnix === undefined) throw new Error("telemetry.csv: no readings for the retained systems");
  } finally {
    await input.close();
  }
}

function transformAnswers(events, assets, seconds) {
  return events.flatMap((event) => {
    if (assets.get(event.system).dropped) return [];
    const result = { ...event };
    for (const field of ["system", "facility", "asset"]) result[field] = assets.get(result[field]).id;
    for (const field of ["onset", "end", "trips_at"]) {
      const unix = field + "_unix";
      if (result[unix] == null) continue;
      result[unix] += seconds;
      result[field] = isoTime(result[unix]);
    }
    // These refer to the source site's economics or price-dependent alert ordering.
    for (const field of ["reference_action", "lost_revenue_per_hour", "order"]) delete result[field];
    return [result];
  });
}

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n");

async function main(args) {
  const [source, output, flag, seed = "0"] = args;
  if (!source || !output || (args.length !== 2 && (args.length !== 4 || flag !== "--seed" || !/^-?\d+$/.test(seed)))) {
    throw new Error("Usage: node scripts/make-fake-site.mjs <source folder> <out folder> [--seed N]");
  }

  const [network, ops, events] = await Promise.all([
    readJson(join(source, "network.json")),
    readJson(join(source, "ops.json")),
    readJson(join(source, "answer_key.json")).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    }),
  ]);
  const { assets, seconds } = transformSite(network, ops, BigInt(seed).toString());
  const destination = resolve(output);
  const parent = dirname(destination);
  await mkdir(parent, { recursive: true });
  // Publish only after all files are complete. Renaming also protects an existing dataset.
  const staging = await mkdtemp(join(parent, ".fake-site-"));
  try {
    await writeJson(join(staging, "network.json"), network);
    await writeJson(join(staging, "ops.json"), ops);
    await pipeline(
      Readable.from(transformTelemetry(join(source, "telemetry.csv"), assets, seconds)),
      createWriteStream(join(staging, "telemetry.csv")),
    );
    if (events) await writeJson(join(staging, "answer_key.json"), transformAnswers(events, assets, seconds));
    await rename(staging, destination);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
