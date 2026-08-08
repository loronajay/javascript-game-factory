// Mirrors the pure sim into factory-network-server.
//
// The two repos are independent — the server is its own Railway service and
// cannot import across the boundary — so shared logic is *copied* rather than
// imported. That is the established pattern (circuit-siege keeps
// `games/circuit-siege/shared/*.mjs` alongside this cabinet's `scripts/shared/`),
// and it works precisely because the modules being copied are pure: no DOM, no
// clock, no randomness, nothing to rewire.
//
// The obvious failure of a mirror is silent drift: someone retunes the torque
// curve here, the server keeps adjudicating on the old one, and the two disagree
// about who won. Two things guard against it, and neither is this script:
//
//   1. `tests/golden-run.test.js` here and `speed-demon-replay.test.mjs` there
//      both replay the *same* committed fixture and assert the same finishing
//      time to the last decimal place. Retune anything and both fail; copy the
//      files across and both pass again.
//   2. Every mirrored file is written with a header saying where it came from,
//      so nobody edits the copy by mistake.
//
// Usage, from the cabinet folder:  node tools/mirror-sim.mjs
// Add --check to verify without writing, which is what a CI gate would want.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildGoldenRun } from "./golden-run.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const cabinet = resolve(here, "..");
const server = resolve(cabinet, "../../../factory-network-server/games/speed-demon/shared");
const goldenTargets = [
  resolve(cabinet, "tests/fixtures/golden-run.json"),
  resolve(server, "golden-run.json"),
];

/**
 * The pure modules the server needs to adjudicate a round: everything the
 * replay touches, plus the match rules themselves. `modes.js` comes along
 * because the server owns the race options, so it needs the distance table.
 */
const MIRRORED = [
  "constants.js",
  "engine.js",
  "gate.js",
  "grading.js",
  "launch.js",
  "race.js",
  "input-log.js",
  "match.js",
  "modes.js",
];

const header = (name) =>
  `// MIRRORED FILE — do not edit here.\n` +
  `//\n` +
  `// Copied verbatim from javascript-games/games/speed-demon/scripts/sim/${name}\n` +
  `// by that cabinet's tools/mirror-sim.mjs. Edit the original and re-run it.\n` +
  `// The golden-run fixture in both repos fails if these two copies disagree.\n\n`;

/** Only the extension changes: the server repo is `.mjs` throughout. */
const rewrite = (source) => source.replace(/from "\.\/([a-z-]+)\.js"/g, 'from "./$1.mjs"');

const check = process.argv.includes("--check");
let stale = 0;

await mkdir(server, { recursive: true });
for (const name of MIRRORED) {
  const source = await readFile(resolve(cabinet, "scripts/sim", name), "utf8");
  const target = resolve(server, name.replace(/\.js$/, ".mjs"));
  const contents = header(name) + rewrite(source);

  if (check) {
    const existing = await readFile(target, "utf8").catch(() => null);
    if (existing !== contents) {
      console.error(`STALE  ${name}`);
      stale += 1;
    }
    continue;
  }
  await writeFile(target, contents, "utf8");
  console.log(`mirrored  ${name}`);
}

// ---------------------------------------------------------------------------
// The golden fixture
// ---------------------------------------------------------------------------
//
// Regenerating is opt-in, and that is the whole guard. If this ran on every
// mirror it would quietly rewrite its own expectations after a retune, and the
// fixture would agree with whatever the physics happened to do — which is a test
// that can never fail. Ask for it deliberately, once, when a retune is intended.

if (process.argv.includes("--golden")) {
  const fixture = `${JSON.stringify(buildGoldenRun(), null, 2)}\n`;
  for (const target of goldenTargets) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, fixture, "utf8");
    console.log(`golden    ${target}`);
  }
} else if (check) {
  // Both copies must exist and be byte-identical: they are the one number the
  // two repos have to agree on.
  const copies = await Promise.all(goldenTargets.map((target) => readFile(target, "utf8").catch(() => null)));
  if (copies.some((copy) => copy === null) || copies[0] !== copies[1]) {
    console.error("STALE  golden-run.json (missing, or the two copies differ)");
    stale += 1;
  }
}

if (check) {
  console.log(stale === 0 ? "\nmirror is up to date" : `\n${stale} file(s) out of date — run: node tools/mirror-sim.mjs`);
  process.exitCode = stale === 0 ? 0 : 1;
}
