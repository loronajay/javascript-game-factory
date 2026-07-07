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

// ---- named comps (from TEAM_COMP_ANALYSIS.md) ------------------------------
const COMPS = {
  realm:     ["nemesis", "magician", "fat-wizard", "necromancer"], // all-magic DEF-bypass
  wall:      ["mystic", "fat-cleric", "paladin", "gargoyle"],      // attrition wall
  contagion: ["virus", "witch-doctor", "necromancer", "archer"],   // status lock
  king:      ["king", "fat-knight", "swordsman", "paladin"],       // rage-scaling commands
  fatsquad:  ["fat-knight", "fat-wizard", "fat-cleric", "fat-bowman"], // designed synergy
  baseline:  ["magician", "mystic", "swordsman", "paladin"]        // fair benchmark
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
function playMatch(squadA, squadB, seed, aSeat) {
  const bSeat = aSeat === 1 ? 2 : 1;
  const squads = { [aSeat]: squadA, [bSeat]: squadB };
  let state = createMatchState({ size: SIZE, seed, squads });

  let activations = 0;
  let drawReason = null;
  while (state.phase === "playing" && activations < ACTIVATION_CAP) {
    const player = state.currentPlayer;
    const commands = chooseActivation(state, { difficulty: DIFFICULTY, cpuPlayer: player, rng: cpuRng(state) });
    if (commands.length === 0) { drawReason = "no-move"; break; } // no legal activation

    const revisionBefore = state.revision;
    for (const command of commands) {
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
      const m = playMatch(squadA, squadB, seed, aSeat);
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
process.stdout.write(pad("", 11));
for (const n of names) process.stdout.write(padL(n, 11));
process.stdout.write("\n");

const matrix = {};
for (const a of names) {
  process.stdout.write(pad(a, 11));
  for (const b of names) {
    if (a === b) { process.stdout.write(padL("—", 11)); continue; }
    const key = [a, b].join(">");
    let r = matrix[key];
    if (!r) {
      r = playPairing(a, b);
      matrix[key] = r;
      matrix[[b, a].join(">")] = { aWins: r.bWins, bWins: r.aWins, draws: r.draws, drawReasons: r.drawReasons, totalActivations: r.totalActivations, games: r.games };
    }
    const decided = r.aWins + r.bWins;
    const winPct = decided > 0 ? Math.round((r.aWins / decided) * 100) : 0;
    process.stdout.write(padL(`${winPct}%`, 11));
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
console.log(`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
