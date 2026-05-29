// Copies tsc-emitted .mjs output for migrated .mts sources back in-place next to
// the source, so the statically-served site keeps loading the same .mjs paths.
//
// The browser tsconfig emits to dist/js (a staging dir) so that allowJs cannot
// overwrite the not-yet-migrated .mjs SOURCE files. This script then copies only
// the .mjs that correspond to a real .mts source back into js/. .mjs files that
// are still hand-written source are never touched.
//
// Run via `npm run build:browser` (tsc emit + this copy step).

import { readdirSync, statSync, copyFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const JS_ROOT = "js";
const OUT_ROOT = join("dist", "js");

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

for (const mts of sources) {
  const rel = relative(JS_ROOT, mts).replace(/\.mts$/, ".mjs");
  const emitted = join(OUT_ROOT, rel);
  const dest = join(JS_ROOT, rel);
  if (!existsSync(emitted)) {
    console.error(`  ! missing emit for ${rel} (expected ${emitted})`);
    missing += 1;
    continue;
  }
  copyFileSync(emitted, dest);
  copied += 1;
}

console.log(`sync-emitted-mjs: copied ${copied} compiled .mjs in-place` + (missing ? `, ${missing} missing` : ""));
if (missing) process.exitCode = 1;
