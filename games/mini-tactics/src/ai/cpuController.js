// CPU brain: turn a match state into the command list for ONE activation.
//
// The driver calls chooseActivation() repeatedly while it is the CPU's squad
// turn; each call scores every legal (unit, plan) pair across all of the CPU's
// unspent units, so deciding *which* unit to activate falls out of the same
// scoring as deciding *what* it does. The returned commands flow through the
// exact same reducer a human's clicks do — the CPU has no special powers and
// cannot inspect a die before it is rolled.
//
// Determinism: scoring is pure expected-value math. The only randomness is the
// Easy tier's weighted choice and tie-breaks, fed by a PRNG derived from the
// match state (cpuRng) so it never disturbs the authoritative dice stream and a
// replay reproduces the same moves.

import { createRngState, nextRandom } from "../core/rng.js";
import { livingUnits, sameTeam } from "../state/gameState.js";
import * as cmd from "../core/commands.js";
import {
  expectedAttack,
  expectedHeal,
  incomingThreat,
  isKeyUnit,
  nearestEnemyDistance,
  unitValue,
} from "./evaluate.js";
import { generatePlans, projectPlan } from "./plans.js";

// Per-difficulty scoring weights. Easy barely values position (and picks with
// weighted randomness, so it blunders); Normal plays a competent greedy turn;
// Hard leans harder on threat avoidance and protecting/hunting key units.
const WEIGHTS = Object.freeze({
  easy: {
    kill: 8, killKey: 2, damage: 1.5, heal: 1.2, healThreatened: 1,
    defendBase: -2, guardAlly: 0.1, exposure: 0.05, keyExposure: 0.05, advance: 0.6,
  },
  normal: {
    kill: 14, killKey: 5, damage: 1.4, heal: 1.2, healThreatened: 1.5,
    defendBase: -1, guardAlly: 0.22, exposure: 0.3, keyExposure: 0.3, advance: 2.0,
  },
  hard: {
    kill: 18, killKey: 8, damage: 1.4, heal: 1.3, healThreatened: 2.2,
    defendBase: -1.5, guardAlly: 0.45, exposure: 0.5, keyExposure: 0.5, advance: 3.2,
  },
});

const BASE_ALIVE = 6; // value of a unit simply being on the board
const HP_WEIGHT = 1; //  value per current HP point
const KEY_BONUS = 4; //  extra standing value for a medic / ranger

// Cap on the threat used by the exposure penalty. Exposure is meant to steer a
// unit toward the safer of two tiles, NOT to forbid contact — without a cap, a
// tile covered by the whole enemy squad is so toxic that two cautious squads
// freeze in no-man's-land forever. With the cap, every tier keeps
// `advance > (exposure + keyExposure) * THREAT_CAP`, so closing the gap always
// nets positive and matches reliably resolve while exposure still picks tiles.
const THREAT_CAP = 3;

export function chooseActivation(
  state,
  { difficulty = "normal", cpuPlayer = state.currentPlayer, rng = Math.random } = {},
) {
  const units = livingUnits(state, cpuPlayer).filter((u) => !u.spent);
  if (units.length === 0) return [];

  const weights = WEIGHTS[difficulty] ?? WEIGHTS.normal;

  const scored = [];
  for (const unit of units) {
    for (const p of generatePlans(state, unit)) {
      scored.push({ plan: p, score: scorePlan(state, p, unit, cpuPlayer, weights) });
    }
  }

  // Defensive: generatePlans always yields at least a primary fallback, so this is
  // unreachable — but never leave a unit stuck.
  if (scored.length === 0) {
    return toCommands(cpuPlayer, {
      unitId: units[0].id, moveTo: null, movePhase: null, primary: { kind: "defend" },
    });
  }

  const chosen =
    difficulty === "easy" ? pickWeighted(scored, rng) : pickBest(scored, rng);

  return toCommands(cpuPlayer, chosen.plan);
}

// Score the board that a plan produces, from the CPU team's perspective. Higher
// is better for the CPU.
function scorePlan(state, p, unit, cpuPlayer, weights) {
  const { board, finalPos } = projectPlan(state, p);

  // 1. Material: every unit's standing value plus HP, signed by allegiance. The
  //    projected HP already reflects the plan's expected damage/heal.
  let score = 0;
  for (const u of board) {
    const sign = sameTeam(state, u.player, cpuPlayer) ? 1 : -1;
    score +=
      sign * (BASE_ALIVE + u.hp * HP_WEIGHT + (isKeyUnit(u.type) ? KEY_BONUS : 0));
  }

  // 2. Action emphasis. Expected HP rarely lands exactly on 0, so material alone
  //    under-values a likely kill; an explicit kill term makes lethal plans pop.
  if (p.primary.kind === "attack") {
    const target = state.units.find((t) => t.id === p.primary.targetId);
    if (target) {
      const ev = expectedAttack(unit, target);
      score += weights.kill * ev.pKill * unitValue(target.type);
      if (isKeyUnit(target.type)) score += weights.killKey * ev.pKill;
      score += weights.damage * ev.expDamage;
    }
  } else if (p.primary.kind === "heal") {
    const target = state.units.find((t) => t.id === p.primary.targetId);
    if (target) {
      const eh = expectedHeal(target);
      score += weights.heal * eh.expHeal;
      if (incomingThreat(state, state.units, target, target, target.defending) > 0) {
        score += weights.healThreatened * eh.expHeal;
      }
    }
  } else if (p.primary.kind === "guard") {
    score += weights.defendBase;
    const target = state.units.find((t) => t.id === p.primary.targetId);
    if (target && target.id !== unit.id) {
      const threat = incomingThreat(state, state.units, target, target, target.defending);
      const keyUnit = isKeyUnit(target.type);
      const wounded = Math.max(0, target.maxHp - target.hp);
      if (threat > 0 && (keyUnit || wounded >= 3)) {
        const key = keyUnit ? KEY_BONUS : 0;
        score += weights.guardAlly * (unitValue(target.type) + key + threat + wounded * 0.25);
      }
    }
  } else {
    score += weights.defendBase;
  }

  // 3. Positioning of the acting unit's final tile: avoid walking into crossfire,
  //    and (when nothing better) drift toward the enemy. Defending lowers the
  //    projected incoming threat, which is exactly why bracing scores well under
  //    pressure.
  const defending =
    p.primary.kind === "defend" ||
    (p.primary.kind === "guard" && p.primary.targetId === unit.id);
  const threat = Math.min(
    THREAT_CAP,
    incomingThreat(state, state.units, unit, finalPos, defending),
  );
  score -= weights.exposure * threat;
  if (isKeyUnit(unit.type)) score -= weights.keyExposure * threat;
  score -= weights.advance * nearestEnemyDistance(state, state.units, cpuPlayer, finalPos);

  return score;
}

// Greedy: the highest score wins, ties broken deterministically (then by the
// state-seeded rng) so the choice is reproducible.
function pickBest(scored, rng) {
  let best = scored[0];
  for (const entry of scored) {
    if (entry.score > best.score + 1e-9) best = entry;
  }

  const top = scored.filter((entry) => Math.abs(entry.score - best.score) <= 1e-9);
  if (top.length === 1) return top[0];
  return top[Math.floor(rng() * top.length) % top.length];
}

// Easy: softmax over the plans within a band of the best, so it favors decent
// moves but will pick a weaker one often enough to feel beatable. It never
// considers an illegal plan because the pool only holds generated (legal) ones.
function pickWeighted(scored, rng) {
  let max = -Infinity;
  for (const entry of scored) max = Math.max(max, entry.score);

  const TEMPERATURE = 6;
  const BAND = 24;
  const pool = scored.filter((entry) => entry.score >= max - BAND);

  let total = 0;
  const weighted = pool.map((entry) => {
    const weight = Math.exp((entry.score - max) / TEMPERATURE);
    total += weight;
    return { entry, weight };
  });

  let roll = rng() * total;
  for (const { entry, weight } of weighted) {
    roll -= weight;
    if (roll <= 0) return entry;
  }
  return pool[pool.length - 1];
}

// Expand a plan into the begin → (move) → primary → (retreat) → finish command
// sequence the reducer expects.
function toCommands(player, p) {
  const commands = [cmd.beginActivation(player, p.unitId)];

  if (p.movePhase === "before" && p.moveTo) {
    commands.push(cmd.moveUnit(player, p.unitId, p.moveTo.x, p.moveTo.y));
  }

  if (p.primary.kind === "attack") {
    commands.push(cmd.attack(player, p.unitId, p.primary.targetId));
  } else if (p.primary.kind === "heal") {
    commands.push(cmd.heal(player, p.unitId, p.primary.targetId));
  } else if (p.primary.kind === "guard") {
    commands.push(cmd.guard(player, p.unitId, p.primary.targetId));
  } else {
    commands.push(cmd.defend(player, p.unitId));
  }

  if (p.movePhase === "after" && p.moveTo) {
    commands.push(cmd.moveUnit(player, p.unitId, p.moveTo.x, p.moveTo.y));
  }

  commands.push(cmd.finishActivation(player, p.unitId));
  return commands;
}

// A PRNG seeded from the match state. It is fully determined by the state, so
// the CPU's choices replay identically, yet it is independent of the
// authoritative dice stream (rngState advances only when the reducer rolls).
export function cpuRng(state) {
  const seed =
    (state.rngState ^
      Math.imul(state.turnNumber, 0x9e3779b1) ^
      Math.imul(state.revision + 1, 0x85ebca6b)) |
    0;
  let s = createRngState(seed);
  return () => {
    const { value, state: ns } = nextRandom(s);
    s = ns;
    return value;
  };
}
