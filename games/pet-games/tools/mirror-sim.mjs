#!/usr/bin/env node
// Copies the Pet Games' pure simulation layers to `factory-network-server` and
// writes the manifest both repos check against.
//
// Three folders are mirrored, and they keep their places relative to each
// other — `games/pet-games/shared/sim`, `games/barnyard-dash/scripts/sim` and
// `games/pondside-push/scripts/sim` land under the server's
// `games/pet-games/mirror/` at the same relative paths — so the imports between
// them (a race's CPU reaching for the shared rival pool) resolve on the server
// exactly as they do in a browser, with no file rewritten.
//
// The failure mode of any mirror is silent drift: a hurdle gets retuned here,
// the server keeps racing the old course, and every suite stays green. So the
// files are copied byte for byte and the check is a plain hash comparison.
//
// They are mirrorable because of the rule `tests/modules.test.js` enforces: no
// DOM, no clock, no ambient random, and no import that leaves the mirrored set.
//
//   node games/pet-games/tools/mirror-sim.mjs          # copy + rewrite the manifest
//   node games/pet-games/tools/mirror-sim.mjs --check  # verify only; non-zero exit if anything drifted
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..", "..");
const server = resolve(repo, "..", "factory-network-server", "games", "pet-games", "mirror");

/** The mirrored folders, relative to the repository root. */
export const MIRRORED_DIRS = Object.freeze([
  "games/pet-games/shared/sim",
  "games/barnyard-dash/scripts/sim",
  "games/pondside-push/scripts/sim",
]);

export const MANIFEST_NAME = "sim-mirror-manifest.json";

/** Discovered rather than listed, so a new sim module cannot be forgotten. */
export function mirroredFiles(root = repo) {
  return MIRRORED_DIRS.flatMap((dir) => readdirSync(join(root, dir))
    .filter((name) => name.endsWith(".js"))
    .sort()
    .map((name) => `${dir}/${name}`));
}

export function hashOf(text) {
  // Line endings are not content: a checkout with different git settings must not read as drift.
  return createHash("sha256").update(text.replace(/\r\n/g, "\n")).digest("hex");
}

export function buildManifest(root = repo) {
  const files = {};
  for (const path of mirroredFiles(root)) files[path] = hashOf(readFileSync(join(root, path), "utf8"));
  return { generator: "games/pet-games/tools/mirror-sim.mjs", files };
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
      console.error("Run `node games/pet-games/tools/mirror-sim.mjs` and commit both repos.");
      process.exit(1);
    }
    console.log("Mirror manifest is current.");
    return;
  }

  for (const path of mirroredFiles()) {
    const target = join(server, path);
    if (!existsSync(dirname(target))) mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, readFileSync(join(repo, path), "utf8"));
  }
  // `.js` files imported from `.mjs` are only ESM when a package.json above them says so.
  writeFileSync(join(server, "package.json"), `${JSON.stringify({ type: "module" }, null, 2)}\n`);
  const text = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(manifestPath, text);
  writeFileSync(join(server, MANIFEST_NAME), text);
  console.log(`Mirrored ${mirroredFiles().length} sim modules to ${server}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
