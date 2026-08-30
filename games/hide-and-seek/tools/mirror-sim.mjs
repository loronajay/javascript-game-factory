#!/usr/bin/env node
// Copies the cabinet's pure simulation layer to `factory-network-server` and writes the manifest
// both repos check against.
//
// The failure mode of any mirror is silent drift: the rules get retuned here, the server keeps
// adjudicating on the old ones, and it decides catches in a hotel that no longer exists while every
// suite stays green. So the mirrored files are copied **byte for byte** — they are UMD modules that
// attach to `globalThis` and also set `module.exports`, which means the server can require them
// unchanged and the check is a plain hash comparison rather than a golden run.
//
//   node tools/mirror-sim.mjs          # copy + rewrite the manifest
//   node tools/mirror-sim.mjs --check  # verify only; non-zero exit if anything drifted
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cabinet = resolve(here, '..');
const server = resolve(cabinet, '..', '..', '..', 'factory-network-server', 'games', 'hide-and-seek', 'shared');

// Everything the authoritative tick needs, and nothing that draws. Paths are cabinet-relative; the
// copies land flat in the server's `shared/` under their basename.
export const MIRRORED_FILES = Object.freeze([
  'modules/game-config.js',
  'map-catalog.js',
  'layout.js',
  'hotel-plan.js',
  'mall-plan.js',
  'collision-logic.js',
  'movement-logic.js',
  'round-logic.js',
  'stamina-logic.js',
  'sanity-logic.js',
  'flashlight-logic.js',
  'enemy-logic.js',
  'fixtures-logic.js',
  'demon-logic.js',
  'sim-logic.js',
]);

export const MANIFEST_NAME = 'sim-mirror-manifest.json';

export function hashOf(text) {
  // Line endings are not content: a checkout with different git settings must not read as drift.
  return createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
}

export function buildManifest(rootDir) {
  const files = {};
  for (const name of MIRRORED_FILES) files[name] = hashOf(readFileSync(join(rootDir, name), 'utf8'));
  return { generator: 'games/hide-and-seek/tools/mirror-sim.mjs', files };
}

const basename = (name) => name.slice(name.lastIndexOf('/') + 1);

function main() {
  const check = process.argv.includes('--check');
  const manifest = buildManifest(cabinet);
  const manifestPath = join(here, MANIFEST_NAME);

  if (check) {
    const recorded = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const drifted = MIRRORED_FILES.filter((name) => recorded.files[name] !== manifest.files[name]);
    if (drifted.length) {
      console.error(`The pure layer changed without re-mirroring: ${drifted.join(', ')}`);
      console.error('Run `node tools/mirror-sim.mjs` and commit both repos.');
      process.exit(1);
    }
    console.log('Mirror manifest is current.');
    return;
  }

  if (!existsSync(server)) mkdirSync(server, { recursive: true });
  for (const name of MIRRORED_FILES) {
    writeFileSync(join(server, basename(name)), readFileSync(join(cabinet, name), 'utf8'));
  }
  writeFileSync(join(server, MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Mirrored ${MIRRORED_FILES.length} files to ${server}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) main();
