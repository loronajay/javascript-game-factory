// Probe: put a unit in the situation its ART was designed for, and see whether the CPU
// ever chooses it. Used to separate "this ART is weak" from "the CPU cannot see it".
//
//   node scripts/probe-art-choice.mjs
//
// Not part of the test suite — a diagnostic for balance/AI investigation.

import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (p) => pathToFileURL(resolve(ROOT, p)).href;

const { createMatchState } = await import(src("src/match/matchBuilder.js"));
const { chooseActivation, cpuRng } = await import(src("src/ai/cpuController.js"));

// Place `unit` in the middle with `enemies` packed around it, then ask the CPU what it
// would do. Repeated over seeds because plan scoring can tie-break randomly.
function probe({ unit, enemyType, ring = 1, seeds = 40 }) {
  const picks = new Map();
  for (let s = 0; s < seeds; s += 1) {
    const state = createMatchState({
      size: 13,
      seed: s * 2 + 1,
      squads: { 1: [unit, unit, unit, unit], 2: [enemyType, enemyType, enemyType, enemyType] }
    });

    // Hand-place: our probe unit centred, four enemies orthogonally adjacent at `ring`.
    const mine = state.units.filter((u) => u.player === 1);
    const theirs = state.units.filter((u) => u.player === 2);
    mine[0].position = { x: 6, y: 6 };
    const spots = [
      { x: 6 - ring, y: 6 }, { x: 6 + ring, y: 6 },
      { x: 6, y: 6 - ring }, { x: 6, y: 6 + ring }
    ];
    theirs.forEach((enemy, i) => { enemy.position = spots[i % spots.length]; });
    // Park our other three far away so they aren't the interesting choice.
    mine.slice(1).forEach((u, i) => { u.position = { x: 0, y: i }; });

    const commands = chooseActivation(state, { difficulty: "hard", cpuPlayer: 1, rng: cpuRng(state) });
    const acting = commands.find((c) => c.unitId === mine[0].id || c.actorId === mine[0].id);
    if (!acting) { picks.set("(did not act first)", (picks.get("(did not act first)") ?? 0) + 1); continue; }
    const art = commands.find((c) => c.type === "USE_ART" && c.unitId === mine[0].id);
    const key = art ? `art:${art.artId}` : (commands.some((c) => c.type === "ATTACK" && c.actorId === mine[0].id) ? "basic attack" : "defend/move");
    picks.set(key, (picks.get(key) ?? 0) + 1);
  }
  return picks;
}

const cases = [
  { label: "Fat Knight, 4 enemies adjacent (Fart should be live)", unit: "fat-knight", enemyType: "swordsman", ring: 1 },
  { label: "Big Brother, 4 enemies adjacent (Force Push should be live)", unit: "big-brother", enemyType: "swordsman", ring: 1 },
  { label: "Virus, 4 enemies within 2 (Smog should be live)", unit: "virus", enemyType: "swordsman", ring: 2 },
  { label: "Monk, 4 enemies adjacent (Front Kick should be live)", unit: "monk", enemyType: "swordsman", ring: 1 },
  { label: "Clod, 4 enemies adjacent (control case — Quake works)", unit: "clod", enemyType: "swordsman", ring: 1 }
];

for (const c of cases) {
  const picks = probe(c);
  const total = [...picks.values()].reduce((a, b) => a + b, 0);
  const summary = [...picks.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${Math.round((100 * n) / total)}%`)
    .join(", ");
  console.log(`${c.label}\n   -> ${summary}\n`);
}
