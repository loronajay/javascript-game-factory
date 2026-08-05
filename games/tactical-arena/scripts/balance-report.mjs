// Balance analysis — turns raw roster-sim matches into per-unit ratings, synergy pairs,
// counter pairs, and kit-usage telemetry.
//
// Why a fitted rating instead of a raw win rate: a unit's raw win rate is contaminated by
// whoever got sampled next to it. Drafting a strong unit alongside three weak ones drags
// its raw number down even though the unit did nothing wrong. The rating model (see
// scripts/lib/rating-model.mjs) separates each unit's contribution from its teammates'.
// Raw win rate is still reported beside it as a sanity check — if the two disagree wildly
// for a unit, that unit is conditional and the docs should say so rather than pick
// whichever number flatters the story.
//
// Usage:
//   node scripts/balance-report.mjs                              # reads balance-data/sim-hard.json
//   node scripts/balance-report.mjs --in balance-data/sim-normal.json
//   node scripts/balance-report.mjs --compare balance-data/sim-normal.json

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { fitRatings, predictWinProbability, sigmoid } from "./lib/rating-model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const IN = resolve(ROOT, arg("in", "balance-data/sim-hard.json"));
const COMPARE = arg("compare", null);
const OUT = resolve(ROOT, arg("out", "balance-data/analysis.json"));

// ---- per-unit rollups ------------------------------------------------------
function rollUp(matches, roster) {
  const stats = Object.fromEntries(roster.map((u) => [u, {
    unit: u, games: 0, wins: 0, losses: 0, draws: 0,
    activations: 0, ragingActivations: 0,
    damageDealt: 0, damageTaken: 0, healingDone: 0, kills: 0, deaths: 0,
    mpSpent: 0, basicAttacks: 0, defends: 0, artUses: {}, finalHpPct: 0, instances: 0
  }]));

  for (const m of matches) {
    for (const [side, squad] of [["A", m.squadA], ["B", m.squadB]]) {
      const won = m.outcome === side;
      const drew = m.outcome === "draw";
      for (const unit of new Set(squad)) {
        const s = stats[unit];
        if (!s) continue;
        s.games += 1;
        if (drew) s.draws += 1;
        else if (won) s.wins += 1;
        else s.losses += 1;
        const t = m.perType?.[`${side}:${unit}`];
        if (!t) continue;
        s.instances += t.instances ?? 1;
        s.activations += t.activations;
        s.ragingActivations += t.ragingActivations;
        s.damageDealt += t.damageDealt;
        s.damageTaken += t.damageTaken;
        s.healingDone += t.healingDone;
        s.kills += t.kills;
        s.deaths += t.died;
        s.mpSpent += t.mpSpent;
        s.basicAttacks += t.basicAttacks;
        s.defends += t.defends;
        s.finalHpPct += t.finalHpPct;
        for (const [artId, n] of Object.entries(t.artUses ?? {})) {
          s.artUses[artId] = (s.artUses[artId] ?? 0) + n;
        }
      }
    }
  }

  for (const s of Object.values(stats)) {
    const decided = s.wins + s.losses;
    s.winRate = decided ? s.wins / decided : 0;
    s.drawRate = s.games ? s.draws / s.games : 0;
    s.perGame = {
      damageDealt: s.games ? s.damageDealt / s.games : 0,
      damageTaken: s.games ? s.damageTaken / s.games : 0,
      healingDone: s.games ? s.healingDone / s.games : 0,
      kills: s.games ? s.kills / s.games : 0,
      activations: s.games ? s.activations / s.games : 0,
      mpSpent: s.games ? s.mpSpent / s.games : 0
    };
    s.survivalRate = s.games ? 1 - s.deaths / s.games : 0;
    s.rageUptime = s.activations ? s.ragingActivations / s.activations : 0;
    s.damagePerActivation = s.activations ? s.damageDealt / s.activations : 0;
    // Share of this unit's activations spent on each ART. A near-zero share for an ART
    // the docs call a centrepiece is a real finding: the CPU never finds a use for it.
    s.artShare = Object.fromEntries(
      Object.entries(s.artUses)
        .map(([id, n]) => [id, s.activations ? n / s.activations : 0])
        .sort((a, b) => b[1] - a[1])
    );
    s.basicAttackShare = s.activations ? s.basicAttacks / s.activations : 0;
    s.defendShare = s.activations ? s.defends / s.activations : 0;
  }
  return stats;
}

// ---- pair effects ----------------------------------------------------------
// Synergy: how much better a squad does than the additive model predicts when i and j
// are drafted TOGETHER. Counter: how much better i's side does than predicted when j is
// across the board. Both are residuals, so a pair only shows up when it beats the sum of
// its parts — which is the actual definition of synergy.
function pairEffects(matches, roster, ratingsByUnit, { minGames = 60 } = {}) {
  const synergy = new Map();
  const counter = new Map();

  const bump = (map, key, residual) => {
    const e = map.get(key) ?? { n: 0, sum: 0, sumSq: 0 };
    e.n += 1; e.sum += residual; e.sumSq += residual * residual;
    map.set(key, e);
  };

  for (const m of matches) {
    const p = predictWinProbability(ratingsByUnit, m.squadA, m.squadB);
    const y = m.outcome === "A" ? 1 : m.outcome === "B" ? 0 : 0.5;
    const resA = y - p;
    const resB = -resA;

    for (const [squad, residual] of [[m.squadA, resA], [m.squadB, resB]]) {
      const units = [...new Set(squad)].sort();
      for (let i = 0; i < units.length; i += 1) {
        for (let j = i + 1; j < units.length; j += 1) {
          bump(synergy, `${units[i]}|${units[j]}`, residual);
        }
      }
    }

    for (const mine of new Set(m.squadA)) {
      for (const theirs of new Set(m.squadB)) {
        bump(counter, `${mine}>${theirs}`, resA);
      }
    }
    for (const mine of new Set(m.squadB)) {
      for (const theirs of new Set(m.squadA)) {
        bump(counter, `${mine}>${theirs}`, resB);
      }
    }
  }

  const finish = (map) => [...map.entries()]
    .filter(([, e]) => e.n >= minGames)
    .map(([key, e]) => {
      const mean = e.sum / e.n;
      const variance = Math.max(1e-9, e.sumSq / e.n - mean * mean);
      const stderr = Math.sqrt(variance / e.n);
      return { key, n: e.n, effect: mean, stderr, z: mean / stderr };
    })
    .sort((a, b) => b.effect - a.effect);

  return { synergy: finish(synergy), counter: finish(counter) };
}

// ---- run -------------------------------------------------------------------
const data = JSON.parse(readFileSync(IN, "utf8"));
const roster = data.meta.roster;
const matches = data.results;

console.log(`Analyzing ${matches.length} matches (${data.meta.difficulty}, board ${data.meta.size}).`);

const fitted = fitRatings(matches, roster);
const ratingsByUnit = Object.fromEntries(fitted.map((f) => [f.unit, f.rating]));
const stats = rollUp(matches, roster);
const pairs = pairEffects(matches, roster, ratingsByUnit);

const table = fitted
  .map((f) => ({
    ...f,
    ...stats[f.unit],
    // Win rate a squad is predicted to post when this unit replaces an average one and
    // everything else is roster-average. Reads as a plain percentage.
    marginalWinPct: 100 * sigmoid(f.rating)
  }))
  .sort((a, b) => b.rating - a.rating);

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log("\n=== Unit ratings (fitted contribution; 0 = roster average) ===\n");
console.log(pad("unit", 15) + padL("rating", 9) + padL("+/-", 7) + padL("marg%", 8) + padL("raw win%", 10) +
  padL("games", 8) + padL("dmg/g", 8) + padL("taken/g", 9) + padL("heal/g", 8) + padL("kills/g", 9) +
  padL("surv%", 8) + padL("rage%", 8));
for (const r of table) {
  console.log(
    pad(r.unit, 15) +
    padL(r.rating.toFixed(3), 9) +
    padL(r.stderr.toFixed(3), 7) +
    padL(r.marginalWinPct.toFixed(1), 8) +
    padL((100 * r.winRate).toFixed(1), 10) +
    padL(r.games, 8) +
    padL(r.perGame.damageDealt.toFixed(1), 8) +
    padL(r.perGame.damageTaken.toFixed(1), 9) +
    padL(r.perGame.healingDone.toFixed(1), 8) +
    padL(r.perGame.kills.toFixed(2), 9) +
    padL((100 * r.survivalRate).toFixed(1), 8) +
    padL((100 * r.rageUptime).toFixed(1), 8)
  );
}

console.log("\n=== Strongest synergies (same-squad residual over the additive model) ===\n");
for (const s of pairs.synergy.slice(0, 20)) {
  console.log(`  ${pad(s.key.replace("|", " + "), 34)} ${padL((100 * s.effect).toFixed(1) + "%", 8)}  z=${padL(s.z.toFixed(1), 5)}  n=${s.n}`);
}
console.log("\n=== Worst anti-synergies ===\n");
for (const s of pairs.synergy.slice(-10).reverse()) {
  console.log(`  ${pad(s.key.replace("|", " + "), 34)} ${padL((100 * s.effect).toFixed(1) + "%", 8)}  z=${padL(s.z.toFixed(1), 5)}  n=${s.n}`);
}

console.log("\n=== Strongest counters (row beats column beyond what ratings predict) ===\n");
for (const c of pairs.counter.slice(0, 20)) {
  console.log(`  ${pad(c.key.replace(">", " beats "), 34)} ${padL((100 * c.effect).toFixed(1) + "%", 8)}  z=${padL(c.z.toFixed(1), 5)}  n=${c.n}`);
}

console.log("\n=== Kit usage: ARTS the CPU never (or barely) fires ===\n");
const kit = JSON.parse(readFileSync(resolve(ROOT, "balance-data/kit-audit.json"), "utf8"));
const unused = [];
for (const u of kit.units.filter((x) => x.draftable)) {
  const s = stats[u.id];
  if (!s) continue;
  for (const a of u.arts) {
    if (a.kind === "passive") continue;
    const share = s.artShare[a.id] ?? 0;
    if (share < 0.005) unused.push({ unit: u.id, art: a.name, id: a.id, share, rageLocked: a.rageLocked, activations: s.activations });
  }
}
unused.sort((a, b) => a.share - b.share);
for (const u of unused) {
  console.log(`  ${pad(u.unit, 15)} ${pad(u.art, 22)} ${padL((100 * u.share).toFixed(2) + "%", 8)} of ${u.activations} activations${u.rageLocked ? "  (rage-locked)" : ""}`);
}
console.log(`  ${unused.length} ARTS below 0.5% usage.`);

// ---- difficulty stability --------------------------------------------------
let comparison = null;
if (COMPARE) {
  const other = JSON.parse(readFileSync(resolve(ROOT, COMPARE), "utf8"));
  const otherFit = fitRatings(other.results, other.meta.roster);
  const otherByUnit = Object.fromEntries(otherFit.map((f) => [f.unit, f.rating]));
  comparison = table.map((r) => ({
    unit: r.unit,
    a: r.rating,
    b: otherByUnit[r.unit] ?? 0,
    delta: (otherByUnit[r.unit] ?? 0) - r.rating
  }));
  console.log(`\n=== Rating stability: ${data.meta.difficulty} vs ${other.meta.difficulty} ===\n`);
  console.log(pad("unit", 15) + padL(data.meta.difficulty, 10) + padL(other.meta.difficulty, 10) + padL("delta", 9));
  for (const c of [...comparison].sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta))) {
    console.log(pad(c.unit, 15) + padL(c.a.toFixed(3), 10) + padL(c.b.toFixed(3), 10) + padL(c.delta.toFixed(3), 9));
  }
  const deltas = comparison.map((c) => c.delta);
  const meanAbs = deltas.reduce((n, d) => n + Math.abs(d), 0) / deltas.length;
  console.log(`  mean |delta| = ${meanAbs.toFixed(3)} (small = the tier read survives the difficulty change)`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  meta: { ...data.meta, analyzedBy: "scripts/balance-report.mjs", comparedWith: COMPARE ?? null },
  ratings: table.map((r) => ({
    unit: r.unit, rating: r.rating, stderr: r.stderr, marginalWinPct: r.marginalWinPct,
    winRate: r.winRate, drawRate: r.drawRate, games: r.games,
    perGame: r.perGame, survivalRate: r.survivalRate, rageUptime: r.rageUptime,
    damagePerActivation: r.damagePerActivation, artShare: r.artShare,
    basicAttackShare: r.basicAttackShare, defendShare: r.defendShare
  })),
  synergy: pairs.synergy,
  counter: pairs.counter,
  unusedArts: unused,
  comparison
}, null, 2) + "\n");
console.log(`\nWrote ${OUT}`);
