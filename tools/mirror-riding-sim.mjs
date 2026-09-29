#!/usr/bin/env node
// Copies the riding set — the pure files a horse is ridden on at Windrush Downs
// (planning-docs/FARM_RIDING_PLAN.md) — to the two servers that ride it again:
//
//   platform-api/src/riding-sim/*.mts          the API replays a course run from its reins
//   ../factory-network-server/games/farm-downs/mirror/*.mjs   the race room runs a race
//
// The failure mode of any mirror is silent drift: the horse gets retuned here,
// a server keeps judging on the old numbers, and every suite stays green. So the
// files are copied byte for byte and checked by hash; the manifest is written
// here and into both copies.
//
// The set is closed — none of these files imports anything outside it — and
// `js/tests/farm-riding-mirror.test.mjs` asserts that, so a new import cannot
// quietly break a server.
//
//   node tools/mirror-riding-sim.mjs          # copy + rewrite the manifest (run `npm run build:browser` first)
//   node tools/mirror-riding-sim.mjs --check  # verify only; non-zero exit if anything drifted
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..");
const js = join(repo, "js");
export const API_TARGET = join(repo, "platform-api", "src", "riding-sim");
export const NETWORK_TARGET = resolve(repo, "..", "factory-network-server", "games", "farm-downs", "mirror");
export const MANIFEST_NAME = "riding-sim-manifest.json";

/** The riding set, by module name. */
export const RIDING_SET = Object.freeze([
  "farm-ride-geometry",
  "farm-ride",
  "farm-ride-profile",
  "farm-riding-skill",
  "farm-horse-riding",
  "farm-pet-growth",
  "downs-terrain",
  "downs-scene",
  "downs-course",
  "downs-race",
  "downs-replay",
]);

export function hashOf(text) {
  // Line endings are not content.
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

export function buildManifest() {
  const sources = {};
  const emitted = {};
  for (const name of RIDING_SET) {
    sources[`${name}.mts`] = hashOf(readFileSync(join(js, `${name}.mts`), "utf8"));
    emitted[`${name}.mjs`] = hashOf(readFileSync(join(js, `${name}.mjs`), "utf8"));
  }
  return { generator: "tools/mirror-riding-sim.mjs", sources, emitted };
}

function main() {
  const check = process.argv.includes("--check");
  const manifest = buildManifest();
  const manifestPath = join(here, MANIFEST_NAME);
  if (check) {
    const recorded = JSON.parse(readFileSync(manifestPath, "utf8"));
    const drifted = [];
    for (const group of ["sources", "emitted"]) {
      const names = new Set([...Object.keys(recorded[group] ?? {}), ...Object.keys(manifest[group])]);
      for (const name of names) if (recorded[group]?.[name] !== manifest[group][name]) drifted.push(name);
    }
    if (drifted.length) {
      console.error(`The riding set changed without re-mirroring: ${drifted.join(", ")}`);
      console.error("Run `npm run build:browser && node tools/mirror-riding-sim.mjs` and commit both repos.");
      process.exit(1);
    }
    console.log("Riding mirror manifest is current.");
    return;
  }
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  mkdirSync(API_TARGET, { recursive: true });
  for (const name of RIDING_SET) writeFileSync(join(API_TARGET, `${name}.mts`), readFileSync(join(js, `${name}.mts`), "utf8"));
  writeFileSync(join(API_TARGET, MANIFEST_NAME), text);
  if (existsSync(dirname(dirname(NETWORK_TARGET)))) {
    mkdirSync(NETWORK_TARGET, { recursive: true });
    for (const name of RIDING_SET) writeFileSync(join(NETWORK_TARGET, `${name}.mjs`), readFileSync(join(js, `${name}.mjs`), "utf8"));
    writeFileSync(join(NETWORK_TARGET, MANIFEST_NAME), text);
  } else {
    console.warn(`factory-network-server not found beside this repo; only the API copy was written.`);
  }
  writeFileSync(manifestPath, text);
  console.log(`Mirrored ${RIDING_SET.length} riding modules to platform-api and the network server.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
