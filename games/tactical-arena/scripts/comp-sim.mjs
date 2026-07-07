// Team-comp simulator — pits squads against each other through the REAL reducer + CPU.
//
// Every match is played by the actual game brain: createMatchState builds the board
// with the same coin-flip a live match uses, then chooseActivation (the CPU) drives
// each turn and its commands are replayed through applyCommand (the one true reducer).
// No shortcuts, no synthetic damage model — the numbers are exactly what the shipping
// game would produce for two CPUs of the given difficulty.
//
// Usage:
//   node scripts/comp-sim.mjs                 # default: round-robin, normal, 30 seeds
//   node scripts/comp-sim.mjs --seeds 60      # more seeds = tighter numbers
//   node scripts/comp-sim.mjs --difficulty hard
//   node scripts/comp-sim.mjs --size 15
//
// Bias control: each (A,B) pairing is played on N seeds, and every seed is played
// BOTH ways (A as player 1 and A as player 2) so corner-spawn / first-turn advantage
// cancels out. Draws (turn-cap or stall) are reported separately — a high draw rate is
// itself a finding (two walls that can't break each other).

import { createMatchState } from "../src/match/matchBuilder.js";
import { applyCommand } from "../src/core/reducer.js";
import { chooseActivation, cpuRng } from "../src/ai/cpuController.js";
import { hpRemaining } from "../src/match/matchBuilder.js";
import { getArt, isRaging } from "../src/core/unitCatalog.js";
import { areAllies, findUnit, livingUnits } from "../src/core/state.js";

// Rage-usage instrumentation, keyed by comp name. This is the whole point of the
// user's critique: the CPU never *seeks* rage (it only drops to ≤5 HP by taking
// damage) and never orchestrates rage payoffs, so these counters quantify HOW MUCH
// the sim under-plays each comp's rage-dependent ceiling.
//   activations   — unit-turns taken
//   raging        — of those, how many were taken while the acting unit was raging
//   rageArt       — rage-LOCKED arts actually fired (Nuke, Self Destruct, Rewind, …)
//   scaledCommand — King commands issued with ≥1 raging ally (the buff actually scaled)
const rageStats = {};
function bumpRage(comp, key, n = 1) {
  (rageStats[comp] ??= { activations: 0, raging: 0, rageArt: 0, scaledCommand: 0 })[key] += n;
}

// ---- named comps -----------------------------------------------------------
// The three "supers" (realm/wall/contagion) plus a deliberately DIVERSE field:
// classic variants, and several comps designed to COUNTER a specific super
// (true-damage vs the wall, Dead-Zone tanks vs the magic pile, status-immunity
// vs the contagion lock). The point is to stop testing a shallow pool.
const COMPS = {
  // --- the three top comps under scrutiny ---
  realm:     ["nemesis", "magician", "fat-wizard", "necromancer"],   // all-magic DEF-bypass
  wall:      ["mystic", "fat-cleric", "paladin", "gargoyle"],        // attrition wall
  contagion: ["virus", "witch-doctor", "necromancer", "archer"],     // status lock
  // --- prior extras ---
  fatsquad:  ["fat-knight", "fat-wizard", "fat-cleric", "fat-bowman"], // designed synergy
  king:      ["king", "fat-knight", "swordsman", "paladin"],          // rage-scaling commands
  // --- classic / benchmark squads ---
  classic:   ["swordsman", "archer", "mystic", "magician"],           // the true default squad
  baseline:  ["magician", "mystic", "swordsman", "paladin"],          // near-classic (archer→paladin)
  // --- purpose-built challengers ---
  // anti-contagion: four status-immune-or-cleansing bodies. Paladin/Angel/Gargoyle are
  // fully immune, Mystic cleanses + team +1 DEF. Should walk through the status lock.
  immune:    ["paladin", "angel", "gargoyle", "mystic"],
  // anti-wall: true damage bypasses DEF *and* Defend. Time Steal (auto aura), Footwork,
  // Fart/Stumble, Hand-of-Life sustain — most of it CPU-usable without rage.
  truedmg:   ["father-time", "swordsman", "fat-knight", "paladin"],
  // anti-realm / grind: Dead Zone (−1 team magic) behind two 30-HP Defend tanks + a healer.
  // Aims to outlast the magic pile until it stalls on MP (realm already draws ~44%).
  fortress:  ["gargoyle", "clod", "necromancer", "fat-cleric"],
  // ranged kite: pierce + magic + DEF aura, tries to poke from outside melee threat.
  poke:      ["sniper", "fat-bowman", "angel", "mystic"],
  // buff-stack: pile every team multiplier (magic +1, DEF aura, Age ±stat) onto one carry.
  hybrid:    ["nemesis", "mystic", "father-time", "paladin"]
};

// ---- args ------------------------------------------------------------------
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const SEEDS = Number(arg("seeds", 30));
const DIFFICULTY = arg("difficulty", "normal");
const SIZE = Number(arg("size", 13));
const ACTIVATION_CAP = 500; // hard stop so a stalemate can't hang the sim

// ---- one match -------------------------------------------------------------
// aSeat: which player id (1 or 2) comp A occupies this game. Returns "A" | "B" | "draw".
function playMatch(squadA, squadB, seed, aSeat, nameA, nameB) {
  const bSeat = aSeat === 1 ? 2 : 1;
  const squads = { [aSeat]: squadA, [bSeat]: squadB };
  const compForSeat = (p) => (p === aSeat ? nameA : nameB);
  let state = createMatchState({ size: SIZE, seed, squads });

  let activations = 0;
  let drawReason = null;
  while (state.phase === "playing" && activations < ACTIVATION_CAP) {
    const player = state.currentPlayer;
    const commands = chooseActivation(state, { difficulty: DIFFICULTY, cpuPlayer: player, rng: cpuRng(state) });
    if (commands.length === 0) { drawReason = "no-move"; break; } // no legal activation

    const revisionBefore = state.revision;
    for (const command of commands) {
      // Measure rage usage against the state as it stands BEFORE the command applies.
      if (command.type === "BEGIN_ACTIVATION") {
        const unit = findUnit(state, command.unitId);
        if (unit) { bumpRage(compForSeat(player), "activations"); if (isRaging(unit)) bumpRage(compForSeat(player), "raging"); }
      } else if (command.type === "USE_ART") {
        const unit = findUnit(state, command.unitId);
        const art = unit && getArt(unit.type, command.artId);
        if (art?.rageLocked) bumpRage(compForSeat(player), "rageArt");
        if (art?.command && unit && livingUnits(state, player).some((a) => a.id !== unit.id && areAllies(a, unit) && isRaging(a))) {
          bumpRage(compForSeat(player), "scaledCommand");
        }
      }
      const result = applyCommand(state, command);
      // The CPU plans against EXPECTED values, so a rolled outcome can invalidate the
      // tail of its own sequence (a kill ends the match; the acting unit dying to a
      // thorns/recoil counter makes its planned retreat illegal). The real driver
      // tolerates this the same way: keep the accepted prefix, drop the rest.
      if (!result.accepted) break;
      state = result.nextState;
      if (state.phase !== "playing") break;
    }
    activations += 1;
    // No command advanced the match this cycle → a genuine stall; stop before hanging.
    if (state.phase === "playing" && state.revision === revisionBefore) { drawReason = "stall"; break; }
  }
  if (state.phase === "playing" && activations >= ACTIVATION_CAP) drawReason = "cap";

  const hpA = hpRemaining(state, aSeat);
  const hpB = hpRemaining(state, bSeat);
  let outcome = "draw";
  if (state.winner === aSeat) outcome = "A";
  else if (state.winner === bSeat) outcome = "B";
  return { outcome, activations, hpA, hpB, drawReason };
}

// ---- a full pairing (both sides, all seeds) --------------------------------
function playPairing(nameA, nameB) {
  const squadA = COMPS[nameA], squadB = COMPS[nameB];
  const r = { aWins: 0, bWins: 0, draws: 0, drawReasons: {}, totalActivations: 0, games: 0 };
  for (let s = 0; s < SEEDS; s += 1) {
    // Each seed played both ways to cancel spawn/first-turn bias.
    for (const aSeat of [1, 2]) {
      const seed = s * 2 + 1; // odd, nonzero seeds
      const m = playMatch(squadA, squadB, seed, aSeat, nameA, nameB);
      r.games += 1;
      r.totalActivations += m.activations;
      if (m.outcome === "A") r.aWins += 1;
      else if (m.outcome === "B") r.bWins += 1;
      else { r.draws += 1; r.drawReasons[m.drawReason] = (r.drawReasons[m.drawReason] ?? 0) + 1; }
    }
  }
  return r;
}

// ---- run round-robin -------------------------------------------------------
const names = Object.keys(COMPS);
console.log(`Tactical Arena comp sim — difficulty=${DIFFICULTY}, board=${SIZE}, ${SEEDS} seeds ×2 sides = ${SEEDS * 2} games/pairing\n`);

const tally = Object.fromEntries(names.map((n) => [n, { w: 0, l: 0, d: 0, g: 0 }]));
const startedAt = Date.now();

console.log("Head-to-head (win% for the ROW comp):\n");
// header
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
const W = 10; // matrix column width
process.stdout.write(pad("", W));
for (const n of names) process.stdout.write(padL(n, W));
process.stdout.write("\n");

const matrix = {};
for (const a of names) {
  process.stdout.write(pad(a, W));
  for (const b of names) {
    if (a === b) { process.stdout.write(padL("—", W)); continue; }
    const key = [a, b].join(">");
    let r = matrix[key];
    if (!r) {
      r = playPairing(a, b);
      matrix[key] = r;
      matrix[[b, a].join(">")] = { aWins: r.bWins, bWins: r.aWins, draws: r.draws, drawReasons: r.drawReasons, totalActivations: r.totalActivations, games: r.games };
    }
    const decided = r.aWins + r.bWins;
    const winPct = decided > 0 ? Math.round((r.aWins / decided) * 100) : 0;
    process.stdout.write(padL(`${winPct}%`, W));
    tally[a].w += r.aWins; tally[a].l += r.bWins; tally[a].d += r.draws; tally[a].g += r.games;
  }
  process.stdout.write("\n");
}

// ---- overall ranking -------------------------------------------------------
console.log("\nOverall (across all pairings):\n");
const ranked = names.map((n) => {
  const t = tally[n];
  const decided = t.w + t.l;
  return { n, ...t, winPct: decided > 0 ? (t.w / decided) * 100 : 0 };
}).sort((x, y) => y.winPct - x.winPct);

console.log(pad("comp", 12) + padL("win%", 8) + padL("W", 6) + padL("L", 6) + padL("draws", 8) + padL("games", 8));
for (const row of ranked) {
  console.log(pad(row.n, 12) + padL(row.winPct.toFixed(1), 8) + padL(row.w, 6) + padL(row.l, 6) + padL(row.d, 8) + padL(row.g, 8));
}

// ---- focused: can anything fight the supers? -------------------------------
// Each comp's win% (of decided games) against wall / realm / contagion specifically.
const SUPERS = ["wall", "realm", "contagion"];
console.log("\nVs the supers — win% for the ROW comp against each (decided games; >50% = beats it):\n");
console.log(pad("comp", 12) + SUPERS.map((s) => padL(s, 11)).join(""));
for (const a of names) {
  let line = pad(a, 12);
  for (const s of SUPERS) {
    if (a === s) { line += padL("—", 11); continue; }
    const r = matrix[[a, s].join(">")];
    const decided = r.aWins + r.bWins;
    const winPct = decided > 0 ? Math.round((r.aWins / decided) * 100) : 0;
    const draws = r.draws;
    line += padL(`${winPct}%(${draws}d)`, 11);
  }
  console.log(line);
}
console.log("  format: win%(Nd) where N = draws in that matchup out of " + (SEEDS * 2) + " games.");

// ---- draw / length diagnostics --------------------------------------------
let totalDraws = 0, totalGames = 0, totalAct = 0;
const reasonTotals = {};
for (const a of names) for (const b of names) {
  if (a >= b) continue;
  const r = matrix[[a, b].join(">")];
  if (!r) continue;
  totalDraws += r.draws; totalGames += r.games; totalAct += r.totalActivations;
  for (const [reason, n] of Object.entries(r.drawReasons ?? {})) reasonTotals[reason] = (reasonTotals[reason] ?? 0) + n;
}
const reasonStr = Object.entries(reasonTotals).map(([k, v]) => `${k}=${v}`).join(", ") || "none";
console.log(`\nDraws: ${totalDraws}/${totalGames} (${(100 * totalDraws / totalGames).toFixed(1)}%). Reasons: ${reasonStr}.`);
console.log(`  (cap = hit ${ACTIVATION_CAP}-activation limit; no-move = a side had no legal activation; stall = no command advanced state)`);
console.log(`Avg activations/game: ${(totalAct / totalGames).toFixed(0)}.`);

// ---- rage-usage report (quantifies how much the CPU under-plays rage) -------
console.log("\nRage usage by the CPU (how often rage payoffs were actually online):\n");
console.log(pad("comp", 12) + padL("acts", 8) + padL("raging%", 10) + padL("rageArts", 10) + padL("scaledCmd", 11));
for (const n of names) {
  const r = rageStats[n] ?? { activations: 0, raging: 0, rageArt: 0, scaledCommand: 0 };
  const ragingPct = r.activations ? (100 * r.raging / r.activations).toFixed(1) : "0.0";
  console.log(pad(n, 12) + padL(r.activations, 8) + padL(`${ragingPct}%`, 10) + padL(r.rageArt, 10) + padL(r.scaledCommand, 11));
}
console.log("\n  raging%   = share of unit-turns taken while the acting unit was at ≤5 HP (rage passives live)");
console.log("  rageArts  = rage-LOCKED arts the CPU actually fired (Nuke / Self Destruct / Rewind / Black Death / Explosion / …)");
console.log("  scaledCmd = King commands issued with ≥1 raging ally (the +1-per-raging-ally scaling actually realized)");
console.log("  Low numbers here = the sim is scoring that comp near its FLOOR, not its rage ceiling.");
console.log(`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
