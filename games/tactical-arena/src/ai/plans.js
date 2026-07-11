// Activation-plan generation for the CPU.
//
// A "plan" is ONE complete, legal activation for a single unit, expressed at the
// rules level (not yet as commands):
//
//   { unitId, bonus, moveTo, movePhase, primary }
//     bonus     — optional bonus-action ART prefix { artId } (tile pulse). It does
//                 NOT spend the activation, so it rides in front of a real primary.
//     moveTo    — destination tile { x, y } for a basic-attack/defend move, or null
//     movePhase — "before" (move then act) | "after" (act then retreat) | null
//     primary   — { kind: "attack", targetId }
//                 | { kind: "defend" }
//                 | { kind: "art", artId, targetId? | targetPosition? | path? }
//
// The generator only ever yields plans the reducer will accept — every command
// sequence `toCommands` produces is replayed cleanly by `applyCommand` (the
// ai-plans test enforces this). The reducer still re-validates, so this is a search
// optimization, never authority. Pure and headless.
//
// Engine rules baked in here (see reducer.js): an ART replaces the whole activation
// and cannot follow a move, so ART plans are cast from the unit's origin; only basic
// attack / defend carry a move. A bonus tile pulse is the lone exception — it does
// not set primaryUsed, so it prefixes any plan but still requires a real primary to
// finish.

import { attack, attackTile, beginActivation, defend, finishActivation, moveUnit, useArt } from "../core/commands.js";
import { areEnemies, findUnit, getTileAffinity, livingUnits } from "../core/state.js";
import { getArt, getArtMpCost, getBasicAttackResourceCost, getEffectiveStats, getRageEffectValue, getUnitType, isCommandOnly, isRaging, normalizeArtAi } from "../core/unitCatalog.js";
import { getProximityBonus, isShotBlocked, isWallBetween } from "../rules/combat.js";
import { chebyshevDistance, getLegalMoves, positionKey } from "../rules/movement.js";
import {
  getArtTargetRange,
  getConeAimOptions,
  getConeCells,
  getDarkPulseTargets,
  getFirePlacementTiles,
  getFlightTiles,
  getLegalFleeTiles,
  getLineTargets,
  getProtectLandingTiles,
  getPyroclasmTargets,
  getRevivePlacementTiles,
  getReviveTargets,
  getRushContactDamage,
  getRushStepOptions,
  getRushSteps,
  getSelfBlastRadius,
  getSummonPlacementTiles,
  getTargetedBlastAimTiles,
  getTargetedBlastTargets,
  getTilePulseTargets,
  getWallPlacementTiles,
  hasConditionEnemy,
  validateRushPath
} from "../rules/arts.js";
import { isStunned } from "../rules/statuses.js";
import { buffAlliesValue, expectedFixedHit, expectedLineStrikeDamage, expectedStrike, nearestEnemyDistance } from "./evaluate.js";

const FOOTWORK_PATH_BUDGET = 3000; // DFS node cap so footwork search stays bounded
const FOOTWORK_KEEP = 8;           // best N footwork paths kept (decision 2)
const PLACEMENT_KEEP = 10;         // best N tile-placement candidates kept

export function generatePlans(state, unit) {
  if (isStunned(unit)) return [];
  // The King (commandOnly) never moves/attacks/defends — his only legal plans are his
  // four global commands. Offering anything else would replay into a COMMANDER_CANNOT_ACT
  // rejection and stall the CPU turn.
  if (isCommandOnly(unit)) {
    const plans = [];
    for (const art of getUnitType(unit.type).arts) {
      if (!artUsableForPlanning(state, unit, art)) continue;
      generateArtPlans(state, unit, art, normalizeArtAi(art), plans);
    }
    return plans;
  }
  const plans = [];
  const origin = { x: unit.position.x, y: unit.position.y };
  const moveTiles = tilesFromKeys(getLegalMoves(state, unit));
  const destinations = [origin, ...moveTiles];

  // 1. Basic-attack move-first family: from every reachable tile (standing still
  //    included) every enemy in range becomes a candidate.
  for (const dest of destinations) {
    const stays = dest.x === origin.x && dest.y === origin.y;
    for (const enemy of attackTargetsFrom(state, unit, dest)) {
      plans.push(makePlan(unit, {
        moveTo: stays ? null : dest,
        movePhase: stays ? null : "before",
        primary: { kind: "attack", targetId: enemy.id }
      }));
    }
  }

  // 1b. Destructible walls are primary attack targets too. This lets CPU units
  // dig through authored cover and lets Miner harvest adjacent wall kills for ore.
  for (const dest of destinations) {
    const stays = dest.x === origin.x && dest.y === origin.y;
    for (const wall of attackableWallsFrom(state, unit, dest)) {
      plans.push(makePlan(unit, {
        moveTo: stays ? null : dest,
        movePhase: stays ? null : "before",
        primary: { kind: "attackTile", targetPosition: wall }
      }));
    }
  }

  // 2. Hit-and-run: take the best shot from the origin, then retreat anywhere.
  const standing = attackTargetsFrom(state, unit, origin);
  if (standing.length > 0 && moveTiles.length > 0) {
    const best = bestTarget(state, unit, standing);
    for (const dest of moveTiles) {
      plans.push(makePlan(unit, { moveTo: dest, movePhase: "after", primary: { kind: "attack", targetId: best.id } }));
    }
  }

  // 3. ART plans (cast from the origin — an ART cannot follow a move).
  for (const art of [...getUnitType(unit.type).arts, getUnitType(unit.type).rageArt].filter(Boolean)) {
    if (art.bonusActionGroup) continue;            // bonus actions are attached as a prefix below
    if (!artUsableForPlanning(state, unit, art)) continue;
    generateArtPlans(state, unit, art, normalizeArtAi(art), plans);
  }

  // 4. Defend fallbacks — brace in place, or advance toward the nearest enemy then
  //    brace. Guarantees every unit always has at least one legal plan.
  plans.push(makePlan(unit, { primary: { kind: "defend" } }));
  const advance = advanceTile(state, unit, moveTiles);
  if (advance) plans.push(makePlan(unit, { moveTo: advance, movePhase: "before", primary: { kind: "defend" } }));

  // 5. Bonus tile-pulse prefix (Paladin's Light/Darkseeker). It is free of the
  //    activation but costs MP and only helps when it hits an enemy, so we offer a
  //    WITH-bonus variant of every plan and let the scorer weigh the MP against the
  //    damage (rather than forcing it on).
  const bonus = bestBonusAction(state, unit);
  if (bonus) {
    for (const plan of [...plans]) plans.push({ ...plan, bonus });
  }

  return plans;
}

function generateArtPlans(state, unit, art, ai, plans) {
  switch (ai.intent) {
    case "strike": {
      const physical = (art.damageType ?? "physical") === "physical";
      for (const enemy of rangedTargetsFrom(state, unit, unit.position, physical, art)) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetId: enemy.id } }));
      }
      break;
    }
    case "statusCast": {
      for (const enemy of rangedTargetsFrom(state, unit, unit.position, false, art)) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetId: enemy.id } }));
      }
      break;
    }
    case "coneAoe": {
      for (const direction of getConeAimOptions(state, unit)) {
        const cells = getConeCells(state, unit, direction, art);
        if (cells && coneHitsEnemy(state, unit, cells)) {
          plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetPosition: direction } }));
        }
      }
      break;
    }
    case "selfBlast": {
      const radius = getSelfBlastRadius(state, unit, art);
      if (enemiesWithin(state, unit, radius).length > 0) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id } }));
      }
      break;
    }
    case "healAllies": {
      if (woundedAlliesInReach(state, unit, art).length > 0) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id } }));
      }
      break;
    }
    case "reposition": {
      for (const tile of tilesFromKeys(getLegalFleeTiles(state, unit))) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetPosition: tile } }));
      }
      break;
    }
    case "rush": {
      for (const path of generateRushPaths(state, unit, art)) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, path } }));
      }
      break;
    }
    case "summon": {
      // Honor the per-summoner cap the reducer enforces, so we never emit a
      // summon the reducer would reject mid-activation.
      const maxActive = art.summon?.maxActive ?? 1;
      const activeSummons = state.units.filter((u) => u.hp > 0 && u.summonerId === unit.id).length;
      if (activeSummons >= maxActive) break;
      for (const tile of summonCandidates(state, unit, art)) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetPosition: tile } }));
      }
      break;
    }
    case "placeObject": {
      for (const tile of placementCandidates(state, unit, art, ai)) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetPosition: tile } }));
      }
      break;
    }
    case "buffAllies": {
      // Self/team/global support dance with no target (Witch Doctor Fire/Spirit/
      // Misfortune/Black Death). Only offer it when it would actually do something —
      // buffAlliesValue is 0 for a no-op cast — so the CPU never dances pointlessly.
      if (buffAlliesValue(state, unit, art) > 0) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id } }));
      }
      break;
    }
    case "commandBuff": {
      // King commands (Strike/Hold/Pursue/Higher Ground): global, 0 MP, no target — one
      // plan per command. The King is forced to issue one every turn, so these are always
      // offered; the controller picks the strongest via commandBuffValue.
      plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id } }));
      break;
    }
    case "statBuff": {
      // Age: an ally-OR-enemy persistent ±1 STR/DEF. Offer both stat choices per legal
      // target (both replay legally: ally→buff, enemy→drain) and let the scorer pick.
      // A wall blocks the cast for either team, matching resolveAge.
      const range = getEffectiveStats(unit, state).attackRange;
      for (const target of livingUnits(state)) {
        if (target.id === unit.id) continue;
        if (chebyshevDistance(unit.position, target.position) > range) continue;
        if (isWallBetween(state, unit.position, target.position, unit)) continue;
        for (const stat of ["strength", "defense"]) {
          plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetId: target.id, stat } }));
        }
      }
      break;
    }
    case "hasten": {
      // Time Stretch: haste an ally (+MOVE) or slow an enemy. Slowing an enemy is a
      // ranged ability (wall-blocked); a friendly haste is not, matching resolveTimeStretch.
      const range = getEffectiveStats(unit, state).attackRange;
      for (const target of livingUnits(state)) {
        if (target.id === unit.id) continue;
        if (chebyshevDistance(unit.position, target.position) > range) continue;
        if (areEnemies(unit, target) && isWallBetween(state, unit.position, target.position, unit)) continue;
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetId: target.id } }));
      }
      break;
    }
    case "buffAlly": {
      // Anoint: a friendly-only +range buff. One plan per ALLY in range (never self);
      // a wall does not block a friendly cast, matching resolveAnoint.
      const range = art.targeting?.range ?? getEffectiveStats(unit, state).attackRange;
      for (const target of livingUnits(state, unit.player)) {
        if (target.id === unit.id) continue;
        if (chebyshevDistance(unit.position, target.position) > range) continue;
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetId: target.id } }));
      }
      break;
    }
    case "healAlly": {
      const range = art.targeting?.range ?? getEffectiveStats(unit, state).attackRange;
      const excludeSelf = Boolean(art.targeting?.excludeSelf);
      for (const target of livingUnits(state, unit.player)) {
        if (excludeSelf && target.id === unit.id) continue;
        if (chebyshevDistance(unit.position, target.position) > range) continue;
        const stats = getEffectiveStats(target, state);
        const relay = art.effect?.type === "relayPower";
        const useful = relay
          ? (target.hp < stats.maxHp || target.mp < stats.maxMp)
          : target.hp < stats.maxHp;
        if (!useful) continue;
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetId: target.id } }));
      }
      break;
    }
    case "cleanseAlly": {
      // Purify: only offer allied targets that actually carry statuses worth removing.
      const range = art.targeting?.range ?? getEffectiveStats(unit, state).attackRange;
      for (const target of livingUnits(state, unit.player)) {
        if (target.id === unit.id) continue;
        if (chebyshevDistance(unit.position, target.position) > range) continue;
        if (!target.statuses?.length) continue;
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetId: target.id } }));
      }
      break;
    }
    case "revive": {
      // Rewind (rage-gated by artUsableForPlanning): each fallen ally × a few safe
      // placement tiles (preferring tiles far from the enemy).
      const deadAllies = getReviveTargets(state, unit);
      if (deadAllies.length === 0) break;
      const tiles = tilesFromKeys(getRevivePlacementTiles(state, unit, art))
        .sort((a, b) => nearestEnemyDistance(state, unit.player, b) - nearestEnemyDistance(state, unit.player, a))
        .slice(0, PLACEMENT_KEEP);
      for (const dead of deadAllies) {
        for (const tile of tiles) {
          plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetId: dead.id, targetPosition: tile } }));
        }
      }
      break;
    }
    case "grab": {
      // Tether Grab: pull the first ENEMY on a straight ray (grabbing an ally is a no-op
      // for the CPU). Mirrors getLineTargets(includeAllies:true) then keeps only foes, so
      // every plan replays cleanly through resolveTetherGrab.
      for (const { unit: enemy } of getLineTargets(state, unit, art.targeting.range, { includeAllies: true })) {
        if (!areEnemies(unit, enemy)) continue;
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetId: enemy.id } }));
      }
      break;
    }
    case "lineStrike": {
      // Rocket Punch: strike the first enemy on a straight ray (allies block, so the ray
      // stops at a friendly body and never yields an illegal target).
      for (const { unit: enemy } of getLineTargets(state, unit, art.targeting.range, { includeAllies: false })) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetId: enemy.id } }));
      }
      break;
    }
    case "recharge": {
      // Recharge: only worth offering when it does something (refuel MP, or mend 1 HP at
      // full MP). It is always legal (0 MP, self-target), so no line-of-sight to check.
      const stats = getEffectiveStats(unit, state);
      if (unit.mp < stats.maxMp || unit.hp < stats.maxHp) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id } }));
      }
      break;
    }
    case "protectAlly": {
      for (const ally of livingUnits(state, unit.player)) {
        if (ally.id === unit.id) continue;
        if (getProtectLandingTiles(state, unit, ally, art).size === 0) continue;
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetId: ally.id } }));
      }
      break;
    }
    case "flightStrike": {
      // Flight: fly to an empty tile, then a small TRUE blast around the landing. Only
      // offer landings that would actually catch an enemy in the blast (capped), so the
      // Gargoyle repositions purposefully instead of blinking to empty air.
      const radius = art.blastRadius ?? 1;
      const tiles = tilesFromKeys(getFlightTiles(state, unit, art))
        .filter((tile) => livingUnits(state).some((u) => areEnemies(unit, u) && chebyshevDistance(tile, u.position) <= radius))
        .sort((a, b) => nearestEnemyDistance(state, unit.player, a) - nearestEnemyDistance(state, unit.player, b))
        .slice(0, PLACEMENT_KEEP);
      for (const tile of tiles) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetPosition: tile } }));
      }
      break;
    }
    case "lineBurst": {
      // Pyroclasm burns every enemy on its rays; Dark Pulse hits first contact on
      // each ray and is worth considering when it contacts any enemy.
      const targets = art.targeting?.shape === "darkPulse"
        ? getDarkPulseTargets(state, unit).filter(({ unit: target }) => areEnemies(unit, target))
        : getPyroclasmTargets(state, unit, art);
      if (targets.length > 0) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id } }));
      }
      break;
    }
    case "statusAoe": {
      // Smog: a self-centred blind cloud. Offer only when an enemy stands in the radius,
      // so the CPU never fogs empty air.
      const radius = getSelfBlastRadius(state, unit, art);
      if (enemiesWithin(state, unit, radius).length > 0) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id } }));
      }
      break;
    }
    case "poisonBurst": {
      // Poison Tick / Explosion / Dark Tick / Banish: detonate enemies matching the art's
      // condition (poison / blind status, or a tile affinity). Offer only when one exists —
      // this also keeps every plan legal for the condition-gated bursts, so it replays
      // cleanly through the reducer.
      const condition = art.condition ?? { status: "poison" };
      const any = livingUnits(state).some((u) => areEnemies(unit, u) &&
        (condition.status
          ? (u.statuses ?? []).some((s) => s.type === condition.status)
          : getTileAffinity(state, u.position) === condition.affinity));
      if (any) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id } }));
      }
      break;
    }
    case "targetedBlast": {
      // Thunderous Charge: a chosen tile that detonates a radius blast. Offer only tiles
      // whose blast catches an enemy (never an enemy-occupied tile — getTargetedBlastAimTiles
      // already excludes those), most-enemies-first and capped, so it replays cleanly.
      const radius = art.targeting?.radius ?? 2;
      const tiles = tilesFromKeys(getTargetedBlastAimTiles(state, unit, art))
        .map((tile) => ({ tile, count: getTargetedBlastTargets(state, unit, tile, radius).length }))
        .filter((entry) => entry.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, PLACEMENT_KEEP);
      for (const { tile } of tiles) {
        plans.push(makePlan(unit, { primary: { kind: "art", artId: art.id, targetPosition: tile } }));
      }
      break;
    }
    default:
      break;
  }
}

// Apply a plan to a lightweight projected board (positions + EXPECTED hp) for the
// evaluator to score. Returns the cloned board, the actor's projected entry, and its
// final tile. Direct HP changes are modeled here; status/zone/MP value is added as
// score terms by the controller (mirrors Mini-Tactics' split).
export function projectPlan(state, plan) {
  const board = livingUnits(state).map((u) => ({ ...u, position: { ...u.position } }));
  const byId = new Map(board.map((u) => [u.id, u]));
  const actor = byId.get(plan.unitId);

  // Bonus tile pulse fires first, from the origin (before any move).
  if (plan.bonus) {
    const art = getArt(actor.type, plan.bonus.artId);
    const amount = Math.max(0, Number(art.effect.amount) || 0);
    for (const target of getTilePulseTargets(state, actor, art)) {
      const entry = byId.get(target.id);
      if (entry) entry.hp = Math.max(0, entry.hp - amount);
    }
  }

  if (plan.movePhase === "before" && plan.moveTo) actor.position = { ...plan.moveTo };
  applyPrimaryProjection(state, board, byId, actor, plan.primary);
  if (plan.movePhase === "after" && plan.moveTo) actor.position = { ...plan.moveTo };

  return { board, actor, finalPos: { ...actor.position } };
}

function applyPrimaryProjection(state, board, byId, actor, primary) {
  if (primary.kind === "attack") {
    const target = byId.get(primary.targetId);
    if (target) target.hp = expectedStrike(state, actor, target).expTargetHp;
    return;
  }
  if (primary.kind === "defend") {
    actor.defending = true;
    return;
  }
  // primary.kind === "art"
  const art = getArt(actor.type, primary.artId);
  const intent = normalizeArtAi(art).intent;
  switch (intent) {
    case "strike": {
      const target = byId.get(primary.targetId);
      if (target) target.hp = expectedStrike(state, actor, target, art).expTargetHp;
      break;
    }
    case "statusCast":
      break; // no HP change; the status is a controller score term
    case "coneAoe": {
      const cells = getConeCells(state, actor, primary.targetPosition, art) ?? [];
      const cellKeys = new Set(cells.map(positionKey));
      for (const target of board) {
        if (!areEnemies(actor, target) || !cellKeys.has(positionKey(target.position))) continue;
        const amount = art.damage.amount + (art.id === "volley-shot" ? getProximityBonus(actor, target) : 0);
        target.hp = Math.max(0, target.hp - amount);
      }
      break;
    }
    case "selfBlast": {
      const radius = getSelfBlastRadius(state, actor, art);
      const dtype = art.damage.type ?? "magic";
      const affinity = art.damage?.affinity ?? art.damageAffinity ?? null;
      for (const target of board) {
        if (!areEnemies(actor, target) || chebyshevDistance(actor.position, target.position) > radius) continue;
        target.hp = Math.max(0, target.hp - expectedFixedHit(state, target, { amount: art.damage.amount, type: dtype, affinity }).damage);
      }
      // A self-sacrifice blast (Juggernaut's Self Destruct) consumes the caster — model the
      // loss so the CPU only detonates when the enemies wiped are worth its own life.
      if (art.selfKill) actor.hp = 0;
      break;
    }
    case "healAllies": {
      const amount = Math.max(0, Number(art.effect.amount) || 0);
      for (const ally of board) {
        if (ally.player !== actor.player) continue;
        if (!art.effect.global && chebyshevDistance(actor.position, ally.position) > art.effect.radius) continue;
        ally.hp = Math.min(getEffectiveStats(ally, state).maxHp, ally.hp + amount);
      }
      break;
    }
    case "reposition":
      actor.position = { ...primary.targetPosition };
      break;
    case "rush": {
      const rushDamage = getRushContactDamage(actor, art);
      for (const step of primary.path) {
        const victim = board.find((u) => areEnemies(actor, u) && u.position.x === step.x && u.position.y === step.y);
        if (victim) victim.hp = Math.max(0, victim.hp - rushDamage);
      }
      actor.position = { ...primary.path.at(-1) };
      break;
    }
    case "summon": {
      const summonType = art.summon.type;
      board.push({
        id: `${actor.id}-proj-summon`, type: summonType, player: actor.player,
        hp: getUnitType(summonType).stats.maxHp, position: { ...primary.targetPosition },
        statModifiers: {}, statuses: []
      });
      break;
    }
    case "placeObject":
      break; // zone value is a controller score term, not an HP change
    case "buffAllies":
      break; // buffs/cleanse/blind change no HP now; value is a controller score term
    case "statBuff":
    case "hasten":
    case "buffAlly":
    case "cleanseAlly":
      break; // Utility casts change stats/statuses, not HP now; value is a controller term
    case "healAlly": {
      const ally = byId.get(primary.targetId);
      if (ally) {
        if (art.effect?.type === "relayPower") {
          actor.hp = Math.max(0, actor.hp - (art.effect.hp ?? 0));
          actor.mp = Math.max(0, actor.mp - (art.effect.mp ?? 0));
          ally.hp = Math.min(getEffectiveStats(ally, state).maxHp, ally.hp + (art.effect.hp ?? 0));
          ally.mp = Math.min(getEffectiveStats(ally, state).maxMp, ally.mp + (art.effect.mp ?? 0));
        } else {
          ally.hp = Math.min(getEffectiveStats(ally, state).maxHp, ally.hp + (art.heal?.amount ?? 0));
        }
      }
      break;
    }
    case "grab": {
      // Tether Grab: an EV-weighted 3 magic (foe only, rolls to-hit) + the pull to the
      // tile one step from the actor along the ray. The planner only ever grabs enemies;
      // the pull is applied as the modal (landed) outcome.
      const target = byId.get(primary.targetId);
      if (target) {
        target.hp = Math.max(0, target.hp - expectedLineStrikeDamage(state, actor, target, { amount: art.damage.amount, type: "magic" }));
        const dir = { x: Math.sign(target.position.x - actor.position.x), y: Math.sign(target.position.y - actor.position.y) };
        target.position = { x: actor.position.x + dir.x, y: actor.position.y + dir.y };
      }
      break;
    }
    case "lineStrike": {
      const target = byId.get(primary.targetId);
      if (target) target.hp = Math.max(0, target.hp - expectedLineStrikeDamage(state, actor, target, { amount: art.damage.amount, type: "physical" }));
      break; // the stun rider is a controller score term
    }
    case "recharge": {
      // Refuel changes MP (not modeled as material); at full MP it mends 1 HP.
      const stats = getEffectiveStats(actor, state);
      if (actor.mp >= stats.maxMp) actor.hp = Math.min(stats.maxHp, actor.hp + (art.restore?.hpIfFull ?? 0));
      break;
    }
    case "protectAlly": {
      const ally = byId.get(primary.targetId);
      if (ally) {
        const step = { x: Math.sign(ally.position.x - actor.position.x), y: Math.sign(ally.position.y - actor.position.y) };
        actor.position = { x: ally.position.x - step.x, y: ally.position.y - step.y };
        actor.defending = true;
        ally.defending = true;
      }
      break;
    }
    case "flightStrike": {
      // Fly to the landing tile, then a TRUE blast (ignores DEF/Defend) to enemies within
      // blastRadius of it. Set the projected final position so exposure scoring reads it.
      actor.position = { ...primary.targetPosition };
      const radius = art.blastRadius ?? 1;
      const amount = art.damage?.amount ?? 0;
      const affinity = art.damage?.affinity ?? art.damageAffinity ?? null;
      for (const target of board) {
        if (!areEnemies(actor, target) || chebyshevDistance(actor.position, target.position) > radius) continue;
        target.hp = Math.max(0, target.hp - expectedFixedHit(state, target, { amount, type: "true", affinity }).damage);
      }
      break;
    }
    case "lineBurst": {
      // Pyroclasm burns rays; Dark Pulse damages first-contact enemies on each ray.
      // The cast has no move, so the ray geometry reads from the real state at origin.
      const amount = art.damage?.amount ?? 0;
      const dtype = art.damage?.type ?? "magic";
      const affinity = art.damage?.affinity ?? art.damageAffinity ?? null;
      const ids = new Set((art.targeting?.shape === "darkPulse"
        ? getDarkPulseTargets(state, actor).filter(({ unit: target }) => areEnemies(actor, target)).map(({ unit: target }) => target.id)
        : getPyroclasmTargets(state, actor, art).map((u) => u.id)));
      for (const target of board) {
        if (!ids.has(target.id)) continue;
        target.hp = Math.max(0, target.hp - expectedFixedHit(state, target, { amount, type: dtype, affinity }).damage);
      }
      break;
    }
    case "targetedBlast": {
      // Thunderous Charge: fixed physical to every enemy within the blast radius of the
      // chosen tile (DEF + Defend apply, like resolveDamage). The stun is a controller term.
      const radius = art.targeting?.radius ?? 2;
      const amount = art.damage?.amount ?? 0;
      for (const target of board) {
        if (!areEnemies(actor, target)) continue;
        if (chebyshevDistance(primary.targetPosition, target.position) > radius) continue;
        target.hp = Math.max(0, target.hp - expectedFixedHit(state, target, { amount, type: "physical" }).damage);
      }
      break;
    }
    case "statusAoe":
      break; // Smog changes no HP now; the blind value is a controller score term.
    case "poisonBurst": {
      // Poison Tick / Explosion / Dark Tick / Banish: TRUE damage (no DEF/Defend) to every
      // enemy matching the art's condition, plus a splash to enemies near one. selfKill
      // (Explosion / Banish) consumes the caster; an hpCost (Dark Tick) is modeled too.
      const amount = Math.max(0, Number(art.damage?.amount) || 0);
      const splash = art.splash ?? null;
      const condition = art.condition ?? { status: "poison" };
      const matches = (u) => condition.status
        ? (u.statuses ?? []).some((s) => s.type === condition.status)
        : getTileAffinity(state, u.position) === condition.affinity;
      const affected = board.filter((u) => areEnemies(actor, u) && matches(u));
      const affectedIds = new Set(affected.map((u) => u.id));
      for (const target of board) {
        if (!areEnemies(actor, target)) continue;
        let dmg = 0;
        if (affectedIds.has(target.id)) dmg = amount;
        else if (splash && affected.some((p) => chebyshevDistance(p.position, target.position) <= splash.radius)) dmg = Math.max(0, Number(splash.amount) || 0);
        if (dmg > 0) target.hp = Math.max(0, target.hp - dmg);
      }
      if (art.hpCost) actor.hp = Math.max(0, actor.hp - art.hpCost);
      if (art.selfKill) actor.hp = 0;
      break;
    }
    case "revive": {
      // Rewind returns the fallen ally to the board at full HP — the material term
      // (unitThreatValue + hp) is exactly the value of the revival.
      const dead = state.units.find((u) => u.id === primary.targetId);
      if (dead) {
        board.push({
          ...dead,
          hp: getUnitType(dead.type).stats.maxHp,
          position: { ...primary.targetPosition },
          statuses: [], statModifiers: {}, linkedStatMods: []
        });
      }
      break;
    }
    default:
      break;
  }
}

// Expand a plan into the begin → (bonus) → (move) → primary → (retreat) → finish
// command sequence the reducer expects. An ART primary spends the activation itself,
// so it gets NO trailing finishActivation; basic attack / defend do.
export function toCommands(player, plan) {
  const commands = [beginActivation(player, plan.unitId)];
  if (plan.bonus) commands.push(useArt(player, plan.unitId, plan.bonus.artId));
  if (plan.movePhase === "before" && plan.moveTo) commands.push(moveUnit(player, plan.unitId, plan.moveTo.x, plan.moveTo.y));

  const p = plan.primary;
  const artPrimary = p.kind === "art";
  if (p.kind === "attack") commands.push(attack(player, plan.unitId, p.targetId));
  else if (p.kind === "attackTile") commands.push(attackTile(player, plan.unitId, p.targetPosition.x, p.targetPosition.y));
  else if (p.kind === "defend") commands.push(defend(player, plan.unitId));
  else commands.push(artCommand(player, plan.unitId, p));

  if (plan.movePhase === "after" && plan.moveTo) commands.push(moveUnit(player, plan.unitId, plan.moveTo.x, plan.moveTo.y));
  if (!artPrimary || plan.primaryKeepsActivationOpen) commands.push(finishActivation(player, plan.unitId));
  return commands;
}

// Total MP an entire plan spends (bonus prefix + ART primary). Basic attack / defend
// cost nothing. The controller nets this against the plan's value.
export function planMpCost(state, plan) {
  const unit = findUnit(state, plan.unitId);
  let cost = 0;
  // getArtMpCost honors a raging Juggernaut's freeArts (0-cost ARTS), so the CPU doesn't
  // over-count MP it won't actually spend.
  if (plan.bonus) cost += getArtMpCost(unit, getArt(unit.type, plan.bonus.artId), state);
  if (plan.primary.kind === "attackTile") cost += getBasicAttackResourceCost(unit, plan.primary.targetPosition);
  if (plan.primary.kind === "art") cost += getArtMpCost(unit, getArt(unit.type, plan.primary.artId), state);
  return cost;
}

// --- targeting helpers ------------------------------------------------------

// Enemies a unit could basic-attack if it stood on `pos` (physical: body- AND
// wall-blocked, exactly like the reducer's attack()).
function attackTargetsFrom(state, unit, pos) {
  const moved = withUnitAt(state, unit.id, pos);
  const actor = findUnit(moved, unit.id);
  if (getEffectiveStats(actor, moved).attackRange < 1) return [];
  return rangedTargetsFrom(moved, actor, pos, true);
}

function attackableWallsFrom(state, unit, pos) {
  const moved = withUnitAt(state, unit.id, pos);
  const actor = findUnit(moved, unit.id);
  const range = getEffectiveStats(actor, moved).attackRange;
  if (range < 1) return [];
  const walls = [];
  for (const [key, object] of Object.entries(moved.tileObjects ?? {})) {
    if (object?.kind !== "wall") continue;
    const [x, y] = key.split(",").map(Number);
    const wall = { x, y };
    if (chebyshevDistance(pos, wall) > range) continue;
    if (isWallBetween(moved, pos, wall, actor) || isShotBlocked(moved, pos, wall, actor)) continue;
    const resourceCost = getBasicAttackResourceCost(actor, wall);
    if (resourceCost > 0 && actor.mp < resourceCost) continue;
    walls.push(wall);
  }
  return walls.sort((a, b) =>
    nearestEnemyDistance(state, unit.player, a) - nearestEnemyDistance(state, unit.player, b)
  );
}

// Enemies in range of `pos`, gated by line of sight. `physical` adds the unit
// body-block on top of the always-on wall block (matches the reducer's split).
function rangedTargetsFrom(state, actor, pos, physical, art = null) {
  const range = art ? getArtTargetRange(state, actor, art) : getEffectiveStats(actor, state).attackRange;
  return livingUnits(state).filter((target) =>
    areEnemies(actor, target) &&
    chebyshevDistance(pos, target.position) <= range &&
    !isWallBetween(state, pos, target.position, actor) &&
    (!physical || !isShotBlocked(state, pos, target.position, actor))
  );
}

function bestTarget(state, unit, targets) {
  let best = targets[0];
  let bestScore = -Infinity;
  for (const target of targets) {
    const ev = expectedStrike(state, unit, target);
    const score = ev.pKill * 100 + ev.expDamage; // lethal shots dominate
    if (score > bestScore) { bestScore = score; best = target; }
  }
  return best;
}

function coneHitsEnemy(state, actor, cells) {
  const keys = new Set(cells.map(positionKey));
  return livingUnits(state).some((u) => areEnemies(actor, u) && keys.has(positionKey(u.position)));
}

function enemiesWithin(state, actor, radius) {
  return livingUnits(state).filter((u) => areEnemies(actor, u) && chebyshevDistance(actor.position, u.position) <= radius);
}

function woundedAlliesInReach(state, actor, art) {
  return livingUnits(state, actor.player).filter((ally) =>
    ally.hp < getEffectiveStats(ally, state).maxHp &&
    (art.effect.global || chebyshevDistance(actor.position, ally.position) <= art.effect.radius));
}

// The reachable tile that closes the most distance to the nearest enemy, for a
// purposeful advance when the unit cannot yet act. Null when nothing improves.
function advanceTile(state, unit, moveTiles) {
  const here = nearestEnemyDistance(state, unit.player, unit.position);
  let best = null;
  let bestDistance = here;
  for (const dest of moveTiles) {
    const distance = nearestEnemyDistance(state, unit.player, dest);
    if (distance < bestDistance) { bestDistance = distance; best = dest; }
  }
  return best;
}

// Best usable bonus tile pulse for this unit (most enemies hit), or null. Used as a
// free prefix. Honors silence / MP / rage via artUsableForPlanning.
function bestBonusAction(state, unit) {
  let best = null;
  let bestCount = 0;
  for (const art of [...getUnitType(unit.type).arts, getUnitType(unit.type).rageArt].filter(Boolean)) {
    if (!art.bonusActionGroup || normalizeArtAi(art).intent !== "tilePulse") continue;
    if (!artUsableForPlanning(state, unit, art)) continue;
    const count = getTilePulseTargets(state, unit, art).length;
    if (count > bestCount) { bestCount = count; best = { artId: art.id }; }
  }
  return best;
}

// Bounded DFS for footwork: enumerate up to a node budget of full-length legal paths,
// then keep the few that thread through the most enemies (decision 2).
function generateRushPaths(state, unit, art) {
  const steps = getRushSteps(unit, art, state);
  const results = [];
  let budget = FOOTWORK_PATH_BUDGET;

  const dfs = (path) => {
    if (budget <= 0) return;
    if (path.length === steps) {
      if (validateRushPath(state, unit, path, art)) results.push(path);
      return;
    }
    for (const key of getRushStepOptions(state, unit, path, art)) {
      if (budget <= 0) break;
      budget -= 1;
      const [x, y] = key.split(",").map(Number);
      dfs([...path, { x, y }]);
    }
  };
  dfs([]);

  return results
    .map((path) => ({ path, enemies: enemiesOnPath(state, unit, path), pull: -nearestEnemyDistance(state, unit.player, path.at(-1)) }))
    .sort((a, b) => b.enemies - a.enemies || b.pull - a.pull)
    .slice(0, FOOTWORK_KEEP)
    .map((entry) => entry.path);
}

function enemiesOnPath(state, actor, path) {
  let count = 0;
  for (const step of path) {
    const occupant = livingUnits(state).find((u) => u.position.x === step.x && u.position.y === step.y);
    if (occupant && areEnemies(actor, occupant)) count += 1;
  }
  return count;
}

// Summon tiles, preferring those nearest an enemy (the Ghoul projects an aura), capped.
function summonCandidates(state, unit, art) {
  return tilesFromKeys(getSummonPlacementTiles(state, unit, art))
    .sort((a, b) => nearestEnemyDistance(state, unit.player, a) - nearestEnemyDistance(state, unit.player, b))
    .slice(0, PLACEMENT_KEEP);
}

// Tile-placement candidates, filtered by the art's `placeNear` hint to the tiles
// that could matter, then capped (decision 2). Fire wants enemies; a wall wants to
// shield friends.
function placementCandidates(state, unit, art, ai) {
  const legal = art.fire
    ? tilesFromKeys(getFirePlacementTiles(state, unit, art))
    : tilesFromKeys(getWallPlacementTiles(state, unit, art));
  const near = ai.evHints?.placeNear ?? "enemy";

  const relevant = legal.filter((tile) => {
    if (near === "enemy") {
      return livingUnits(state).some((u) => areEnemies(unit, u) && chebyshevDistance(tile, u.position) <= 1);
    }
    // "threatenedAlly" / "chokepoint" / "self": shield a friendly piece — keep tiles
    // adjacent to an ally (cheap cover proxy; the controller scores zoneValue).
    return livingUnits(state, unit.player).some((u) => u.id !== unit.id && chebyshevDistance(tile, u.position) <= 1);
  });

  return (relevant.length ? relevant : legal)
    .sort((a, b) => nearestEnemyDistance(state, unit.player, a) - nearestEnemyDistance(state, unit.player, b))
    .slice(0, PLACEMENT_KEEP);
}

// --- shared utilities -------------------------------------------------------

function artPrimaryKeepsActivationOpen(unit, primary) {
  if (primary?.kind !== "art") return false;
  const art = getArt(unit.type, primary.artId);
  return Boolean(!art?.bonusActionGroup && getRageEffectValue(unit, "moveAndUseArts", false));
}

function makePlan(unit, { bonus = null, moveTo = null, movePhase = null, primary }) {
  return {
    unitId: unit.id,
    bonus,
    moveTo,
    movePhase,
    primary,
    primaryKeepsActivationOpen: artPrimaryKeepsActivationOpen(unit, primary)
  };
}

// Planning-time ART legality. Mirrors canUseArt's SUBSTANTIVE gates (implemented,
// active, alive, not spent, not stunned/silenced, enough MP, rage unlocked) but omits the
// open-activation phase checks (moved/primaryUsed/bonus group) — during planning the
// unit has not acted yet, and the reducer re-validates once the activation opens.
function artUsableForPlanning(state, unit, art) {
  return Boolean(
    art?.implemented && art.kind === "active" &&
    unit.hp > 0 && !unit.spent &&
    !isStunned(unit) &&
    !unit.statuses?.some((status) => status.type === "silence") &&
    !(isRaging(unit) && art.replacedByRageArt) &&
    unit.mp >= getArtMpCost(unit, art, state) &&
    (!art.rageLocked || isRaging(unit)) &&
    !(art.hpCost && !art.selfKill && unit.hp <= art.hpCost) &&
    (!art.requiresConditionEnemy || hasConditionEnemy(state, unit, art.condition)) &&
    !(art.effect?.type === "studyTarget" && unit.studiedTargetId && state.units.some((target) => target.id === unit.studiedTargetId && target.hp > 0)) &&
    !(art.effect?.type === "relayPower" && (unit.hp <= (art.effect.hp ?? 0) || unit.mp < (art.effect.mp ?? 0)))
  );
}

function artCommand(player, unitId, primary) {
  if (primary.path) return useArt(player, unitId, primary.artId, primary.path);
  // Collect whichever targeting fields the plan carries — Age adds `stat`, Rewind needs
  // BOTH a targetId (the fallen ally) and a targetPosition (the tile).
  const targeting = {};
  if (primary.targetId != null) targeting.targetId = primary.targetId;
  if (primary.targetPosition) targeting.targetPosition = primary.targetPosition;
  if (primary.stat) targeting.stat = primary.stat;
  return Object.keys(targeting).length
    ? useArt(player, unitId, primary.artId, targeting)
    : useArt(player, unitId, primary.artId);
}

function withUnitAt(state, unitId, pos) {
  return {
    ...state,
    units: state.units.map((u) => (u.id === unitId ? { ...u, position: { x: pos.x, y: pos.y } } : u))
  };
}

function tilesFromKeys(keySet) {
  return [...keySet].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return { x, y };
  });
}
