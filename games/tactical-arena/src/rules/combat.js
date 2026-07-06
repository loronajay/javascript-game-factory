import { getEffectiveStats, getUnitType, isDefending, isRaging, passiveStackKey, projectsHealingLockout } from "../core/unitCatalog.js";
import { drawValue } from "../core/rng.js";
import { resolveDamage } from "./damage.js";
import { traceGridLine } from "./movement.js";
import { areAllies, areEnemies, getTileAffinity, isWallAt, unitAt } from "../core/state.js";
import { getStanceCritBonus, isDamageTypeImmuneByStance } from "./stances.js";

// True when an attacker's shot ignores intervening obstacles entirely — the
// Sniper's Rifle Powered passive (pierces both bodies AND Build Cover walls). Read
// centrally off unit passive data so any future piercing unit works the same way.
export function attackerPierces(attacker) {
  return Boolean(attacker && getUnitType(attacker.type).passive?.effect?.pierce);
}

export function attackerHasLineAttack(attacker) {
  if (!attacker || !isRaging(attacker)) return false;
  const definition = getUnitType(attacker.type);
  return Boolean(definition.ragePassive?.effect?.lineAttack || definition.rageArt?.effect?.lineAttack);
}

function straightLineStep(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  if (dx === 0) return { x: 0, y: Math.sign(dy) };
  if (dy === 0) return { x: Math.sign(dx), y: 0 };
  if (Math.abs(dx) === Math.abs(dy)) return { x: Math.sign(dx), y: Math.sign(dy) };
  return null;
}

// RAGE line attacks fire along the chosen row/column/diagonal ray. The selected
// target still defines the shot direction; every enemy on that ray within attack
// range is damaged by the same landed attack roll.
export function getLineAttackTargets(state, attacker, target) {
  if (!attackerHasLineAttack(attacker)) return [target];
  const step = straightLineStep(attacker.position, target.position);
  if (!step) return [target];

  const targets = [];
  const reach = getEffectiveStats(attacker, state).attackRange;
  for (let distance = 1; distance <= reach; distance += 1) {
    const position = {
      x: attacker.position.x + step.x * distance,
      y: attacker.position.y + step.y * distance
    };
    if (position.x < 0 || position.y < 0 || position.x >= state.size || position.y >= state.size) break;
    const occupant = unitAt(state, position);
    if (occupant && areEnemies(attacker, occupant)) targets.push(occupant);
  }
  return targets.length ? targets : [target];
}

// Body-block line of sight: a physical ranged shot is stopped if ANY unit — friend
// OR foe — stands on a tile strictly between the attacker and its target. Carried
// over from Mini-Tactics (isRangerShotBlocked). Adjacent strikes have no tile in
// between, so melee passes through untouched and needs no special-casing. Only the
// physical-strike paths consult this; magic ARTS (Spark, Banish), pure casts
// (Silence), the Volley Shot rain, and self-centred blasts (Nuke) ignore bodies.
// `from`/`to` are {x,y} positions. Pass `attacker` so a piercing shot reaches
// through bodies; omit it for a pure-geometry query.
export function isShotBlocked(state, from, to, attacker = null) {
  if (attackerPierces(attacker)) return false;
  return traceGridLine(from.x, from.y, to.x, to.y)
    .slice(1, -1)
    .some((cell) => Boolean(unitAt(state, cell)));
}

// Wall line of sight: a Build Cover wall on any tile strictly between `from` and
// `to` blocks the shot. UNLIKE unit body-block, a wall stops EVERY ranged ability —
// physical and magic alike — so this is a separate, broader predicate. The sole
// exception is a piercing attacker (the Sniper's Rifle Powered shoots through
// cover). `from`/`to` are {x,y}; pass `attacker` to honour pierce.
export function isWallBetween(state, from, to, attacker = null) {
  if (attackerPierces(attacker)) return false;
  return traceGridLine(from.x, from.y, to.x, to.y)
    .slice(1, -1)
    .some((cell) => isWallAt(state, cell));
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

// The damage type of a unit's BASIC attack. Default physical; a `blessedAttack`
// passive (Angel's Blessed Arrow) makes basic attack damage magic, so it ignores DEF.
// Targeting/line-of-sight is separate: only explicit pierce passives shoot through bodies.
export function getBasicAttackDamageType(unit) {
  return getUnitType(unit.type).passive?.effect?.attackDamageType ?? "physical";
}

// A status a unit's passive lands on the target when its BASIC attack CRITS (Angel's
// Blessed Arrow blinds on a crit). Returns { status, duration } or null. Immunity is
// still enforced by applyStatus, so this never bypasses a status-immune target.
export function getCritOnHitStatus(unit) {
  return getUnitType(unit.type).passive?.effect?.critStatus ?? null;
}

function passiveEffects(unit) {
  const definition = getUnitType(unit.type);
  return [definition.passive, ...definition.arts, definition.ragePassive, definition.rageArt]
    .map((source) => source?.effect)
    .filter(Boolean);
}

// True when a unit ignores fire-tagged damage sources. Scans every authored passive
// source so a unit can carry this as its main passive or as a passive ART entry.
export function isFireDamageImmune(unit) {
  return passiveEffects(unit).some((effect) => effect.fireDamageImmune || effect.type === "fireImmunity");
}

// A crit rider that turns the struck target's tile into fire. Returns the authored
// fire object details, or null for units without the rider.
export function getCritCreatesFire(unit) {
  for (const effect of passiveEffects(unit)) {
    if (effect.critCreatesFire) return effect.critCreatesFire;
  }
  return null;
}

export function isFireBasedDamage({ damageAffinity = null, art = null } = {}) {
  return damageAffinity === "fire" ||
    art?.damageAffinity === "fire" ||
    art?.damage?.affinity === "fire" ||
    art?.fireDamage === true;
}

// Passive crit-chance bonus that scales with missing HP (Angel's Inner Strength:
// +1.5% per 3 HP missing). Scanned off the unit's passive + `kind:"passive"` arts so a
// new unit needs no edit here. Uses the unit's BASE maxHp (no state needed).
function getMissingHpCritBonus(attacker) {
  const definition = getUnitType(attacker.type);
  let bonus = 0;
  for (const source of [definition.passive, ...definition.arts]) {
    const effect = source?.effect;
    if (effect?.type !== "critPerMissingHp") continue;
    const per = Math.max(1, Number(effect.per) || 1);
    const missing = Math.max(0, definition.stats.maxHp - attacker.hp);
    bonus += Math.floor(missing / per) * (Number(effect.bonus) || 0);
  }
  return bonus;
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
// 50%; everyone else uses the base chance. A missing-HP passive (Angel's Inner
// Strength) adds on top, clamped so the final chance never exceeds 1.
export function getCritChance(attacker) {
  const crit = rageCombat(attacker)?.criticalChance;
  const base = Number.isFinite(crit) ? crit : COMBAT.CRIT_CHANCE;
  return Math.min(1, base + getMissingHpCritBonus(attacker));
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

// A hard floor a passive places under a landed physical hit (the Sniper's Rifle
// Powered: never below 2), so heavy DEF can't chip the attacker to the physical
// minimum. Returns 0 (no floor) for any unit without one.
function getMinimumDamage(attacker) {
  const minimum = getUnitType(attacker.type).passive?.effect?.minimumDamage;
  return Number.isFinite(minimum) ? minimum : 0;
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
// Necromancer's Dead Zone: -1 magic damage). Duplicate passive effects apply once
// so blind-pick duplicate units do not multiply global defenses. Applied wherever
// magic damage is finalized so the forecast and the reducer agree. Returns 0 for
// any team without a matching host.
export function getTeamDamageReduction(target, state, damageType) {
  if (!state?.units) return 0;
  let reduction = 0;
  const applied = new Set();
  for (const source of state.units) {
    if (source.hp <= 0 || !areAllies(source, target)) continue;
    const definition = getUnitType(source.type);
    for (const passive of [definition.passive, ...definition.arts, definition.ragePassive, definition.rageArt]) {
      if (passive?.effect?.type === "teamDamageReduction" && (passive.effect.damageType ?? "magic") === damageType) {
        const key = passiveStackKey(passive);
        if (applied.has(key)) continue;
        applied.add(key);
        reduction += Math.max(0, Number(passive.effect.amount) || 0);
      }
    }
  }
  return reduction;
}

// Extra magic damage a target takes RIGHT NOW from its own passive (Juggernaut's Bruiser
// Mode: +1 magic damage while at 0 MP). Read off the target's passive data so no rule
// hard-codes the unit; the paired stat swap lives in getEffectiveStats. Returns 0 for
// any unit without the passive or with MP to spare. Applied only to landed magic damage.
export function getSelfMagicVulnerability(target) {
  const effect = getUnitType(target.type).passive?.effect;
  if (effect?.type !== "emptyMpBoost" || (target?.mp ?? 0) > 0) return 0;
  return Math.max(0, Number(effect.magicVulnerability) || 0);
}

// True when any living unit is projecting a board-wide healing lockout (a raging
// Juggernaut's Null Zone). Read at every heal site so a healer can't top anyone up while
// it holds. Presentation-free — a pure query over match state.
export function isHealingDisabled(state) {
  return Boolean(state?.units?.some((unit) => projectsHealingLockout(unit)));
}

// Resolves a strike with an explicit damage type override (used by magic-damage ARTS
// like Spark and Banish). Falls back to a physical strike when no override is given.
// Returns the same shape as resolvePhysicalStrike so callers and the forecast are interchangeable.
export function resolveBaseStrike(attacker, target, { proximity = false, critical = false, state = null, damageType = null, damageAffinity = null } = {}) {
  if (!damageType || damageType === "physical") {
    return resolvePhysicalStrike(attacker, target, { proximity, critical, state });
  }
  const actorStats = getEffectiveStats(attacker, state);
  const targetStats = { ...getEffectiveStats(target, state), defending: isDefending(target) };
  const result = resolveDamage({ attacker: actorStats, defender: targetStats, type: "magic", critical });
  // Black Death Stance nulls magic damage entirely; otherwise Dead Zone-style team
  // reduction trims the final number, and Bruiser Mode adds +1 to a landed magic hit.
  const reduced = (isDamageTypeImmuneByStance(target, "magic") || (isFireBasedDamage({ damageAffinity }) && isFireDamageImmune(target)))
    ? 0
    : Math.max(0, result.damage - getTeamDamageReduction(target, state, "magic"));
  const damage = reduced > 0 ? reduced + getSelfMagicVulnerability(target) : reduced;
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
  // Fire Stance adds flat crit damage — only on a landed crit, so the normal-hit
  // forecast (critical:false) never shows it.
  const stanceCritBonus = critical ? getStanceCritBonus(attacker) : 0;
  let damage = result.damage + proximityBonus + tileStrikeBonus + stanceCritBonus;
  // A landed hit (we only reach here past the to-hit roll) is floored by any minimum
  // the attacker's passive sets — last, after every bonus.
  const minimum = getMinimumDamage(attacker);
  if (minimum > 0 && damage >= 1) damage = Math.max(minimum, damage);
  return { ...result, critical, proximityBonus, tileStrikeBonus, damage };
}

// A blinded unit's attack roll is a guaranteed miss unless a combat override (the
// raging Archer's never-miss) says otherwise.
export function isBlinded(unit) {
  return (unit.statuses ?? []).some((status) => status.type === "blind");
}

// --- Stone Body (Gargoyle) ---------------------------------------------------
// Passive-data predicates read centrally by the reducer so no strike/displacement
// path hard-codes the unit. All return 0 (no effect) for any unit without Stone Body.

// TRUE damage a DEFENDING unit returns to a MELEE attacker (the Gargoyle's thorns).
export function getMeleeDefendRetaliation(target) {
  const effect = getUnitType(target.type).passive?.effect;
  return effect?.type === "stoneBody" ? Math.max(0, Number(effect.meleeDefendRetaliation) || 0) : 0;
}

// True when a unit cannot be displaced (pulled / knocked back). The paired retaliation
// is read from getDisplacementRetaliation.
export function resistsDisplacement(unit) {
  return Boolean(getUnitType(unit.type).passive?.effect?.displacementImmune);
}

// TRUE damage the source of a displacement ART takes when it targets a displacement-immune
// unit (the Gargoyle bites back). 0 for any unit without Stone Body.
export function getDisplacementRetaliation(unit) {
  const effect = getUnitType(unit.type).passive?.effect;
  return effect?.type === "stoneBody" ? Math.max(0, Number(effect.displacementRetaliation) || 0) : 0;
}
