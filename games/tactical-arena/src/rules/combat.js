import { getEffectiveStats, getUnitType, isDefending, isRaging } from "../core/unitCatalog.js";
import { drawValue } from "../core/rng.js";
import { resolveDamage } from "./damage.js";
import { traceGridLine } from "./movement.js";
import { getTileAffinity, unitAt } from "../core/state.js";

// Body-block line of sight: a physical ranged shot is stopped if ANY unit — friend
// OR foe — stands on a tile strictly between the attacker and its target. Carried
// over from Mini-Tactics (isRangerShotBlocked). Adjacent strikes have no tile in
// between, so melee passes through untouched and needs no special-casing. Only the
// physical-strike paths consult this; magic ARTS (Spark, Banish), pure casts
// (Silence), the Volley Shot rain, and self-centred blasts (Nuke) ignore bodies.
// `from`/`to` are {x,y} positions.
export function isShotBlocked(state, from, to) {
  return traceGridLine(from.x, from.y, to.x, to.y)
    .slice(1, -1)
    .some((cell) => Boolean(unitAt(state, cell)));
}

// Combat roll tuning — kept as named constants so balance stays in one place. The
// engine rolls a probability in [0,1) (not literally a d6), so these compose with
// the percentage status checks ARTS already use (70% blind, 60% poison, …).
export const COMBAT = Object.freeze({
  MISS_CHANCE: 0.10,  // base whiff on any attack
  CRIT_CHANCE: 0.15   // base crit on a landed attack
});

// A raging unit may carry combat overrides in its catalog data (the Archer's RAGE
// never-miss + 50% crit). Non-raging units, and units whose RAGE has no combat
// block (the Swordsman's Quick), get null and fall back to the base chances.
function rageCombat(unit) {
  return isRaging(unit) ? (getUnitType(unit.type).rageArt?.combat ?? null) : null;
}

// Probability that this attacker's swing misses *right now*. Never-miss (raging
// Archer) overrides everything; otherwise a blinded unit always misses; otherwise
// the base whiff chance.
export function getMissChance(attacker) {
  if (rageCombat(attacker)?.neverMiss) return 0;
  if (isBlinded(attacker)) return 1;
  return COMBAT.MISS_CHANCE;
}

// Probability that a landed swing crits. The raging Archer's kit raises this to
// 50%; everyone else uses the base chance.
export function getCritChance(attacker) {
  const crit = rageCombat(attacker)?.criticalChance;
  return Number.isFinite(crit) ? crit : COMBAT.CRIT_CHANCE;
}

// Resolve a single swing's to-hit and crit against the authoritative seed. Draws
// the hit value first; only a landed swing draws for crit (so a miss costs one
// draw, a hit costs two — deterministic from state, so replay-safe). `overrides`
// lets a command pin either draw for tests / recorded replay without consuming the
// seed. Returns the advanced rngState plus the outcome flags and the raw rolls.
export function rollToHit(rngState, attacker, overrides = {}) {
  const hit = drawValue(rngState, overrides.attackRoll);
  const missed = hit.value < getMissChance(attacker);
  if (missed) return { rngState: hit.rngState, missed: true, critical: false, hitRoll: hit.value, critRoll: null };
  const crit = drawValue(hit.rngState, overrides.critRoll);
  return { rngState: crit.rngState, missed: false, critical: crit.value < getCritChance(attacker), hitRoll: hit.value, critRoll: crit.value };
}

// Data-driven proximity passive (Archer's Close Shot): bonus damage that rises the
// nearer the attacker stands. The band table lives in the unit catalog so balance
// stays in data, not here. Returns 0 for any unit without a proximity passive.
export function getProximityBonus(attacker, target) {
  const effect = getUnitType(attacker.type).passive?.effect;
  if (effect?.type !== "proximityDamage") return 0;
  const distance = effect.metric === "euclidean"
    ? Math.hypot(attacker.position.x - target.position.x, attacker.position.y - target.position.y)
    : Math.max(Math.abs(attacker.position.x - target.position.x), Math.abs(attacker.position.y - target.position.y));
  // Bands are ordered closest-first; the first one the attacker is inside wins.
  for (const band of effect.bands) if (distance <= band.maxDistance) return band.bonusDamage;
  return 0;
}

function getTileStrikeBonus(attacker, target, state) {
  if (!state || !isRaging(attacker)) return 0;
  const definition = getUnitType(attacker.type);
  for (const source of [definition.ragePassive, definition.rageArt]) {
    const bonus = source?.effect?.tileStrikeBonus;
    if (!bonus) continue;
    if (getTileAffinity(state, attacker.position) === bonus.affinity &&
        getTileAffinity(state, target.position) === bonus.affinity) {
      return Math.max(0, Number(bonus.amount) || 0);
    }
  }
  return 0;
}

// Flat damage reduction granted to a unit's team by a living host passive (the
// Necromancer's Dead Zone: -1 magic damage). Additive across hosts, never below
// zero. Applied wherever magic damage is finalized so the forecast and the reducer
// agree. Returns 0 for any team without a matching host.
export function getTeamDamageReduction(target, state, damageType) {
  if (!state?.units) return 0;
  let reduction = 0;
  for (const source of state.units) {
    if (source.hp <= 0 || source.player !== target.player) continue;
    const definition = getUnitType(source.type);
    for (const passive of [definition.passive, ...definition.arts, definition.ragePassive, definition.rageArt]) {
      if (passive?.effect?.type === "teamDamageReduction" && (passive.effect.damageType ?? "magic") === damageType) {
        reduction += Math.max(0, Number(passive.effect.amount) || 0);
      }
    }
  }
  return reduction;
}

// Resolves a strike with an explicit damage type override (used by magic-damage ARTS
// like Spark and Banish). Falls back to a physical strike when no override is given.
// Returns the same shape as resolvePhysicalStrike so callers and the forecast are interchangeable.
export function resolveBaseStrike(attacker, target, { proximity = false, critical = false, state = null, damageType = null } = {}) {
  if (!damageType || damageType === "physical") {
    return resolvePhysicalStrike(attacker, target, { proximity, critical, state });
  }
  const actorStats = getEffectiveStats(attacker, state);
  const targetStats = { ...getEffectiveStats(target, state), defending: isDefending(target) };
  const result = resolveDamage({ attacker: actorStats, defender: targetStats, type: "magic", critical });
  const damage = Math.max(0, result.damage - getTeamDamageReduction(target, state, "magic"));
  return { ...result, critical, proximityBonus: 0, damage };
}

// THE single source of truth for the damage a physical strike will deal *right now*.
// The reducer's basic ATTACK and its targeted-ART attacks resolve through here, and
// so does the on-board damage forecast — so a player can never be shown a number the
// engine will not deliver. Everything that scales a hit folds in through one path:
//   • statModifiers, Last Stand, RAGE, and status mods (via getEffectiveStats),
//   • Defend halving (via resolveDamage),
//   • the proximity passive (when the strike is eligible for it),
// and any future modifier (e.g. a "reduce physical damage by 1" defender passive)
// added here stays honest in both the rules and the forecast automatically.
//
// Crit is deliberately excluded: it is a post-selection d6=6 and can never be
// guaranteed before the roll, so a forecast must show the normal-hit number.
//
// `proximity` gates the proximity passive for callers that represent attacks. The
// current Archer kit opts in for basic ATTACK, targeted attack ARTS, and Volley Shot.
export function resolvePhysicalStrike(attacker, target, { proximity = false, critical = false, state = null } = {}) {
  const result = resolveDamage({
    attacker: getEffectiveStats(attacker, state),
    defender: { ...getEffectiveStats(target, state), defending: isDefending(target) },
    type: "physical",
    critical
  });
  const proximityBonus = proximity ? getProximityBonus(attacker, target) : 0;
  const tileStrikeBonus = getTileStrikeBonus(attacker, target, state);
  return { ...result, critical, proximityBonus, tileStrikeBonus, damage: result.damage + proximityBonus + tileStrikeBonus };
}

// A blinded unit's attack roll is a guaranteed miss unless a combat override (the
// raging Archer's never-miss) says otherwise.
export function isBlinded(unit) {
  return (unit.statuses ?? []).some((status) => status.type === "blind");
}
