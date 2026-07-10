// CPU brain: turn a match state into the command list for ONE activation.
//
// The driver calls chooseActivation() repeatedly while it is the CPU's turn; each
// call scores every legal (unit, plan) pair across all of the CPU's unspent units,
// so deciding *which* unit to activate falls out of the same scoring as deciding
// *what* it does. The returned commands flow through the exact same reducer a human's
// clicks do — the CPU has no special powers and cannot inspect a die before it rolls.
//
// Determinism: scoring is pure expected-value math (see evaluate.js). The only
// randomness is the Easy tier's weighted choice and tie-breaks, fed by a PRNG derived
// from the match state (cpuRng) so it never disturbs the authoritative dice stream and
// a replay reproduces the same moves.

import { areEnemies, findUnit, livingUnits } from "../core/state.js";
import { getArt, getBasicAttackResourceCost, getEffectiveStats, getWallKillResourceReward, isCommandOnly, normalizeArtAi, takesTurns } from "../core/unitCatalog.js";
import { createRngState, nextRandom } from "../core/rng.js";
import { getSelfBlastRadius } from "../rules/arts.js";
import { isFireDamageImmune, isShotBlocked, isWallBetween } from "../rules/combat.js";
import { chebyshevDistance, positionKey } from "../rules/movement.js";
import { isStunned } from "../rules/statuses.js";
import {
  ageValue,
  anointValue,
  buffAlliesValue,
  cleanseAllyValue,
  commandBuffValue,
  expectedStrike,
  grabValue,
  hastenValue,
  incomingThreat,
  isKeyUnit,
  nearestEnemyDistance,
  rechargeValue,
  statusValue,
  unitThreatValue
} from "./evaluate.js";
import { generatePlans, planMpCost, projectPlan, toCommands } from "./plans.js";

// Per-difficulty scoring weights. Easy barely values position (and picks with weighted
// randomness, so it blunders); Normal plays a competent greedy turn; Hard leans harder
// on threat-avoidance and protecting/hunting key units. `control` weights status
// effects, `zone` weights placed objects (walls/fire), `mp` is the cost per MP point.
const WEIGHTS = Object.freeze({
  easy: {
    kill: 8, killKey: 2, damage: 1.5, heal: 1.2, control: 0.6, zone: 0.4,
    defendBase: -2, mp: 0.15, exposure: 0.05, keyExposure: 0.05, advance: 0.6
  },
  normal: {
    kill: 14, killKey: 5, damage: 1.4, heal: 1.2, control: 1.0, zone: 0.8,
    defendBase: -1, mp: 0.25, exposure: 0.3, keyExposure: 0.3, advance: 2.0
  },
  hard: {
    kill: 18, killKey: 8, damage: 1.4, heal: 1.3, control: 1.4, zone: 1.1,
    defendBase: -1.5, mp: 0.3, exposure: 0.5, keyExposure: 0.5, advance: 3.2
  }
});

const HP_WEIGHT = 1;       // value per current HP point in the material term
const THREAT_CAP = 3;      // cap on exposure threat so two squads don't freeze apart
const AOE_WASTE_PENALTY = 8; // sink an AoE that hits too few targets for no kill
// A fire-immune unit takes no damage from a burning tile, so it reads as free ground worth
// camping — melee attackers who follow it in eat the burn every rollover. Scaled by the same
// `zone` weight as a placed wall/fire (in units of that authored evHints.zoneValue scale).
const FIRE_CAMP_ZONE_VALUE = 6;
const WALL_BREAK_VALUE = 5;
const WALL_ORE_VALUE = 4;

export function chooseActivation(
  state,
  { difficulty = "normal", cpuPlayer = state.currentPlayer, rng = Math.random, excludeArtIds = null } = {}
) {
  const units = livingUnits(state, cpuPlayer).filter((u) => !u.spent && takesTurns(u) && !isStunned(u));
  if (units.length === 0) return [];

  const weights = WEIGHTS[difficulty] ?? WEIGHTS.normal;

  // The King commands before any squadmate may act — while an un-commanded King is still
  // unspent it is the ONLY unit the reducer will let this player activate, so restrict the
  // search to it (offering another unit would only replay into a KING_MUST_ACT_FIRST stall).
  const kings = units.filter((u) => isCommandOnly(u));
  const actable = kings.length ? kings : units;

  // Optional per-call ART denylist. Used by scripted content (e.g. a campaign mission
  // capping how many times a stalling unit may re-cast a self-heal) to remove a plan
  // from consideration without touching the scoring model itself.
  const excluded = excludeArtIds && excludeArtIds.length ? new Set(excludeArtIds) : null;

  const scored = [];
  for (const unit of actable) {
    for (const plan of generatePlans(state, unit)) {
      if (excluded && plan.primary.kind === "art" && excluded.has(plan.primary.artId)) continue;
      scored.push({ plan, score: scorePlan(state, plan, unit, cpuPlayer, weights) });
    }
  }

  // Defensive: generatePlans always yields at least a defend fallback, so this is
  // unreachable — but never leave a unit stuck.
  if (scored.length === 0) {
    return toCommands(cpuPlayer, {
      unitId: units[0].id, bonus: null, moveTo: null, movePhase: null, primary: { kind: "defend" }
    });
  }

  const chosen = difficulty === "easy" ? pickWeighted(scored, rng) : pickBest(scored, rng);
  return toCommands(cpuPlayer, chosen.plan);
}

// Score the board a plan produces, from the CPU's perspective. Higher is better. The
// damage/heal emphasis is read uniformly from the projected-board diff, so attacks,
// AoE, footwork, blasts, heals, and the bonus pulse all score through one path; status
// effects, placed objects, MP, and positioning are added on top.
function scorePlan(state, plan, unit, cpuPlayer, weights) {
  const { board, finalPos } = projectPlan(state, plan);
  const before = new Map(livingUnits(state).map((u) => [u.id, u.hp]));

  // 1. Material: every unit's self-declared standing value plus current HP, signed by
  //    allegiance. Projected HP already reflects the plan's expected damage/heal.
  let score = 0;
  for (const u of board) {
    const sign = u.player === cpuPlayer ? 1 : -1;
    score += sign * (unitThreatValue(u) + u.hp * HP_WEIGHT);
  }

  // 2. Action emphasis from the HP diff. Material alone under-values a kill (a dead
  //    unit keeps its standing value on the projected board), so explicit kill/damage
  //    terms make lethal and high-damage plans pop.
  let enemyHits = 0;
  let kills = 0;
  for (const after of board) {
    const beforeHp = before.get(after.id);
    if (beforeHp === undefined) continue; // a projected summon has no "before" — its value is in material
    const delta = beforeHp - after.hp;
    if (after.player !== cpuPlayer) {
      if (delta > 0) { score += weights.damage * delta; enemyHits += 1; }
      if (beforeHp > 0 && after.hp <= 0) {
        kills += 1;
        score += weights.kill * unitThreatValue(after);
        if (isKeyUnit(after)) score += weights.killKey;
      }
    } else if (delta < 0) {
      score += weights.heal * -delta; // an ally was healed
    }
  }

  // 3. Status / heal-rider value not captured by the HP diff.
  const { control, heal } = planEffectValue(state, unit, plan);
  score += weights.control * control + weights.heal * heal;

  // Mission-specific CPU personalities can add tiny tactical priors without changing
  // global unit tuning. Timeless Woods uses this to make Father Time actively build the
  // Archer into a carry instead of simply advancing while the squads are still far apart.
  score += missionPlanBias(state, unit, plan);

  // 4. Zone control from a placed wall / fire.
  score += weights.zone * planZoneValue(unit, plan);
  score += wallBreakValue(state, unit, plan);

  // 5. Don't burn a costly blast on too few targets for no kill (decision 1/5 economy).
  const primaryArtAi = artAiFor(unit, plan);
  if (primaryArtAi && ["selfBlast", "coneAoe", "lineBurst", "flightStrike", "targetedBlast"].includes(primaryArtAi.intent)) {
    const minTargets = primaryArtAi.evHints?.minTargets ?? 1;
    if (enemyHits < minTargets && kills === 0) score -= AOE_WASTE_PENALTY;
  }

  // 6. A pure brace is a fallback, not a default.
  if (plan.primary.kind === "defend") score += weights.defendBase;

  // 7. MP is finite (barely regens), so spending it is a real cost.
  score -= weights.mp * planMpCost(state, plan);

  // 8. Positioning of the acting unit's final tile: avoid crossfire, and (when nothing
  //    better) drift toward the enemy. Defending lowers the projected incoming threat.
  const defending = plan.primary.kind === "defend";
  const threat = Math.min(THREAT_CAP, incomingThreat(state, unit, finalPos, defending));
  score -= weights.exposure * threat;
  if (isKeyUnit(unit)) score -= weights.keyExposure * threat;
  score -= weights.advance * nearestEnemyDistance(state, cpuPlayer, finalPos);

  // 9. A fire-immune unit baits melee by camping on a burning tile it can't be hurt by.
  if (isFireDamageImmune(unit) && state.tileObjects?.[positionKey(finalPos)]?.kind === "fire") {
    score += weights.zone * FIRE_CAMP_ZONE_VALUE;
  }

  return score;
}

// Status-effect / heal-rider value (in damage-equivalent units) that the HP diff can't
// see: a status applied by a strike ART, a pure status cast, or a self-heal rider.
function planEffectValue(state, unit, plan) {
  if (plan.primary.kind !== "art") return { control: 0, heal: 0 };
  const art = getArt(unit.type, plan.primary.artId);
  const ai = normalizeArtAi(art);

  if (ai.intent === "strike") {
    const target = findUnit(state, plan.primary.targetId);
    if (!target) return { control: 0, heal: 0 };
    const rider = expectedStrike(state, unit, target, art).riderValue;
    return art.effect?.type === "heal" ? { control: 0, heal: rider } : { control: rider, heal: 0 };
  }
  if (ai.intent === "statusCast") {
    const target = findUnit(state, plan.primary.targetId);
    if (!target) return { control: 0, heal: 0 };
    return { control: (art.effect?.chance ?? 1) * statusValue(target, art.effect, state), heal: 0 };
  }
  // Witch Doctor dances (team buff / cleanse / global blind) project no HP change, so
  // their worth rides the same `control` weight as a status cast.
  if (ai.intent === "buffAllies") {
    return { control: buffAlliesValue(state, unit, art), heal: 0 };
  }
  // King commands (Strike/Hold/Pursue/Higher Ground): a one-turn team buff, no HP change.
  if (ai.intent === "commandBuff") {
    return { control: commandBuffValue(state, unit, art), heal: 0 };
  }
  // Father Time's Age (persistent ±stat) and Time Stretch (haste/slow) change no HP now,
  // so their value rides the `control` weight like a status cast. (Rewind's value is the
  // revived ally's material on the projected board, so it needs no term here.)
  if (ai.intent === "statBuff") {
    const target = findUnit(state, plan.primary.targetId);
    if (!target) return { control: 0, heal: 0 };
    return { control: ageValue(state, unit, target, plan.primary.stat ?? "strength", target.player === unit.player), heal: 0 };
  }
  if (ai.intent === "hasten") {
    const target = findUnit(state, plan.primary.targetId);
    if (!target) return { control: 0, heal: 0 };
    return { control: hastenValue(state, unit, target, target.player === unit.player), heal: 0 };
  }
  // Angel's Anoint (+1 range on an ally): a one-turn buff, no HP change, rides `control`.
  if (ai.intent === "buffAlly") {
    const target = findUnit(state, plan.primary.targetId);
    if (!target) return { control: 0, heal: 0 };
    return { control: anointValue(state, unit, target), heal: 0 };
  }
  if (ai.intent === "cleanseAlly") {
    const target = findUnit(state, plan.primary.targetId);
    if (!target) return { control: 0, heal: 0 };
    return { control: cleanseAllyValue(state, target), heal: 0 };
  }
  // Juggernaut. Rocket Punch's 10 damage rides the HP diff; only its stun is uncounted.
  if (ai.intent === "lineStrike") {
    const target = findUnit(state, plan.primary.targetId);
    if (!target || !art.effect) return { control: 0, heal: 0 };
    return { control: (art.effect.chance ?? 0) * statusValue(target, art.effect, state, { survivingHp: target.hp }), heal: 0 };
  }
  // Tether Grab's 3 magic rides the HP diff; the pull is the extra value here.
  if (ai.intent === "grab") {
    const target = findUnit(state, plan.primary.targetId);
    if (!target) return { control: 0, heal: 0 };
    return { control: grabValue(state, unit, target), heal: 0 };
  }
  // Recharge: refuel MP / mend 1 HP at full MP — a small tempo term (the mend is material).
  if (ai.intent === "recharge") {
    return { control: rechargeValue(state, unit), heal: 0 };
  }
  // Thunderous Charge (Clod): the 10 physical to each enemy rides the HP diff; the mass
  // 1-turn stun is the uncounted value — sum it over every enemy caught in the blast.
  if (ai.intent === "targetedBlast") {
    const center = plan.primary.targetPosition;
    const radius = art.targeting?.radius ?? 2;
    let control = 0;
    for (const enemy of livingUnits(state)) {
      if (!areEnemies(unit, enemy) || !center || chebyshevDistance(center, enemy.position) > radius) continue;
      control += statusValue(enemy, { status: "stun", durationTurns: art.stun?.durationTurns ?? 1 }, state);
    }
    return { control, heal: 0 };
  }
  // Smog (Virus): a self-centred blind cloud, no HP change — sum the status value of
  // blinding every enemy caught in the radius, so it rides the `control` weight.
  if (ai.intent === "statusAoe") {
    if (art.effect?.type !== "status" || !art.effect.status) return { control: 0, heal: 0 };
    const radius = getSelfBlastRadius(state, unit, art);
    let control = 0;
    for (const enemy of livingUnits(state)) {
      if (!areEnemies(unit, enemy) || chebyshevDistance(unit.position, enemy.position) > radius) continue;
      control += statusValue(enemy, { status: art.effect.status, durationTurns: art.effect.durationTurns }, state);
    }
    return { control, heal: 0 };
  }
  return { control: 0, heal: 0 };
}

// Base zone value of a placed object (wall/fire). Candidate tiles are already
// relevance-filtered in plans.js, so v1 uses the authored zoneValue directly.
function planZoneValue(unit, plan) {
  const ai = artAiFor(unit, plan);
  return ai?.intent === "placeObject" ? (ai.evHints?.zoneValue ?? 0) : 0;
}

function wallBreakValue(state, unit, plan) {
  if (plan.primary.kind !== "attackTile") return 0;
  const target = plan.primary.targetPosition;
  const actorPos = plan.movePhase === "before" && plan.moveTo ? plan.moveTo : unit.position;
  if (hasCleanBasicAttackTarget(state, unit, actorPos)) return 0;
  const oreReward = getWallKillResourceReward(
    { ...unit, position: actorPos },
    target,
  );
  return WALL_BREAK_VALUE + oreReward * WALL_ORE_VALUE;
}

function hasCleanBasicAttackTarget(state, unit, position) {
  const actor = { ...unit, position };
  const range = getEffectiveStats(actor, state).attackRange;
  if (range < 1) return false;
  return livingUnits(state).some((other) =>
    areEnemies(unit, other) &&
    chebyshevDistance(position, other.position) <= range &&
    getBasicAttackResourceCost(actor, other) <= actor.mp &&
    !isWallBetween(state, position, other.position, actor) &&
    !isShotBlocked(state, position, other.position, actor)
  );
}

function artAiFor(unit, plan) {
  if (plan.primary.kind !== "art") return null;
  return normalizeArtAi(getArt(unit.type, plan.primary.artId));
}

function missionPlanBias(state, unit, plan) {
  const carry = state.aiProfile?.fatherTimeCarry;
  const virusMisfortune = state.aiProfile?.virusMisfortune;
  const monkTrialArts = state.aiProfile?.monkTrialArts;
  if (plan.primary.kind !== "art") return 0;
  const primary = plan.primary;
  if (
    monkTrialArts &&
    unit.type === "monk" &&
    (unit.trialRealMonk || unit.trialFakeMonk) &&
    (primary.artId === "front-kick" || primary.artId === "protect")
  ) {
    // Mission 7 is a read-the-kit puzzle: Monk ART callouts are how the player
    // distinguishes the true master from fake-art decoys.
    return primary.artId === "front-kick" ? 22 : 18;
  }
  if (virusMisfortune && unit.id === virusMisfortune.sourceId) {
    const hasVirusAlly = livingUnits(state, unit.player).some((ally) =>
      ally.type === "virus" && ally.mp >= (getArt("virus", "cough")?.mpCost ?? 5));
    if (hasVirusAlly && unit.stance !== "misfortune" && primary.artId === "misfortune-dance") {
      return 36;
    }
  }
  if (!carry || unit.id !== carry.sourceId) return 0;
  if (primary.artId === "age" && primary.targetId === carry.targetId) {
    return primary.stat === "strength" ? 18 : 12;
  }
  if (primary.artId === "time-stretch" && primary.targetId === carry.targetId) {
    return 4;
  }
  if (primary.artId === "rewind" && primary.targetId === carry.targetId) {
    return 24;
  }
  return 0;
}

// Greedy: the highest score wins, ties broken by the state-seeded rng so the choice is
// reproducible.
function pickBest(scored, rng) {
  let best = scored[0];
  for (const entry of scored) if (entry.score > best.score + 1e-9) best = entry;
  const top = scored.filter((entry) => Math.abs(entry.score - best.score) <= 1e-9);
  return top.length === 1 ? top[0] : top[Math.floor(rng() * top.length) % top.length];
}

// Easy: softmax over the plans within a band of the best, so it favors decent moves but
// picks a weaker one often enough to feel beatable. It never considers an illegal plan
// because the pool only holds generated (legal) ones.
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

// A PRNG seeded from the match state. Fully determined by the state, so the CPU's
// choices replay identically, yet independent of the authoritative dice stream
// (rngState advances only when the reducer rolls).
export function cpuRng(state) {
  const seed =
    (state.rngState ^
      Math.imul(state.turnNumber, 0x9e3779b1) ^
      Math.imul((state.units?.length ?? 0) + 1, 0x85ebca6b)) | 0;
  let s = createRngState(seed);
  return () => {
    const { value, state: ns } = nextRandom(s);
    s = ns;
    return value;
  };
}
