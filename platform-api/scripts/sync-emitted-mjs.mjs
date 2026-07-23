// Copies tsc-emitted .mjs output for migrated .mts sources back in-place next to
// the source in src/, so Railway's `node ./src/server.mjs` start command keeps
// working without any deploy-config change (mirror of the browser sync script).
//
// tsconfig emits to dist/ (a staging dir) so allowJs cannot overwrite the
// not-yet-migrated .mjs SOURCE files. This script then copies only the .mjs that
// correspond to a real .mts source back into src/. Hand-written .mjs are never touched.
//
// Run via `npm run build` (tsc emit + this copy step).
//
// With `--check` it compares instead of copying, and fails if any in-place .mjs has
// drifted from what tsc emits. That is the drift guard: because the .mjs are generated,
// a stale one means someone hand-edited a build artifact, and the next person to run
// the build gets unrelated noise in their diff. Run via `npm run verify:build`.

import { readdirSync, statSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_ROOT = "src";
const OUT_ROOT = "dist";
const checkOnly = process.argv.includes("--check");

function collectMts(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      collectMts(full, acc);
    } else if (name.endsWith(".mts")) {
      acc.push(full);
    }
  }
  return acc;
}

const sources = collectMts(SRC_ROOT);
let copied = 0;
let missing = 0;
const drifted = [];

for (const mts of sources) {
  const rel = relative(SRC_ROOT, mts).replace(/\.mts$/, ".mjs");
  const emitted = join(OUT_ROOT, rel);
  const dest = join(SRC_ROOT, rel);
  if (!existsSync(emitted)) {
    console.error(`  ! missing emit for ${rel} (expected ${emitted})`);
    missing += 1;
    continue;
  }
  if (checkOnly) {
    if (!existsSync(dest) || !readFileSync(emitted).equals(readFileSync(dest))) {
      drifted.push(rel);
    }
    continue;
  }
  copyFileSync(emitted, dest);
  copied += 1;
}

if (checkOnly) {
  if (drifted.length) {
    console.error(`sync-emitted-mjs (api): ${drifted.length} .mjs out of sync with their .mts:`);
    for (const rel of drifted) console.error(`  ! ${rel}`);
    console.error("Run `npm run build` to regenerate. Do not hand-edit generated .mjs.");
  } else {
    console.log(`sync-emitted-mjs (api): all ${sources.length - missing} generated .mjs match their .mts`);
  }
} else {
  console.log(`sync-emitted-mjs (api): copied ${copied} compiled .mjs in-place` + (missing ? `, ${missing} missing` : ""));
}
if (missing || drifted.length) process.exitCode = 1;
