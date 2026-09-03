#!/usr/bin/env node
// Copies this cabinet's pure simulation layer to `factory-network-server` and writes the manifest
// both repos check against.
//
// The failure mode of any mirror is silent drift: the physics get retuned here, the server keeps
// adjudicating on the old ones, and it scores rack after rack on a table that no longer exists
// while every suite stays green. So the mirrored files are copied **byte for byte** and the check
// is a plain hash comparison.
//
// `scripts/sim/` is exactly the mirrorable set, and it is mirrorable because of the rule
// `tests/modules.test.js` enforces: no THREE, no DOM, no clock, no ambient random. The one file
// left behind is `cpu.js`, which the server has no use for — the opponent online is a person.
//
//   node tools/mirror-sim.mjs          # copy + rewrite the manifest
//   node tools/mirror-sim.mjs --check  # verify only; non-zero exit if anything drifted
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cabinet = resolve(here, "..");
const simDir = join(cabinet, "scripts", "sim");
const server = resolve(cabinet, "..", "..", "..", "factory-network-server", "games", "shark-hall", "shared", "sim");

/** Left behind on purpose: the server never plays the CPU's turn. */
export const EXCLUDED = Object.freeze(["cpu.js"]);

/** Discovered rather than listed, so a new sim module cannot be forgotten. */
export function mirroredFiles(dir = simDir) {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".js") && !EXCLUDED.includes(name))
    .sort();
}

export const MANIFEST_NAME = "sim-mirror-manifest.json";

export function hashOf(text) {
  // Line endings are not content: a checkout with different git settings must not read as drift.
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

export function buildManifest(dir = simDir) {
  const files = {};
  for (const name of mirroredFiles(dir)) files[name] = hashOf(readFileSync(join(dir, name), "utf8"));
  return { generator: "games/shark-hall/tools/mirror-sim.mjs", files };
}

function main() {
  const check = process.argv.includes("--check");
  const manifest = buildManifest();
  const manifestPath = join(here, MANIFEST_NAME);

  if (check) {
    const recorded = JSON.parse(readFileSync(manifestPath, "utf8"));
    const names = new Set([...Object.keys(recorded.files), ...Object.keys(manifest.files)]);
    const drifted = [...names].filter((name) => recorded.files[name] !== manifest.files[name]);
    if (drifted.length) {
      console.error(`The pure layer changed without re-mirroring: ${drifted.join(", ")}`);
      console.error("Run `node tools/mirror-sim.mjs` and commit both repos.");
      process.exit(1);
    }
    console.log("Mirror manifest is current.");
    return;
  }

  if (!existsSync(server)) mkdirSync(server, { recursive: true });
  for (const name of mirroredFiles()) {
    writeFileSync(join(server, name), readFileSync(join(simDir, name), "utf8"));
  }
  // The server folder is ESM in its own right: these are `.js` files being imported by `.mjs`,
  // which Node only reads as modules when a package.json above them says so.
  writeFileSync(join(server, "..", "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`);
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(manifestPath, text);
  writeFileSync(join(server, MANIFEST_NAME), text);
  console.log(`Mirrored ${mirroredFiles().length} sim modules to ${server}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
