// Copies tsc-emitted .mjs output for migrated .mts sources back in-place next to
// the source in src/, so Railway's `node ./src/server.mjs` start command keeps
// working without any deploy-config change (mirror of the browser sync script).
//
// tsconfig emits to dist/ (a staging dir) so allowJs cannot overwrite the
// not-yet-migrated .mjs SOURCE files. This script then copies only the .mjs that
// correspond to a real .mts source back into src/. Hand-written .mjs are never touched.
//
// Run via `npm run build` (tsc emit + this copy step).

import { readdirSync, statSync, copyFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const SRC_ROOT = "src";
const OUT_ROOT = "dist";

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

for (const mts of sources) {
  const rel = relative(SRC_ROOT, mts).replace(/\.mts$/, ".mjs");
  const emitted = join(OUT_ROOT, rel);
  const dest = join(SRC_ROOT, rel);
  if (!existsSync(emitted)) {
    console.error(`  ! missing emit for ${rel} (expected ${emitted})`);
    missing += 1;
    continue;
  }
  copyFileSync(emitted, dest);
  copied += 1;
}

console.log(`sync-emitted-mjs (api): copied ${copied} compiled .mjs in-place` + (missing ? `, ${missing} missing` : ""));
if (missing) process.exitCode = 1;
