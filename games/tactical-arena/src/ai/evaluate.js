// Expected-value combat math for the CPU.
//
// The AI plans against averages and NEVER rolls a die: it must not peek at — or
// consume — the authoritative `rngState` carried in match state, and its scoring
// has to be deterministic so a replay reproduces the same choices. Every helper
// here is pure and headless (no DOM, no RNG, no state mutation).
//
// Crucially, the damage numbers come from the SAME resolvers the reducer + the
// on-board forecast use (`resolveBaseStrike`, `resolveDamage`, `getMissChance`,
// `getCritChance`, `getTeamDamageReduction`). A roll lands as miss / normal / crit
// with fixed probabilities, so each strike turns into an exact expected value that
// can never disagree with what the reducer will actually deliver.
//
// Status/role/MP *values* are tactical priors that live here (not on the art data)
// — see CPU_AI_METADATA_SCHEMA.md §4. Per-art/per-unit `ai` metadata is read
// through `normalizeUnitAi` so a new unit needs no edit to this file.

import { areEnemies, livingUnits } from "../core/state.js";
import { getEffectiveStats, getUnitType, isCommandOnly, isDefending, isRaging, normalizeUnitAi, takesTurns } from "../core/unitCatalog.js";
import { getCritChance, getMissChance, getSelfMagicVulnerability, getTeamDamageReduction, isFireBasedDamage, isFireDamageImmune, resolveBaseStrike, resolveFixedPhysicalStrike } from "../rules/combat.js";
import { CRIT_MULTIPLIER } from "../rules/damage.js";
import { chebyshevDistance } from "../rules/movement.js";
import { statusImmunities } from "../rules/statuses.js";

// Statuses a unit does NOT want on it — the ones a global cleanse (Misfortune Dance)
// is worth removing from an ally. `empowered` is a buff, so it is deliberately absent.
const HARMFUL_STATUSES = new Set(["poison", "blind", "slow", "silence", "stun"]);

// Tuning priors. All values are in the same currency as HP / expected damage, so
// the difficulty weights in cpuController compose cleanly (decision 3: one currency).
const DEF_BASELINE = 4;      // notional enemy DEF, for estimating a unit's offense
const HIT_BASELINE = 0.9;    // 1 − base miss; a unit's swing usually lands
const POISON_HORIZON = 3;    // turns of DoT the CPU plans for (decision 1)
const SLOW_FACTOR = 0.25;    // a slowed turn denies only a slice of value

// How much silencing a target is worth, by role. A caster/controller's whole kit
// is its ARTS, so denying them hurts; a bruiser barely cares.
const SILENCE_ROLE_MULT = Object.freeze({
  caster: 1.5, controller: 1.5, support: 1.4, ranged: 1.0,
  bruiser: 0.5, skirmisher: 0.6, summon: 0
});

// Tactical worth of keeping a unit alive, before HP — self-declared on the unit's
// `ai` block, so a new unit sets its own value (replaces Mini-Tactics' hardcoded
// UNIT_VALUE table).
export function unitThreatValue(unit) {
  return normalizeUnitAi(unit.type).threatValue;
}

// A "key" unit is one the schema marks `protect` (healers/casters/snipers): the CPU
// guards its own and prioritizes hunting the enemy's.
export function isKeyUnit(unit) {
  return normalizeUnitAi(unit.type).protect;
}

// Rough expected damage this unit deals on a typical attack — used to value
// denying it a turn (blind/silence/slow/stun). Casters/controllers deal magic, which
// ignores DEF, so they estimate off raw strength; everyone else off STR − DEF.
export function offenseEstimate(unit, state = null) {
  const str = getEffectiveStats(unit, state).strength;
  const role = normalizeUnitAi(unit.type).role;
  const physical = Math.max(1, str - DEF_BASELINE);
  const magicish = role === "caster" || role === "controller" ? str : physical;
  return Math.max(physical, magicish) * HIT_BASELINE;
}

// Tactical value of landing one status on `target`, in damage-equivalent units.
// Immunity (read from the SAME `statusImmunities` the reducer uses) zeroes it, so
// the CPU never wastes Silence on a Mystic or any status on a Paladin. Capped at
// the target's threat value — disabling can never beat killing (decision 1).
export function statusValue(target, effect, state = null, { survivingHp } = {}) {
  if (!effect?.status || statusImmunities(target).has(effect.status)) return 0;

  const duration = effect.duration === "permanent"
    ? POISON_HORIZON
    : (effect.durationTurns ?? (Number.isFinite(effect.duration) ? effect.duration : 1));
  const offense = offenseEstimate(target, state);
  const role = normalizeUnitAi(target.type).role;

  let value;
  switch (effect.status) {
    case "blind":
      value = offense * duration;
      break;
    case "stun":
      value = offense * duration;
      break;
    case "silence":
      value = offense * duration * (SILENCE_ROLE_MULT[role] ?? 1);
      break;
    case "slow":
      value = offense * duration * SLOW_FACTOR;
      break;
    case "poison": {
      const hp = Number.isFinite(survivingHp) ? survivingHp : target.hp;
      value = (effect.turnStartDamage ?? 1) * Math.min(POISON_HORIZON, hp);
      break;
    }
    default:
      value = offense * duration;
  }
  return Math.min(value, unitThreatValue(target));
}

// Effective healing applied to `unit` for `amount`, capped by its missing HP (no
// overheal). The currency is HP, same as damage.
export function expectedHeal(unit, amount, state = null) {
  const maxHp = getEffectiveStats(unit, state).maxHp;
  return Math.max(0, Math.min(amount, maxHp - unit.hp));
}

// Can `unit` bring a strike to bear on any of `enemies` next turn (move + reach)?
// The same reach heuristic incomingThreat uses, so the CPU's read of "an ally will
// fight next turn" matches its read of who threatens it.
export function canReachAnEnemy(state, unit, enemies) {
  const stats = getEffectiveStats(unit, state);
  const reach = stats.moveRange + stats.attackRange;
  return enemies.some((enemy) => chebyshevDistance(unit.position, enemy.position) <= reach);
}

// Turns of value the CPU counts from a PERMANENT stat change (Father Time's Age). It
// lasts all game, but the tactical horizon is short — capped like the other priors.
const PERSIST_HORIZON = 3;

// Value (damage currency) of one Age cast: a persistent ±1 STR/DEF. On an ally it's a
// buff worth more if that ally will actually fight; on an enemy it either denies offense
// (-STR) or softens it for our attacks (-DEF). Capped by the target's threat so it never
// beats a kill. Reuses the same reach/offense priors as the rest of the evaluator.
export function ageValue(state, caster, target, stat, isAlly) {
  const enemies = livingUnits(state).filter((unit) => areEnemies(caster, unit));
  if (isAlly) {
    const reach = canReachAnEnemy(state, target, enemies) ? 1 : 0.35;
    const per = stat === "strength" ? HIT_BASELINE : 0.8; // STR ≈ a hit's worth; DEF ≈ mitigation
    return Math.min(per * PERSIST_HORIZON * reach, unitThreatValue(target));
  }
  return Math.min(HIT_BASELINE * PERSIST_HORIZON, unitThreatValue(target));
}

// Value of one Time Stretch cast. On an enemy it's exactly a 1-turn Slow (reuse the
// shared status prior). On an ally, +1 MOVE mostly matters when it lets that ally reach
// the fight it otherwise couldn't — the concrete payoff — otherwise it's minor utility.
export function hastenValue(state, caster, target, isAlly) {
  if (!isAlly) return statusValue(target, { status: "slow", durationTurns: 1 }, state);
  const enemies = livingUnits(state).filter((unit) => areEnemies(caster, unit));
  const stats = getEffectiveStats(target, state);
  const reachNow = stats.moveRange + stats.attackRange;
  const helps = enemies.some((enemy) => {
    const distance = chebyshevDistance(target.position, enemy.position);
    return distance > reachNow && distance <= reachNow + 1;
  });
  return helps ? 1.5 : 0.4;
}

// Value of one Anoint cast (Angel's +1 range on an ally for a turn). +1 range mostly
// matters when it lets a friendly attacker reach an enemy it otherwise couldn't this
// turn — the concrete payoff; otherwise it is minor setup utility. Only meaningful for
// an ally that can actually attack (a summon/commander gains nothing from more reach).
export function anointValue(state, caster, target) {
  const stats = getEffectiveStats(target, state);
  if (stats.attackRange < 1 || isCommandOnly(target) || !takesTurns(target)) return 0;
  const enemies = livingUnits(state).filter((unit) => areEnemies(caster, unit));
  const reachNow = stats.moveRange + stats.attackRange;
  const unlocks = enemies.some((enemy) => {
    const distance = chebyshevDistance(target.position, enemy.position);
    return distance > reachNow && distance <= reachNow + 1;
  });
  return unlocks ? 1.6 : 0.4;
}

// Value of one Tether Grab pull (the 3 magic itself is scored by the HP diff). Dragging
// an enemy that wants distance — a ranged unit or caster/support — into the bruiser's
// face is the real payoff; hauling another melee body around is minor tempo.
export function cleanseAllyValue(state, target) {
  let value = 0;
  for (const status of target.statuses ?? []) {
    if (HARMFUL_STATUSES.has(status.type)) value += statusValue(target, statusAsEffect(status), state);
  }
  return value;
}

export function grabValue(state, caster, target) {
  const role = normalizeUnitAi(target.type).role;
  const kites = role === "ranged" || role === "caster" || role === "controller" || role === "support";
  return kites ? 2.5 : 1;
}

// Value of a Recharge. At full MP the mend is 1 HP (scored by the projection, so 0 extra
// here). Empty, refueling is only worth something if the Juggernaut could actually spend
// the MP on a real play soon (an enemy within move + Rocket Punch reach). Small currency
// so it always loses to an available attack.
export function rechargeValue(state, caster) {
  if (caster.mp > 0) return 0;
  const reach = getEffectiveStats(caster, state).moveRange + 5;
  const canSetUp = livingUnits(state).some((u) => areEnemies(caster, u) && chebyshevDistance(caster.position, u.position) <= reach);
  return canSetUp ? 2.5 : 0.5;
}

// True when a unit is short of MP for at least one of its costed active arts, so a
// small MP top-up (Spirit Dance) could matter to it.
function isMpStarved(unit) {
  const definition = getUnitType(unit.type);
  if (unit.mp >= definition.stats.maxMp) return false;
  return definition.arts.some((art) => art.kind === "active" && art.mpCost > 0 && unit.mp < art.mpCost);
}

// Turn a live status entry into the effect shape statusValue reads, so the value of
// REMOVING a harmful status from an ally reuses the exact prior used to value INFLICTING
// it on an enemy.
function statusAsEffect(status) {
  return { status: status.type, duration: status.duration, turnStartDamage: status.turnStartDamage };
}

// Value (in damage-equivalent units) of a Witch Doctor "buffAllies" dance — the team
// buffs / cleanse / disruption casts that project NO HP change, so the controller can't
// read their worth from the board diff. Returns 0 when the dance would do nothing useful
// right now; the planner gates generation on `> 0`, so the CPU never dances into a no-op.
// Reuses statusValue/offenseEstimate, so its numbers stay in the same currency as damage.
export function buffAlliesValue(state, caster, art) {
  const allies = livingUnits(state, caster.player);
  const enemies = livingUnits(state).filter((unit) => areEnemies(caster, unit));

  // Petrify (Treant RAGE): a self-preservation ultimate — worth reaching for while raging
  // (low HP) with enemies on the board. The invulnerable turtle + the restore/drain aura is
  // valued as a couple of hits saved, scaled up when there are enemies adjacent to drain.
  if (art.selfProtect) {
    if (!isRaging(caster) || !enemies.length) return 0;
    const radius = Math.max(0, Number(art.petrify?.radius) || 0);
    const drained = enemies.filter((enemy) => chebyshevDistance(caster.position, enemy.position) <= radius).length;
    return HIT_BASELINE * 2 + drained * 2;
  }

  // Fire Dance: +1 STR to the team for a turn — worth ~1 landed hit's worth of extra
  // damage for each unit that can actually reach an enemy next turn (the Witch Doctor
  // included, via the Fire Stance it enters).
  if (art.teamBuff) {
    const strength = Number(art.teamBuff.statModifiers?.strength) || 0;
    if (strength <= 0) return 0;
    let value = 0;
    for (const ally of allies) if (canReachAnEnemy(state, ally, enemies)) value += strength * HIT_BASELINE;
    return value;
  }

  // Spirit Dance: +1 MP to the team — a minor utility, valued only for allies that are
  // actually short of MP for one of their arts.
  if (art.teamMp) {
    return allies.filter(isMpStarved).length * 0.4;
  }

  // Misfortune Dance: strip every status globally — worth removing each harmful status
  // from an ally (the same magnitude as inflicting it). It also primes status-heavy
  // allies, most notably Virus: Cough's 60% poison becomes guaranteed while Misfortune
  // Stance is active, so the dance has value before anyone is already afflicted.
  if (art.cleanse) {
    let value = 0;
    for (const ally of allies) {
      value += cleanseAllyValue(state, ally);
    }
    if (art.stance === "misfortune" && caster.stance !== "misfortune") {
      value += misfortuneStatusSynergyValue(state, caster, allies, enemies);
    }
    return value;
  }

  // Black Death Dance (rage ultimate): blind the whole enemy squad + a self power spike.
  // The blind on every enemy is the concrete immediate value.
  if (art.globalStatus || art.selfBuff) {
    let value = 0;
    if (art.globalStatus?.status) {
      const effect = { status: art.globalStatus.status, durationTurns: art.globalStatus.durationTurns };
      for (const enemy of enemies) value += statusValue(enemy, effect, state);
    }
    const selfStr = Number(art.selfBuff?.statModifiers?.strength) || 0;
    if (selfStr > 0) value += selfStr * HIT_BASELINE * (canReachAnEnemy(state, caster, enemies) ? 1 : 0.3);
    return value;
  }

  return 0;
}

function misfortuneStatusSynergyValue(state, caster, allies, enemies) {
  if (!enemies.length) return 0;
  let value = 0;
  for (const ally of allies) {
    const definition = getUnitType(ally.type);
    for (const allyArt of definition.arts ?? []) {
      if (allyArt.kind !== "active" || allyArt.effect?.type !== "status") continue;
      if (ally.mp < (allyArt.mpCost ?? 0)) continue;
      const currentChance = Math.min(1, Number(allyArt.effect.chance) || 0);
      if (currentChance >= 1) continue;
      const range = allyArt.targeting?.range ?? getEffectiveStats(ally, state).attackRange;
      const canThreaten = enemies.some((enemy) =>
        chebyshevDistance(ally.position, enemy.position) <= range + getEffectiveStats(ally, state).moveRange);
      if (!canThreaten) continue;
      const doubledChance = Math.min(1, currentChance * 2);
      const bestTargetValue = Math.max(...enemies.map((enemy) => statusValue(enemy, allyArt.effect, state)));
      value += (doubledChance - currentChance) * bestTargetValue;
      if (ally.type === "virus" && allyArt.effect.status === "poison") value += 4;
    }
  }
  // Small self-preservation guard: don't overpay for dancing if the caster is exposed
  // and there is no status caster payoff. The caller's full plan score handles danger.
  return Math.max(0, value);
}

// Expected outcome of a rolled strike — the basic ATTACK and every `strike` ART.
// `art` (optional) supplies `damageType` (magic reaches through / ignores DEF) and
// the status/heal rider; pass null for a basic attack. Mirrors resolveTargetedArt:
// a missed swing deals nothing and lands no rider, and the status rider only fires
// if the target survives the hit.
export function expectedStrike(state, attacker, target, art = null) {
  const damageType = art?.damageType ?? "physical";
  const damageAffinity = art?.damageAffinity ?? art?.damage?.affinity ?? null;
  const fixedPhysical = art?.damage?.type === "physical" && art.damage.fixed && Number.isFinite(art.damage.amount);
  const normal = fixedPhysical
    ? resolveFixedPhysicalStrike(attacker, target, art.damage.amount, { critical: false, state }).damage
    : resolveBaseStrike(attacker, target, { proximity: true, critical: false, state, damageType, damageAffinity }).damage;
  const crit = fixedPhysical
    ? resolveFixedPhysicalStrike(attacker, target, art.damage.amount, { critical: true, state }).damage
    : resolveBaseStrike(attacker, target, { proximity: true, critical: true, state, damageType, damageAffinity }).damage;

  // Magic-damage ARTS ignore Blind (Silence, not Blind, is the mage counter — see
  // artResolvers.js's resolveTargetedArt), so the EV math must match or the CPU would
  // undervalue casting while blinded.
  const pMiss = getMissChance(attacker, { ignoreBlind: damageType === "magic" });
  const pHit = 1 - pMiss;
  const pCrit = getCritChance(attacker);

  const expDamage = pHit * ((1 - pCrit) * normal + pCrit * crit);
  const normalKills = normal >= target.hp;
  const critKills = crit >= target.hp;
  const pKill = pHit * ((1 - pCrit) * (normalKills ? 1 : 0) + pCrit * (critKills ? 1 : 0));
  const expTargetHp = Math.max(0, target.hp - expDamage);

  let riderValue = 0;
  if (art?.effect?.type === "status") {
    // Rider only rolls on a landing swing that the target survives.
    const pSurvive = pHit * ((1 - pCrit) * (normalKills ? 0 : 1) + pCrit * (critKills ? 0 : 1));
    riderValue = pSurvive * (art.effect.chance ?? 1) *
      statusValue(target, art.effect, state, { survivingHp: Math.max(1, Math.ceil(expTargetHp)) });
  } else if (art?.effect?.type === "heal") {
    // Self-heal (Life Sap): half the damage dealt, on a successful effect roll.
    const healAmount = Math.round(normal / 2);
    riderValue = pHit * (art.effect.chance ?? 1) * expectedHeal(attacker, healAmount, state);
  }

  return { expDamage, pKill, expTargetHp, normalDamage: normal, critDamage: crit, riderValue };
}

// A fixed-amount, no-roll hit against one target — the per-target math for AoE and
// pulse ARTS (the planner sums this over the ability's target set). `true` damage
// ignores DEF, Defend, and team reduction (Volley Shot, tile pulses); `magic`
// honors Defend halving and Dead Zone, matching resolveNuke / resolveDamage.
export function expectedFixedHit(state, target, { amount, type, affinity = null }) {
  let damage;
  if (type === "true") {
    damage = Math.max(0, amount);
  } else if (type === "magic") {
    const defender = { ...getEffectiveStats(target, state), defending: isDefending(target) };
    const base = defender.defending ? Math.ceil(Math.max(0, amount) / 2) : Math.max(0, amount);
    damage = (isFireBasedDamage({ damageAffinity: affinity }) && isFireDamageImmune(target))
      ? 0
      : Math.max(0, base - getTeamDamageReduction(target, state, "magic"));
  } else if (type === "physical") {
    // Fixed-power physical (Rocket Punch): Defense reduces it, Defend halves it, like
    // resolveDamage's physical branch with a fixed `strength`.
    const defender = { ...getEffectiveStats(target, state), defending: isDefending(target) };
    const base = Math.max(1, Math.max(0, amount) - defender.defense);
    damage = defender.defending ? Math.ceil(base / 2) : base;
  } else {
    throw new Error(`expectedFixedHit: unsupported type "${type}"`);
  }
  const dealt = Math.min(damage, target.hp);
  return { raw: damage, damage: dealt, kills: damage >= target.hp };
}

// Expected damage of a Juggernaut LINE strike (Tether Grab magic / Rocket Punch physical),
// modelled to match the reducer's resolvers so the CPU's EV can't drift: a to-hit roll
// (miss = 0), then miss/normal/crit weighting with crit folded ×1.5 exactly where the
// reducer folds it. Tether Grab's magic ignores DEF and does NOT halve under Defend (the
// reducer skips resolveDamage there); Rocket Punch's physical takes DEF then Defend.
export function expectedLineStrikeDamage(state, attacker, target, { amount, type }) {
  const pHit = 1 - getMissChance(attacker);
  const pCrit = getCritChance(attacker);
  const fold = (critical) => {
    if (type === "magic") {
      const base = critical ? Math.ceil(amount * CRIT_MULTIPLIER) : amount;
      const reduced = Math.max(0, base - getTeamDamageReduction(target, state, "magic"));
      return reduced > 0 ? reduced + getSelfMagicVulnerability(target) : reduced;
    }
    const defender = { ...getEffectiveStats(target, state), defending: isDefending(target) };
    let base = Math.max(1, amount - defender.defense);
    if (critical) base = Math.ceil(base * CRIT_MULTIPLIER);
    return defender.defending ? Math.ceil(base / 2) : base;
  };
  return pHit * ((1 - pCrit) * fold(false) + pCrit * fold(true));
}

// Expected damage the enemy squad could land on `victim` next turn if it stood at
// `pos`, approximated by reach = effective move + attack range. Deliberately ignores
// blockers and turn order (an over-estimate) so the CPU keeps its key units wary of
// crossfire. `defending` lowers it, which is why bracing scores well under pressure.
export function incomingThreat(state, victim, pos, defending = false) {
  const proxy = { ...victim, position: { x: pos.x, y: pos.y }, defending };
  let threat = 0;
  for (const enemy of livingUnits(state)) {
    if (!areEnemies(enemy, victim)) continue;
    const stats = getEffectiveStats(enemy, state);
    if (chebyshevDistance(enemy.position, pos) > stats.moveRange + stats.attackRange) continue;
    threat += expectedStrike(state, enemy, proxy).expDamage;
  }
  return threat;
}

// Value of a King command (Strike/Hold/Pursue/Higher Ground) — a one-turn team buff
// that changes stats, not HP, so its worth rides the controller's `control` weight like
// a status cast. Data-driven: it reads WHICH stat the command buffs (never the command
// id) and multiplies the buff magnitude (with live RAGE scaling) by the count of allies
// who actually benefit this turn, so the CPU tends to Strike when its squad can attack,
// Pursue when it still needs to close, Hold when it is under pressure, and Higher Ground
// when it fields ranged pieces. Always ≥ a floor so the mandatory command is never a no-op.
export function commandBuffValue(state, king, art) {
  const cmd = art.command;
  if (!cmd) return 0;
  const allies = livingUnits(state, king.player).filter((u) => u.id !== king.id && takesTurns(u) && !isCommandOnly(u));
  if (allies.length === 0) return 0;
  const rage = allies.filter(isRaging).length;
  const stats = cmd.stats ?? {};
  const magnitude = Object.values(stats).reduce((sum, v) => sum + v, 0) + (cmd.healBonus ?? 0) + (cmd.rangeBonus ?? 0) + rage;

  let beneficiaries;
  if ("strength" in stats) beneficiaries = allies.filter((u) => canReachEnemy(state, u));
  else if ("attackRange" in stats) beneficiaries = allies.filter((u) => getEffectiveStats(u, state).attackRange >= 2);
  else if ("moveRange" in stats) beneficiaries = allies.filter((u) => !canReachEnemy(state, u));
  else if ("defense" in stats || cmd.healBonus) beneficiaries = allies.filter((u) => isThreatened(state, u));
  else beneficiaries = allies;

  return magnitude * Math.max(1, beneficiaries.length);
}

function canReachEnemy(state, unit) {
  const stats = getEffectiveStats(unit, state);
  const reach = stats.attackRange + stats.moveRange;
  return livingUnits(state).some((e) => areEnemies(unit, e) && chebyshevDistance(unit.position, e.position) <= reach);
}

function isThreatened(state, unit) {
  if (unit.hp <= getEffectiveStats(unit, state).maxHp * 0.5) return true;
  return livingUnits(state).some((e) => areEnemies(unit, e) && chebyshevDistance(unit.position, e.position) <= 2);
}

// Chebyshev distance from `pos` to the nearest living enemy of `forPlayer`. Used to
// reward closing the gap when no attack is available yet; 0 when no enemy remains.
export function nearestEnemyDistance(state, forPlayer, pos) {
  let best = Infinity;
  for (const enemy of livingUnits(state)) {
    if (enemy.player === forPlayer) continue;
    best = Math.min(best, chebyshevDistance(enemy.position, pos));
  }
  return best === Infinity ? 0 : best;
}
