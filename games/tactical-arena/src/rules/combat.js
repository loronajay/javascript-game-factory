import { getCampaignDamageBoost, getEffectiveStats, getSourceDamageBonus, getTeamMagicDamageBonus, getUnitType, getWeatherAffinityMagicBonus, getWeatherCritDamageBonus, isDefending, isRaging, passiveStackKey, projectsHealingLockout, sustainsVictory } from "../core/unitCatalog.js";
import { drawValue } from "../core/rng.js";
import { CRIT_MULTIPLIER, resolveDamage } from "./damage.js";
import { chebyshevDistance, traceGridLine } from "./movement.js";
import { areAllies, areEnemies, getTileAffinity, isWallAt, livingUnits, unitAt } from "../core/state.js";
import { getStanceCritBonus, isDamageTypeImmuneByStance } from "./stances.js";
import { damageTypeImmunities, isInvulnerable } from "./statuses.js";

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
  BASE_ACCURACY: 0.96, // hit chance at range 1 before range falloff
  RANGE_ACCURACY_FALLOFF: 0.01, // -1% hit chance per tile after range 1
  CRIT_CHANCE: 0.15   // base crit on a landed attack
});

export const DEFAULT_ART_ACCURACY = COMBAT.BASE_ACCURACY;

function clampProbability(value) {
  return Math.max(0, Math.min(1, value));
}

export function getArtAccuracy(art) {
  if (!Number.isFinite(art?.accuracy)) return DEFAULT_ART_ACCURACY;
  return clampProbability(art.accuracy);
}

export function getRangeAdjustedAccuracy(attacker, { target = null, targetPosition = null, accuracy = null } = {}) {
  const baseAccuracy = Number.isFinite(accuracy) ? clampProbability(accuracy) : COMBAT.BASE_ACCURACY;
  const to = target?.position ?? targetPosition;
  if (!attacker?.position || !to) return baseAccuracy;
  const distance = Math.max(1, chebyshevDistance(attacker.position, to));
  const adjusted = baseAccuracy - COMBAT.RANGE_ACCURACY_FALLOFF * (distance - 1);
  return clampProbability(Math.round(adjusted * 10000) / 10000);
}

// A raging unit may carry combat overrides in its catalog data (the Archer's RAGE
// never-miss + 50% crit). Non-raging units, and units whose RAGE has no combat
// block (the Swordsman's Quick), get null and fall back to the base chances.
function rageCombat(unit) {
  if (!isRaging(unit)) return null;
  const definition = getUnitType(unit.type);
  return definition.ragePassive?.combat ?? definition.rageArt?.combat ?? null;
}

// The damage type of a unit's BASIC attack. Default physical; a `blessedAttack`
// passive (Angel's Blessed Arrow) makes basic attack damage magic, so it ignores DEF.
// Targeting/line-of-sight is separate: only explicit pierce passives shoot through bodies.
export function getBasicAttackDamageType(unit) {
  const definition = getUnitType(unit.type);
  if (isRaging(unit)) {
    const rageDamageType = definition.ragePassive?.effect?.attackDamageType ?? definition.rageArt?.effect?.attackDamageType;
    if (rageDamageType) return rageDamageType;
  }
  return definition.passive?.effect?.attackDamageType ?? "physical";
}

export function requiresRayBasicAttack(unit) {
  return Boolean(getUnitType(unit.type).passive?.effect?.basicAttackRayOnly);
}

export function isStraightRayTarget(from, to) {
  return Boolean(straightLineStep(from, to));
}

// A status a unit's passive lands on the target when its BASIC attack CRITS (Angel's
// Blessed Arrow blinds on a crit; Virus's Spread poisons on a crit). Scans every passive
// source so a unit can carry it on its main passive or a passive ART entry. Returns
// { status, duration } or null. Immunity is still enforced by applyStatus, so this never
// bypasses a status-immune target.
export function getCritOnHitStatus(unit) {
  for (const effect of passiveEffects(unit)) {
    if (effect.critStatus) return effect.critStatus;
  }
  return null;
}

export function getCritPullEffect(unit) {
  for (const effect of passiveEffects(unit)) {
    if (effect.critPull) return effect.critPull;
  }
  return null;
}

// Every passive effect a unit carries. Beyond its TYPE's authored passives, a unit
// instance may carry `bonusPassives` — passives granted to that one body rather than to
// the unit type, so a campaign can field a boss with extra rules without rewriting the
// playable unit (mission 22's Blacksword gets Void Reach this way; his drafted twin does
// not). Scanned here so every passive reader in this module — crit riders, splash, fire
// immunity, damage-type immunity — sees an instance grant with no further wiring.
function passiveEffects(unit) {
  const definition = getUnitType(unit.type);
  return [
    definition.passive,
    ...definition.arts,
    definition.ragePassive,
    definition.rageArt,
    ...(unit.bonusPassives ?? [])
  ]
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

export function getCritSplashDamage(unit) {
  for (const effect of passiveEffects(unit)) {
    if (effect?.type === "critSplashDamage") return effect;
    if (effect?.critSplashDamage) return effect.critSplashDamage;
  }
  return null;
}

// Splash that rides EVERY landed basic attack, not just a crit (Little Brother's Splash
// Fire is the crit-only sibling above). Returns the authored effect — `{ amount, radius,
// affinityBonus: { affinity, amount } }` — where affinityBonus adds damage per splashed
// unit standing on a tile of that affinity. Applied by the reducer's attack().
export function getAttackSplashDamage(unit) {
  for (const effect of passiveEffects(unit)) {
    if (effect?.type === "attackSplash") return effect;
    if (effect?.attackSplash) return effect.attackSplash;
  }
  return null;
}

export function isFireBasedDamage({ damageAffinity = null, art = null } = {}) {
  return damageAffinity === "fire" ||
    art?.damageAffinity === "fire" ||
    art?.damage?.affinity === "fire" ||
    art?.fireDamage === true;
}

export function isDamageTypeImmune(unit, damageType) {
  return damageTypeImmunities(unit).has(damageType);
}

export function finalizeMagicDamage({ attacker, target, state = null, rawDamage, damageAffinity = null, art = null, critical = false }) {
  // Petrify (Treant): an invulnerable statue takes no damage of any kind.
  if (isInvulnerable(target)) return 0;
  const fireBased = isFireBasedDamage({ damageAffinity, art });
  const immune = isDamageTypeImmune(target, "magic") ||
    isDamageTypeImmuneByStance(target, "magic") ||
    // Riot Cop's Riot Shield: a DEFENDING unit nullifies ALL magic damage aimed at it.
    negatesMagicWhileDefending(target) ||
    (fireBased && isFireDamageImmune(target));
  if (immune) return 0;
  const reduced = Math.max(0, rawDamage - getTeamDamageReduction(target, state, "magic"));
  // Enchanted Roots (Treant): +1 damage taken from fire-based abilities.
  const fireVulnerability = fireBased ? getFireVulnerability(target) : 0;
  return reduced > 0
    ? reduced + getTeamMagicDamageBonus(attacker, state) + getSourceDamageBonus(attacker, target, state, "magic") + getCampaignDamageBoost(attacker, state) + getSelfMagicVulnerability(target) + getCriticalMagicVulnerability(target, critical) + getTileVulnerability(target, state) + getWeatherMagicDamageBonus(attacker) + getWeatherAffinityMagicBonus(attacker, state) + fireVulnerability
    : reduced;
}

// Enchanted Roots (Treant): flat extra damage a unit takes from fire-based abilities and
// fire-tile ticks. Read off passive data so no rule hard-codes the unit; scans every
// passive source. 0 for any unit without the rider.
export function getFireVulnerability(unit) {
  let bonus = 0;
  for (const effect of passiveEffects(unit)) bonus += Math.max(0, Number(effect.fireVulnerability) || 0);
  return bonus;
}

function getWeatherMagicDamageBonus(attacker) {
  let bonus = 0;
  for (const status of attacker?.statuses ?? []) {
    if (status.type !== "weather-magic") continue;
    bonus += Math.max(0, Number(status.magicDamageBonus) || 0);
  }
  return bonus;
}

export function ignoresCriticalDamage(unit) {
  return passiveEffects(unit).some((effect) => effect.ignoreCriticalDamage);
}

export function ignoresOwnCriticalDamage(unit) {
  return passiveEffects(unit).some((effect) => effect.noCriticalDamage);
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

function getResourceCritBonus(attacker) {
  const definition = getUnitType(attacker.type);
  let bonus = 0;
  for (const source of [definition.passive, ...definition.arts]) {
    const effect = source?.effect;
    const crit = effect?.critPerResource;
    if (!crit) continue;
    const per = Math.max(1, Number(crit.per) || 1);
    const amount = isRaging(attacker)
      ? (Number(crit.rageBonus) || Number(crit.bonus) || 0)
      : (Number(crit.bonus) || 0);
    bonus += Math.floor(Math.max(0, Number(attacker.mp) || 0) / per) * amount;
  }
  return bonus;
}

function getTileBasicAttackCombat(attacker, { target = null, state = null, basicAttack = false } = {}) {
  if (!basicAttack || !state || !target) return null;
  for (const effect of passiveEffects(attacker)) {
    const cfg = effect?.tileBasicAttack;
    if (!cfg?.affinity) continue;
    const targetOnAffinity = getTileAffinity(state, target.position) === cfg.affinity;
    if (!targetOnAffinity) continue;
    const attackerOnAffinity = getTileAffinity(state, attacker.position) === cfg.affinity;
    return { cfg, targetOnAffinity, attackerOnAffinity };
  }
  return null;
}

// Probability that this attacker's swing misses *right now*. Never-miss (raging
// Archer, or Angel's both-on-white Blessed Arrow shot) overrides everything; otherwise
// Blind can force a miss unless the caller is resolving a caster roll that intentionally
// ignores attacker accuracy. Rolled ARTS pass an authored range-1 base `accuracy`;
// basic attacks omit it and use the shared 96% range-1 base. Both lose 1% per tile
// after the first.
export function getMissChance(attacker, { ignoreBlind = false, target = null, targetPosition = null, state = null, basicAttack = false, accuracy = null } = {}) {
  const tileCombat = getTileBasicAttackCombat(attacker, { target, state, basicAttack });
  if (rageCombat(attacker)?.neverMiss || (tileCombat?.attackerOnAffinity && tileCombat.cfg.bothNeverMiss)) return 0;
  if (!ignoreBlind && isBlinded(attacker)) return 1;
  const tileAccuracy = Math.max(0, Number(tileCombat?.cfg.targetMissReduction) || 0);
  const missChance = 1 - getRangeAdjustedAccuracy(attacker, { target, targetPosition, accuracy });
  return clampProbability(Math.round((missChance - tileAccuracy) * 10000) / 10000);
}

// Probability that a landed swing crits. The raging Archer's kit raises this to
// 50%; everyone else uses the base chance. A missing-HP passive (Angel's Inner
// Strength) adds on top, clamped so the final chance never exceeds 1.
export function getCritChance(attacker, { target = null, state = null, basicAttack = false } = {}) {
  // Dark Ether (Blacksword): a one-shot charge that forces the next landed swing to crit.
  // The to-hit roll is untouched (he can still miss); the reducer consumes the flag.
  if (attacker.guaranteedCritCharged) return 1;
  const crit = rageCombat(attacker)?.criticalChance;
  const rageBonus = Number(rageCombat(attacker)?.criticalBonus) || 0;
  const base = Number.isFinite(crit) ? crit : COMBAT.CRIT_CHANCE;
  const tileCombat = getTileBasicAttackCombat(attacker, { target, state, basicAttack });
  const tileCritBonus = tileCombat?.attackerOnAffinity
    ? Math.max(0, Number(tileCombat.cfg.bothCritBonus) || 0)
    : 0;
  return Math.min(1, base + rageBonus + getMissingHpCritBonus(attacker) + getResourceCritBonus(attacker) + tileCritBonus);
}

// Resolve a single swing's to-hit and crit against the authoritative seed. Draws
// the hit value first; only a landed swing draws for crit (so a miss costs one
// draw, a hit costs two — deterministic from state, so replay-safe). `overrides`
// lets a command pin either draw for tests / recorded replay without consuming the
// seed. `ignoreBlind` is for mage casts that still have a normal Clumsy-style roll;
// `accuracy` is a per-ART range-1 base hit chance and is omitted for basic attacks.
export function rollToHit(rngState, attacker, overrides = {}, { ignoreBlind = false, target = null, targetPosition = null, state = null, basicAttack = false, accuracy = null } = {}) {
  const hit = drawValue(rngState, overrides.attackRoll);
  const missed = hit.value < getMissChance(attacker, { ignoreBlind, target, targetPosition, state, basicAttack, accuracy });
  if (missed) return { rngState: hit.rngState, missed: true, critical: false, hitRoll: hit.value, critRoll: null };
  const crit = drawValue(hit.rngState, overrides.critRoll);
  return { rngState: crit.rngState, missed: false, critical: crit.value < getCritChance(attacker, { target, state, basicAttack }), hitRoll: hit.value, critRoll: crit.value };
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

// Fat Bowman Heavy Handed: a distance curve for physical shots. The neutral point is
// range 2, so each tile beyond that adds damage and adjacency subtracts damage.
export function getRangeDamageBonus(attacker, target) {
  const effect = getUnitType(attacker.type).passive?.effect;
  if (effect?.type !== "rangeDamageCurve") return 0;
  const distance = effect.metric === "euclidean"
    ? Math.hypot(attacker.position.x - target.position.x, attacker.position.y - target.position.y)
    : Math.max(Math.abs(attacker.position.x - target.position.x), Math.abs(attacker.position.y - target.position.y));
  return Math.floor(distance) - (effect.neutralDistance ?? 2);
}

function getAdjacentDamageBonus(attacker, target) {
  const effect = getUnitType(attacker.type).passive?.effect;
  if (!effect?.adjacentDamageBonus) return 0;
  const distance = Math.max(Math.abs(attacker.position.x - target.position.x), Math.abs(attacker.position.y - target.position.y));
  return distance <= 1 ? Math.max(0, Number(effect.adjacentDamageBonus) || 0) : 0;
}

// True when a unit has no LIVING ally within `radius` Chebyshev tiles (itself excluded).
// The isolation test behind Ronin's Wanderer bonuses.
function isIsolated(unit, state, radius) {
  if (!state?.units) return true;
  return !state.units.some((other) =>
    other.id !== unit.id && other.hp > 0 && areAllies(other, unit) &&
    Math.max(Math.abs(other.position.x - unit.position.x), Math.abs(other.position.y - unit.position.y)) <= radius);
}

// Wanderer (Ronin): a data-driven `duelist` passive that stacks physical bonus damage from
// three duelling conditions — the attacker fighting alone, the target fighting alone, and a
// target that whiffed on the attacker last turn (tracked in `attacker.duelMarks`). Folded
// into resolvePhysicalStrike so the on-board forecast stays honest. Returns 0 for any unit
// without the passive. Needs state (ally proximity); returns 0 when state is unavailable.
export function getDuelistDamageBonus(attacker, target, state) {
  if (!state) return 0;
  const effect = getUnitType(attacker.type).passive?.effect;
  if (effect?.type !== "duelist") return 0;
  const radius = Math.max(0, Number(effect.isolationRadius) || 0);
  let bonus = 0;
  if (isIsolated(attacker, state, radius)) bonus += Math.max(0, Number(effect.isolatedAttackerBonus) || 0);
  if (isIsolated(target, state, radius)) bonus += Math.max(0, Number(effect.isolatedTargetBonus) || 0);
  if ((attacker.duelMarks ?? []).includes(target.id)) bonus += Math.max(0, Number(effect.missedMeBonus) || 0);
  return bonus;
}

// The fraction of the damage dealt that a `duelist` attacker heals when its BASIC attack
// crits (Ronin's Wanderer: half). 0 for any unit without the passive.
export function getDuelistCritLifesteal(attacker) {
  const effect = getUnitType(attacker.type).passive?.effect;
  return effect?.type === "duelist" ? Math.max(0, Number(effect.critLifestealFraction) || 0) : 0;
}

// True when a unit records the id of any enemy that MISSES a roll against it (Ronin's
// Wanderer missed-me rider). The reducer's miss branches call addDuelMark on such a unit.
export function duelistTracksMisses(unit) {
  const effect = getUnitType(unit.type).passive?.effect;
  return effect?.type === "duelist" && Math.max(0, Number(effect.missedMeBonus) || 0) > 0;
}

// Add an offender to a duelist's mark list, kept sorted + unique so the online state hash is
// order-independent across clients. Mutates the unit in place (a cloned-state unit).
export function addDuelMark(unit, offenderId) {
  const marks = new Set(unit.duelMarks ?? []);
  marks.add(offenderId);
  unit.duelMarks = [...marks].sort();
}

// Challenge (Ronin): a mutual grudge. A `challenged` status names its challenger (`from`)
// and a `bonus`; the challenger deals +bonus to the marked unit. Both directions of the
// duel carry the SAME status shape (Ronin marks the enemy, and marks himself naming the
// enemy), so this one symmetric read covers "Ronin hits foe" and "foe hits Ronin". Folded
// into resolvePhysicalStrike, so the forecast stays honest. 0 without a matching mark.
export function getChallengeDamageBonus(attacker, target) {
  if (!attacker || !target) return 0;
  let bonus = 0;
  for (const status of target.statuses ?? []) {
    if (status.type === "challenged" && status.from === attacker.id) {
      bonus += Math.max(0, Number(status.bonus) || 0);
    }
  }
  return bonus;
}

// Final Draw (Ronin RAGE): the raging attacker takes damage equal to the damage its attack
// deals. Read off the rage source flag so no strike path hard-codes the unit; the reducer
// applies the recoil at the basic-attack and attack-ART sites. 0 for any non-raging unit.
export function getAttackRecoil(unit) {
  if (!isRaging(unit)) return false;
  const definition = getUnitType(unit.type);
  return Boolean(definition.ragePassive?.effect?.attackRecoil || definition.rageArt?.effect?.attackRecoil);
}

// Final Draw does not punish the strike that has already ended the opposing team's fight.
export function shouldApplyAttackRecoil(unit, state) {
  if (!getAttackRecoil(unit)) return false;
  if (!state) return true;
  return livingUnits(state).some((target) => areEnemies(unit, target) && sustainsVictory(target));
}

// A hard floor a passive places under a landed physical hit (the Sniper's Rifle
// Powered: never below 2), so heavy DEF can't chip the attacker to the physical
// minimum. Returns 0 (no floor) for any unit without one.
function getMinimumDamage(attacker) {
  const minimum = getUnitType(attacker.type).passive?.effect?.minimumDamage;
  return Number.isFinite(minimum) ? minimum : 0;
}

// Dark Tread (Blacksword): a PASSIVE tile-affinity damage bonus vs enemies standing on a
// dark tile, with a bigger bonus when the attacker is also on one. Unlike the RAGE-only
// tileStrikeBonus above, this is always on and asymmetric. Read centrally so the reducer
// and the on-board forecast agree. Returns 0 for any unit without the passive.
export function getTileAffinityDamageBonus(attacker, target, state) {
  if (!state) return 0;
  const cfg = getUnitType(attacker.type).passive?.effect?.tileAffinityDamage;
  if (!cfg) return 0;
  if (getTileAffinity(state, target.position) !== cfg.affinity) return 0;
  return getTileAffinity(state, attacker.position) === cfg.affinity
    ? Math.max(0, Number(cfg.bothBonus) || 0)
    : Math.max(0, Number(cfg.targetBonus) || 0);
}

// Dark Tread (Blacksword): +damage TAKEN while the target stands on a light/white tile.
// Read off the target's passive so no rule hard-codes the unit; folded into both physical
// and magic damage. Returns 0 for any unit without the passive or off the marked tile.
export function getTileVulnerability(target, state) {
  if (!state) return 0;
  const cfg = getUnitType(target.type).passive?.effect?.tileVulnerability;
  if (!cfg) return 0;
  return getTileAffinity(state, target.position) === cfg.affinity ? Math.max(0, Number(cfg.amount) || 0) : 0;
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
  let vulnerability = 0;
  if (effect?.type === "emptyMpBoost" && (target?.mp ?? 0) <= 0) {
    vulnerability += Math.max(0, Number(effect.magicVulnerability) || 0);
  }
  for (const passiveEffect of passiveEffects(target)) {
    if (passiveEffect?.type === "emptyMpBoost") continue;
    vulnerability += Math.max(0, Number(passiveEffect.magicVulnerability) || 0);
  }
  return vulnerability;
}

// Flat extra damage a target takes from critical magic hits only (Riot Cop's shield is
// great against ordinary shots, but crit magic cracks through harder).
export function getCriticalMagicVulnerability(target, critical = false) {
  if (!critical) return 0;
  let vulnerability = 0;
  for (const passiveEffect of passiveEffects(target)) {
    vulnerability += Math.max(0, Number(passiveEffect.critMagicVulnerability) || 0);
  }
  return vulnerability;
}

// True when any living unit is projecting a board-wide healing lockout (a raging
// Juggernaut's Null Zone). Read at every heal site so a healer can't top anyone up while
// it holds. Presentation-free — a pure query over match state.
export function isHealingDisabled(state, target = null) {
  if (state?.units?.some((unit) => projectsHealingLockout(unit))) return true;
  if (!target || target.hp <= 0) return false;
  for (const source of state?.units ?? []) {
    if (source.hp <= 0 || source.id === target.id) continue;
    const passives = [getUnitType(source.type).passive, ...getUnitType(source.type).arts, getUnitType(source.type).ragePassive, getUnitType(source.type).rageArt];
    for (const passive of passives) {
      const effect = passive?.effect;
      if (effect?.type !== "healingLockoutAura") continue;
      const radius = Math.max(0, Number(effect.radius) || 0);
      const distance = Math.max(Math.abs(source.position.x - target.position.x), Math.abs(source.position.y - target.position.y));
      if (distance <= radius) return true;
    }
  }
  return false;
}

// Resolves a strike with an explicit damage type override (used by magic-damage ARTS
// like Spark and Banish). Falls back to a physical strike when no override is given.
// Returns the same shape as resolvePhysicalStrike so callers and the forecast are interchangeable.
export function resolveBaseStrike(attacker, target, { proximity = false, critical = false, state = null, damageType = null, damageAffinity = null, basicAttack = false } = {}) {
  if (!damageType || damageType === "physical") {
    return resolvePhysicalStrike(attacker, target, { proximity, critical, state, basicAttack });
  }
  if (damageType === "true") {
    // Petrify (Treant): true damage still can't touch an invulnerable statue.
    const damage = isInvulnerable(target)
      ? 0
      : Math.max(0, getEffectiveStats(attacker, state).strength + getCampaignDamageBoost(attacker, state));
    return {
      type: "true",
      base: damage,
      afterDefense: damage,
      defended: false,
      critical: false,
      proximityBonus: 0,
      damage
    };
  }
  const actorStats = getEffectiveStats(attacker, state);
  const targetStats = { ...getEffectiveStats(target, state), defending: isDefending(target) };
  const effectiveCritical = critical && !ignoresCriticalDamage(target) && !ignoresOwnCriticalDamage(attacker);
  const result = resolveDamage({ attacker: actorStats, defender: targetStats, type: "magic", critical: effectiveCritical });
  const damage = finalizeMagicDamage({ attacker, target, state, rawDamage: result.damage + (effectiveCritical ? getWeatherCritDamageBonus(state) : 0), damageAffinity, critical: effectiveCritical });
  return { ...result, critical, proximityBonus: 0, damage };
}

// A FIXED-amount magic strike (Virus's Cough "5 magic", vs the STR-scaled magic of
// Spark/Banish). `amount` stands in for the attacker's strength, so magic ignores DEF,
// Defend halves it, and Dead Zone / fire-immunity fold through finalizeMagicDamage —
// exactly like the self-centred blasts (resolveNuke/applyPyroclasmDamage). Shared by the
// reducer AND the forecast so the number can never drift. Same return shape as
// resolvePhysicalStrike/resolveBaseStrike.
export function resolveFixedMagicStrike(attacker, target, amount, { critical = false, state = null, art = null } = {}) {
  const effectiveCritical = critical && !ignoresCriticalDamage(target);
  const base = effectiveCritical ? Math.ceil(Math.max(0, amount) * CRIT_MULTIPLIER) + getWeatherCritDamageBonus(state) : Math.max(0, amount);
  const targetStats = { ...getEffectiveStats(target, state), defending: isDefending(target) };
  const result = resolveDamage({ attacker: { strength: base }, defender: targetStats, type: "magic" });
  const damage = finalizeMagicDamage({ attacker, target, state, rawDamage: result.damage, art, critical: effectiveCritical });
  return { ...result, critical: effectiveCritical, proximityBonus: 0, damage };
}

export function resolveFixedPhysicalStrike(attacker, target, amount, { critical = false, state = null } = {}) {
  const effectiveCritical = critical && !ignoresCriticalDamage(target);
  const result = resolveDamage({
    attacker: { strength: Math.max(0, amount) },
    defender: { ...getEffectiveStats(target, state), defending: isDefending(target) },
    type: "physical",
    critical: effectiveCritical
  });
  let damage = (negatesPhysicalWhileDefending(target) || isInvulnerable(target)) ? 0 : result.damage;
  if (damage > 0) damage += getCampaignDamageBoost(attacker, state);
  if (effectiveCritical && damage > 0) damage += getWeatherCritDamageBonus(state);
  return { ...result, critical: effectiveCritical, proximityBonus: 0, damage };
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
export function resolvePhysicalStrike(attacker, target, { proximity = false, critical = false, state = null, basicAttack = false } = {}) {
  const effectiveCritical = critical && !ignoresCriticalDamage(target) && !ignoresOwnCriticalDamage(attacker);
  const result = resolveDamage({
    attacker: getEffectiveStats(attacker, state),
    defender: { ...getEffectiveStats(target, state), defending: isDefending(target) },
    type: "physical",
    critical: effectiveCritical
  });
  const proximityBonus = proximity ? getProximityBonus(attacker, target) : 0;
  const rangeDamageBonus = proximity ? getRangeDamageBonus(attacker, target) : 0;
  const adjacentDamageBonus = proximity ? getAdjacentDamageBonus(attacker, target) : 0;
  const tileStrikeBonus = getTileStrikeBonus(attacker, target, state);
  // Dark Tread (Blacksword): passive tile-affinity attack bonus + the target's white-tile
  // vulnerability. Both fold in here so the forecast stays honest.
  const tileAffinityBonus = getTileAffinityDamageBonus(attacker, target, state);
  const tileVulnerability = getTileVulnerability(target, state);
  // Fire Stance adds flat crit damage — only on a landed crit, so the normal-hit
  // forecast (critical:false) never shows it.
  const stanceCritBonus = effectiveCritical ? getStanceCritBonus(attacker) : 0;
  const weatherCritBonus = effectiveCritical ? getWeatherCritDamageBonus(state) : 0;
  // Ronin: Wanderer duelling bonuses (isolation + missed-me) and Challenge grudge bonus.
  // Both fold in here so the forecast reads the same number the reducer delivers.
  const duelistBonus = getDuelistDamageBonus(attacker, target, state);
  const challengeBonus = getChallengeDamageBonus(attacker, target);
  const campaignDamageBoost = getCampaignDamageBoost(attacker, state);
  let damage = result.damage + proximityBonus + rangeDamageBonus + adjacentDamageBonus + tileStrikeBonus + tileAffinityBonus + tileVulnerability + stanceCritBonus + weatherCritBonus + duelistBonus + challengeBonus + campaignDamageBoost;
  if (damage >= 1 || result.damage >= 1) {
    const passiveMinimum = getUnitType(attacker.type).passive?.effect?.minimumDamage;
    if (Number.isFinite(passiveMinimum)) damage = Math.max(passiveMinimum, damage);
  }
  // A landed hit (we only reach here past the to-hit roll) is floored by any minimum
  // the attacker's passive sets — last, after every bonus.
  const minimum = getMinimumDamage(attacker);
  if (minimum > 0 && damage >= 1) damage = Math.max(minimum, damage);
  // Riot Shield (Riot Cop): a RANGED basic attack (distance > 1) deals 1 less to him.
  // Gated on `basicAttack` so ARTS and melee blows are untouched; folded here so the
  // on-board forecast (which also resolves through this path) reads the mitigated number.
  if (basicAttack) {
    const distance = Math.max(Math.abs(attacker.position.x - target.position.x), Math.abs(attacker.position.y - target.position.y));
    if (distance > 1) {
      const reduction = getRangedBasicAttackReduction(target);
      if (reduction > 0 && damage > 0) damage = Math.max(1, damage - reduction);
    }
  }
  // Rock Hard (Clod): a defending target negates physical damage entirely — applied
  // absolutely last so no bonus/floor can leak through, and honestly (the forecast
  // resolves through here too, so it shows 0 against a braced Clod). Petrify (Treant): an
  // invulnerable statue negates all damage the same way.
  if (negatesPhysicalWhileDefending(target) || isInvulnerable(target)) damage = 0;
  return { ...result, critical: effectiveCritical, proximityBonus, rangeDamageBonus, adjacentDamageBonus, tileStrikeBonus, damage };
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

// --- Rock Hard (Clod) --------------------------------------------------------
// Read centrally so no strike path hard-codes the unit; scans every passive source (Rock
// Hard is a passive ART entry, not the main passive) like the crit-status / fire seams.

function rockHardEffect(unit) {
  for (const effect of passiveEffects(unit)) if (effect.type === "rockHard") return effect;
  return null;
}

// True when a DEFENDING unit shrugs off physical damage entirely (Clod's Rock Hard). The
// caller folds this into the final physical damage, so the on-board forecast reads 0 too.
export function negatesPhysicalWhileDefending(unit) {
  return Boolean(rockHardEffect(unit)?.negatePhysical) && isDefending(unit);
}

// MP a unit restores each time a physical attack lands on it while defending (Rock Hard).
// 0 for any unit without the passive; the reducer applies it at every physical strike site.
export function getRockHardMpRefund(unit) {
  const effect = rockHardEffect(unit);
  return effect ? Math.max(0, Number(effect.mpOnPhysical) || 0) : 0;
}

// --- Riot Shield / Utility Belt (Riot Cop) -----------------------------------
// Read centrally so no strike path hard-codes the unit; scans every passive source (the
// mitigation rider is a `kind:"passive"` art entry), mirroring the Rock Hard / crit-status
// seams. All return 0/false for any unit without the passive.
function riotShieldEffect(unit) {
  for (const effect of passiveEffects(unit)) if (effect.type === "riotShield") return effect;
  return null;
}

// Flat damage a unit shaves off a RANGED BASIC attack aimed at it (Riot Cop takes 1 less).
// Only folds into a basic attack from distance > 1 — the caller passes `basicAttack` +
// the two units so the forecast and the reducer agree.
export function getRangedBasicAttackReduction(target) {
  const effect = riotShieldEffect(target);
  return effect ? Math.max(0, Number(effect.rangedBasicReduction) || 0) : 0;
}

// True when a DEFENDING unit nullifies magic damage entirely (Riot Cop's Riot Shield).
// Folded into finalizeMagicDamage, so every magic path (arts, blasts, pulses) and the
// forecast agree.
export function negatesMagicWhileDefending(unit) {
  return Boolean(riotShieldEffect(unit)?.magicNullifyWhileDefending) && isDefending(unit);
}
