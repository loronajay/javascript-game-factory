// Copies tsc-emitted .mjs output for migrated .mts sources back in-place next to
// the source, so the statically-served site keeps loading the same .mjs paths.
//
// The browser tsconfig emits to dist/js (a staging dir) so that allowJs cannot
// overwrite the not-yet-migrated .mjs SOURCE files. This script then copies only
// the .mjs that correspond to a real .mts source back into js/. .mjs files that
// are still hand-written source are never touched.
//
// Run via `npm run build:browser` (tsc emit + this copy step).
//
// With `--check` it compares instead of copying, and fails if any in-place .mjs has
// drifted from what tsc emits. That is the drift guard: because the .mjs are generated,
// a stale one means someone hand-edited a build artifact, and the next person to run
// the build gets unrelated noise in their diff. Run via `npm run verify:build:browser`.

import { readdirSync, statSync, copyFileSync, existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const JS_ROOT = "js";
const OUT_ROOT = join("dist", "js");
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

const sources = collectMts(JS_ROOT);
let copied = 0;
let missing = 0;
const drifted = [];

for (const mts of sources) {
  const rel = relative(JS_ROOT, mts).replace(/\.mts$/, ".mjs");
  const emitted = join(OUT_ROOT, rel);
  const dest = join(JS_ROOT, rel);
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
    console.error(`sync-emitted-mjs: ${drifted.length} .mjs out of sync with their .mts:`);
    for (const rel of drifted) console.error(`  ! ${rel}`);
    console.error("Run `npm run build:browser` to regenerate. Do not hand-edit generated .mjs.");
  } else {
    console.log(`sync-emitted-mjs: all ${sources.length - missing} generated .mjs match their .mts`);
  }
} else {
  console.log(`sync-emitted-mjs: copied ${copied} compiled .mjs in-place` + (missing ? `, ${missing} missing` : ""));
}
if (missing || drifted.length) process.exitCode = 1;
