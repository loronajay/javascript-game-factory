import { COMMANDS } from "./commands.js";
import { getArt, getArtMpCost, getCommandHealBonus, getEffectiveStats, getGuaranteedStatuses, getMagicDamageReward, getPoisonMpRefund, getRageAttackStatus, getRageEffectValue, getStatusSpreadConfig, getUnitType, isCommandOnly, isDefending, isRaging, sustainsVictory, takesTurns } from "./unitCatalog.js";
import { areEnemies, areAllies, cloneState, findUnit, getTileAffinity, isWallAt, livingTeamUnits, livingUnits, teamOfUnit, unitAt } from "./state.js";
import { canUseArt, getArtTargetRange, getDarkPulseRays, getFirePlacementTiles, getFlightTiles, getLegalFleeTiles, getLineTargets, getProtectLandingTiles, getPyroclasmTargets, getRevivePlacementTiles, getReviveTargets, getRushContactDamage, getSelfBlastRadius, getSummonPlacementTiles, getTargetedBlastAimTiles, getTargetedBlastTargets, getTilePulseTargets, getVolleyShotCells, getWallPlacementTiles, validateRushPath } from "../rules/arts.js";
import { finalizeMagicDamage, getBasicAttackDamageType, getCritCreatesFire, getCritOnHitStatus, getDisplacementRetaliation, getLineAttackTargets, getMeleeDefendRetaliation, getProximityBonus, getRockHardMpRefund, ignoresCriticalDamage, isFireDamageImmune, isHealingDisabled, isShotBlocked, isWallBetween, negatesPhysicalWhileDefending, resistsDisplacement, resolveBaseStrike, resolveFixedMagicStrike, resolvePhysicalStrike, rollToHit } from "../rules/combat.js";
import { CRIT_MULTIPLIER, resolveDamage } from "../rules/damage.js";
import { drawValue } from "./rng.js";
import { chebyshevDistance, getLegalMovePath, getLegalMoves, isOnBoard, positionKey } from "../rules/movement.js";
import { applyStatus, isNegativeStatus, isStunned, NEGATIVE_STATUS_TYPES, reflectsStatus, resolveStatusEffect, resolveTurnStartStatuses, tickStatuses } from "../rules/statuses.js";
import { alliesInRadius, getGlobalHealBonus, getGlobalStatusChanceMultiplier, getGlobalTrueTick, getStanceEffect } from "../rules/stances.js";

const ERR = Object.freeze({
  INVALID_COMMAND: "INVALID_COMMAND",
  NOT_ACTIVE_PLAYER: "NOT_ACTIVE_PLAYER",
  UNIT_NOT_FOUND: "UNIT_NOT_FOUND",
  UNIT_NOT_OWNED: "UNIT_NOT_OWNED",
  UNIT_DEAD: "UNIT_DEAD",
  UNIT_SPENT: "UNIT_SPENT",
  ACTIVATION_ALREADY_OPEN: "ACTIVATION_ALREADY_OPEN",
  NO_ACTIVATION: "NO_ACTIVATION",
  WRONG_ACTIVE_UNIT: "WRONG_ACTIVE_UNIT",
  MOVE_ALREADY_USED: "MOVE_ALREADY_USED",
  MOVE_OUT_OF_RANGE: "MOVE_OUT_OF_RANGE",
  CANCEL_NOT_AVAILABLE: "CANCEL_NOT_AVAILABLE",
  PRIMARY_ALREADY_USED: "PRIMARY_ALREADY_USED",
  INVALID_TARGET: "INVALID_TARGET",
  TARGET_OUT_OF_RANGE: "TARGET_OUT_OF_RANGE",
  ART_NOT_AVAILABLE: "ART_NOT_AVAILABLE",
  TARGET_OBSTRUCTED: "TARGET_OBSTRUCTED",
  INVALID_ART_PATH: "INVALID_ART_PATH",
  FINISH_REQUIRES_ACTION: "FINISH_REQUIRES_ACTION",
  SUMMON_LIMIT: "SUMMON_LIMIT",
  // The King must issue his command before any other unit of his owner may act…
  KING_MUST_ACT_FIRST: "KING_MUST_ACT_FIRST",
  // …and the King himself may only command — never move, attack, or defend.
  COMMANDER_CANNOT_ACT: "COMMANDER_CANNOT_ACT"
});

const reject = (errorCode) => ({ accepted: false, errorCode });
const MAX_STUN_FAST_FORWARD_ROLLOVERS = 32;
// Surface any rollover side-effects (fire-tile burns) the turn flip queued onto the
// state, then clear them so they never persist into the returned state or a clone.
const accept = (nextState, events = []) => {
  // Every accepted command bumps the monotonic revision (the online lockstep
  // sequence key). This is the single increment point — all accepted paths return
  // through here — and it is excluded from the state hash (see core/state-hash.js).
  nextState.revision = (nextState.revision ?? 0) + 1;
  const rollover = nextState.pendingRolloverEvents;
  if (rollover) delete nextState.pendingRolloverEvents;
  return { accepted: true, nextState, events: rollover ? [...events, ...rollover] : events };
};

// Apply a rolled status, honoring Stone Body reflection: a status TARGETED at a
// reflecting unit (Gargoyle) is issued to the OFFENDER instead of the target. One roll,
// one application — `rollValue`/`chanceMultiplier` pass straight through to
// resolveStatusEffect. Returns the effect result plus `reflected` so the caller can
// report it. The recipient's statuses are written here; the caller reads no statuses.
function applyRolledStatus(target, effect, rollValue, offender, chanceMultiplier = 1) {
  const recipient = (offender && offender.id !== target.id && reflectsStatus(target)) ? offender : target;
  const result = resolveStatusEffect(recipient, effect, rollValue, chanceMultiplier);
  if (result.statuses) { recipient.statuses = result.statuses; }
  delete result.statuses;
  // Only tag a reflection when it actually happened, so the common (non-reflect) event
  // shape stays identical to the pre-Stone-Body reducer.
  if (recipient.id !== target.id) result.reflected = true;
  return result;
}

// Growth (Virus): restore `amount` MP to `actor` (clamped to its max) and surface a
// GROWTH_MP event, whenever it poisons an enemy. Returns [] when nothing was restored.
function applyGrowth(state, actor, amount) {
  if (!(amount > 0)) return [];
  const before = actor.mp;
  actor.mp = Math.min(getEffectiveStats(actor, state).maxMp, actor.mp + amount);
  const gained = actor.mp - before;
  return gained > 0 ? [{ type: "GROWTH_MP", unitId: actor.id, mpGained: gained }] : [];
}

// Rock Hard (Clod): a physical attack landing on a DEFENDING Clod is negated by the
// strike resolvers (see negatesPhysicalWhileDefending), and here it also feeds him MP.
// Fired at every physical strike site; a no-op for any unit without the passive or not
// defending. Returns [] or a single ROCK_HARD_MP event.
function applyRockHardDefense(state, target, isPhysical) {
  if (!isPhysical || target.hp <= 0 || !isDefending(target)) return [];
  const refund = getRockHardMpRefund(target);
  if (refund <= 0) return [];
  const before = target.mp;
  target.mp = Math.min(getEffectiveStats(target, state).maxMp, target.mp + refund);
  const gained = target.mp - before;
  return gained > 0 ? [{ type: "ROCK_HARD_MP", unitId: target.id, mpGained: gained }] : [];
}

function applyMagicDamageReaction(target, damageDealt) {
  if (damageDealt <= 0 || target.hp <= 0) return null;
  const effect = getUnitType(target.type).passive?.effect;
  if (effect?.type !== "magicTrauma") return null;
  const status = effect.status ?? { type: "battle-trauma", duration: 1, statModifiers: { strength: 1 } };
  const result = applyStatus(target, {
    type: status.type,
    duration: status.duration,
    statModifiers: { ...(status.statModifiers ?? {}) },
    ignoreResistance: true
  });
  if (result.applied) target.statuses = result.statuses;
  return { type: "BATTLE_TRAUMA", unitId: target.id, applied: result.applied };
}

function stationaryStrengthEffect(unit) {
  return getUnitType(unit.type).arts.find((art) => art.effect?.type === "stationaryStrength")?.effect ?? null;
}

function oneShotRageEffect(unit) {
  const definition = getUnitType(unit.type);
  return [definition.ragePassive, definition.rageArt]
    .map((source) => source?.effect)
    .find((effect) => effect?.type === "oneShotStatModifiers") ?? null;
}

function syncOneShotRageArm(unit) {
  if (!oneShotRageEffect(unit)) return;
  if (!isRaging(unit)) {
    unit.desperationRageArmed = false;
    unit.desperationShotSpent = false;
    return;
  }
  if (!unit.desperationRageArmed) {
    unit.desperationRageArmed = true;
    unit.desperationShotSpent = false;
  }
}

function activeOneShotRageEffect(unit) {
  const effect = oneShotRageEffect(unit);
  return effect && isRaging(unit) && !unit.desperationShotSpent ? effect : null;
}

function consumeOneShotRage(unit) {
  const effect = activeOneShotRageEffect(unit);
  if (!effect) return [];
  unit.desperationShotSpent = true;
  if (effect.skipNextActivation) unit.skipNextActivation = true;
  return [{ type: "DESPERATION_SHOT", unitId: unit.id }];
}

export function applyCommand(state, command) {
  const result = dispatchCommand(state, command);
  // A single reconciliation seam runs after EVERY accepted command, diffing the input
  // state against the result to catch every unit that fell or was revived — regardless
  // of which resolver or turn-rollover hazard (fire/poison/black-death/time-steal) did
  // it — and applies the King's reactive HP swings. Deterministic (no RNG), so online
  // lockstep clients all compute the identical reaction.
  if (result.accepted) {
    // Virus's Spread propagates any NEW debuff on an enemy to its nearby allies. Diff-based
    // (like the reactions below) so it catches a status from ANY source — a cast, a crit,
    // a global blind — deterministically, before the HP-swing reactions read the board.
    applySpreadReactions(state, result.nextState, result.events);
    applyNemesisThresholdReactions(state, result.nextState, result.events);
    applyOneShotRageTransitions(state, result.nextState, result.events);
    applyRageEntryEffects(state, result.nextState, result.events);
    applyCommanderReactions(state, result.nextState, result.events);
  }
  return result;
}

function dispatchCommand(state, command) {
  if (!command?.type || state.phase !== "playing") return reject(ERR.INVALID_COMMAND);
  switch (command.type) {
    case COMMANDS.BEGIN_ACTIVATION: return beginActivation(state, command);
    case COMMANDS.MOVE_UNIT: return moveUnit(state, command);
    case COMMANDS.CANCEL_MOVE: return cancelMove(state, command);
    case COMMANDS.ATTACK: return attack(state, command);
    case COMMANDS.DEFEND: return defend(state, command);
    case COMMANDS.USE_ART: return useArt(state, command);
    case COMMANDS.FINISH_ACTIVATION: return finishActivation(state, command);
    case COMMANDS.CONCEDE: return concede(state, command);
    default: return reject(ERR.INVALID_COMMAND);
  }
}

// True while this player owns a living, not-yet-commanded acts-first King (the King).
// He is forced to issue his command before any of his squadmates may begin — so a King
// waiting on his command blocks the rest of his owner's turn. A player with no King is
// never gated. `commandTurn !== turnNumber` means "hasn't commanded THIS turn".
function commanderPending(state, player) {
  return state.units.some((unit) =>
    unit.hp > 0 && unit.player === player &&
    getUnitType(unit.type).actsFirst &&
    unit.commandTurn !== state.turnNumber);
}

function validateOwnedLivingUnit(state, player, unitId) {
  const unit = findUnit(state, unitId);
  if (!unit) return { error: ERR.UNIT_NOT_FOUND };
  if (unit.player !== player) return { error: ERR.UNIT_NOT_OWNED };
  if (unit.hp <= 0) return { error: ERR.UNIT_DEAD };
  return { unit };
}

function validateOpenActivation(state, player, unitId) {
  if (player !== state.currentPlayer) return { error: ERR.NOT_ACTIVE_PLAYER };
  if (!state.activation) return { error: ERR.NO_ACTIVATION };
  if (state.activation.unitId !== unitId) return { error: ERR.WRONG_ACTIVE_UNIT };
  return validateOwnedLivingUnit(state, player, unitId);
}

function beginActivation(state, command) {
  if (command.player !== state.currentPlayer) return reject(ERR.NOT_ACTIVE_PLAYER);
  const result = validateOwnedLivingUnit(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  // Summons (Ghouls) never activate — they spawn spent, but guard explicitly so a
  // summon can never open an activation even if some path clears its spent flag.
  // Stun is auto-spent at turn refresh, and this guard keeps hand-built states from
  // opening an action panel for a stunned unit.
  if (!takesTurns(result.unit) || result.unit.spent || isStunned(result.unit)) return reject(ERR.UNIT_SPENT);
  if (state.activation && state.activation.unitId !== result.unit.id &&
      (state.activation.moved || state.activation.primaryUsed)) return reject(ERR.ACTIVATION_ALREADY_OPEN);
  // The King commands first: no other unit of this owner may open an activation while a
  // living King still owes his command this turn.
  if (!getUnitType(result.unit.type).actsFirst && commanderPending(state, command.player)) {
    return reject(ERR.KING_MUST_ACT_FIRST);
  }

  // A genuinely fresh activation (not a re-open of the same unit's already-open one),
  // so a one-shot begin effect (Gargoyle's free Pyroclasm) can't double-fire.
  const fresh = state.activation?.unitId !== result.unit.id;

  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  unit.defending = false;
  syncOneShotRageArm(unit);
  if (unit.skipNextActivation) {
    unit.skipNextActivation = false;
    spendAndAdvance(next, unit);
    return accept(next, [{ type: "DESPERATION_EXHAUSTED", unitId: unit.id }]);
  }
  if (fresh) {
    const planted = stationaryStrengthEffect(unit);
    if (planted) {
      unit.stationaryStrength = Math.min(
        Math.max(0, Number(planted.max) || 0),
        (unit.stationaryStrength ?? 0) + Math.max(0, Number(planted.amount) || 0)
      );
    }
  }
  // Rain Stance's on-attack charge (set last turn) becomes a live +MOVE buff for this
  // whole activation — applied here, not at attack time, so it lands on the NEXT turn
  // even if the Witch Doctor attacked-then-moved. It ticks off at this activation's end.
  if (unit.rainCharged) {
    const hasted = applyStatus(unit, { type: "empowered", duration: 1, statModifiers: { moveRange: unit.rainCharged } });
    if (hasted.applied) unit.statuses = hasted.statuses;
    unit.rainCharged = 0;
  }
  next.activation = {
    unitId: unit.id,
    origin: { ...unit.position },
    moved: false,
    primaryUsed: false,
    spellUsed: false,
    bonusActionGroups: [],
    realmTraversalActive: Boolean(unit.realmTraversalCharged)
  };
  if (unit.realmTraversalCharged) unit.realmTraversalCharged = false;
  // Volcanic Rage (Gargoyle): the first raging activation and every Nth one after erupt
  // a free Pyroclasm BEFORE the turn opens. It spends no MP and no action — the Gargoyle
  // still takes its full turn.
  // Fired here (deterministic, no roll — magic AoE) so online lockstep clients all agree.
  const events = [{ type: "ACTIVATION_BEGAN", unitId: unit.id }];
  const freeCast = fresh ? getRageEffectValue(unit, "freePyroclasm", null) : null;
  if (freeCast && isRaging(unit)) {
    resolveVolcanicPyroclasmTick(next, unit, freeCast, events, { trigger: "activation" });
  }
  // Emergency Snacks (Fat Cleric RAGE): a per-turn self-regen while raging, fired at the
  // start of each fresh turn (deterministic, no roll — so online lockstep clients agree).
  if (fresh) applyRageRegen(next, unit, events);
  return accept(next, events);
}

// Emergency Snacks (a `rageRegen` ragePassive): while raging, nibble `hp` HP back at the
// start of the turn. The turn that nibble lifts her back above the 5-HP rage threshold she
// also restores `exitMp`. Capped at `maxProcs` procs per battle (unit.emergencySnackCount,
// a hashed field). A board-wide healing lockout (a raging Juggernaut's Null Zone) shuts it
// off — and does NOT burn a proc. Returns true when it actually restored something.
function getRageRegen(unit) {
  if (!isRaging(unit)) return null;
  const effect = getUnitType(unit.type).ragePassive?.effect;
  return effect?.type === "rageRegen" ? effect : null;
}

function applyRageRegen(state, unit, events) {
  const regen = getRageRegen(unit);
  if (!regen) return false;
  if ((unit.emergencySnackCount ?? 0) >= (regen.maxProcs ?? Infinity)) return false;
  if (isHealingDisabled(state)) return false;
  const stats = getEffectiveStats(unit, state);
  const beforeHp = unit.hp;
  const beforeMp = unit.mp;
  const wasBelowThreshold = beforeHp <= 5;
  unit.hp = Math.min(stats.maxHp, unit.hp + (regen.hp ?? 0));
  unit.emergencySnackCount = (unit.emergencySnackCount ?? 0) + 1;
  if (wasBelowThreshold && unit.hp > 5) {
    unit.mp = Math.min(stats.maxMp, unit.mp + (regen.exitMp ?? 0));
  }
  events.push({ type: "EMERGENCY_SNACK", unitId: unit.id, hpRestored: unit.hp - beforeHp, mpRestored: unit.mp - beforeMp });
  return true;
}

function resolveVolcanicPyroclasmTick(state, unit, freeCast, events, { trigger, force = false, resetCounter = false } = {}) {
  if (resetCounter) unit.volcanicCounter = 0;
  unit.volcanicCounter = (unit.volcanicCounter ?? 0) + 1;
  // Fires immediately on rage entry / first raging activation, then every Nth tick after
  // that, so the cadence is 1, 1+N, 1+2N, ... rather than N, 2N, ...
  const every = Math.max(1, freeCast.every ?? 3);
  if (!force && (unit.volcanicCounter - 1) % every !== 0) return false;

  const art = getArt(unit.type, freeCast.artId);
  if (!art) return false;
  const { targetIds, damageByTarget } = applyPyroclasmDamage(state, unit, art);
  resolveVictory(state);
  if (state.phase !== "playing") state.activation = null; // the eruption ended the match
  events.push({ type: "PYROCLASM_ERUPT", actorId: unit.id, targetIds, damageByTarget, trigger });
  return true;
}

function nemesisThresholdBand(hp) {
  if (hp <= 0) return 0;
  let crossed = 0;
  for (const threshold of [20, 15, 10, 5]) {
    if (hp < threshold) crossed += 1;
  }
  return crossed;
}

function resolveNemesisAutoPulse(state, unit, events, { trigger }) {
  const art = getArt(unit.type, "dark-pulse");
  if (!art || unit.hp <= 0) return false;
  const { targetIds, damageByTarget, healingByTarget, pulseRays } = applyDarkPulse(state, unit, art);
  resolveVictory(state);
  events.push({
    type: "DARK_PULSE_AUTO",
    actorId: unit.id,
    artId: art.id,
    trigger,
    targetIds,
    damageByTarget,
    healingByTarget,
    pulseRays,
    mpCost: 0
  });
  return true;
}

function applyNemesisThresholdReactions(prevState, next, events) {
  if (next.phase !== "playing") return;

  let previousBand = new Map(prevState.units.map((unit) => [unit.id, nemesisThresholdBand(unit.hp)]));
  for (let guard = 0; guard < next.units.length * 4; guard += 1) {
    const entrants = next.units.filter((unit) =>
      unit.hp > 0 &&
      unit.type === "nemesis" &&
      nemesisThresholdBand(unit.hp) > (previousBand.get(unit.id) ?? 0)
    );
    if (!entrants.length) return;

    const beforeWave = new Map(next.units.map((unit) => [unit.id, nemesisThresholdBand(unit.hp)]));
    for (const entrant of entrants) {
      if (next.phase !== "playing") return;
      const unit = findUnit(next, entrant.id);
      if (!unit || unit.hp <= 0 || unit.type !== "nemesis") continue;
      const crossings = nemesisThresholdBand(unit.hp) - (previousBand.get(unit.id) ?? 0);
      for (let i = 0; i < crossings; i += 1) {
        if (next.phase !== "playing" || unit.hp <= 0) break;
        resolveNemesisAutoPulse(next, unit, events, { trigger: "missingHpThreshold" });
      }
    }
    previousBand = beforeWave;
  }
}

function hasRageEntryEffect(unit) {
  const definition = getUnitType(unit.type);
  const effects = [definition.ragePassive, definition.rageArt].map((source) => source?.effect);
  return Boolean(
    effects.some((effect) => effect?.type === "rageEntryRestore") ||
    getRageEffectValue(unit, "freePyroclasm", null)
  );
}

function applyRageEntryEffects(prevState, next, events) {
  if (next.phase !== "playing") return;

  let previousRage = new Map(prevState.units.map((unit) => [unit.id, isRaging(unit)]));
  for (let guard = 0; guard < next.units.length; guard += 1) {
    const entrants = next.units.filter((unit) =>
      unit.hp > 0 &&
      !previousRage.get(unit.id) &&
      isRaging(unit) &&
      hasRageEntryEffect(unit)
    );
    if (!entrants.length) return;

    const beforeWaveRage = new Map(next.units.map((unit) => [unit.id, isRaging(unit)]));
    for (const entrant of entrants) {
      if (next.phase !== "playing") return;
      const unit = findUnit(next, entrant.id);
      if (!unit || unit.hp <= 0 || !isRaging(unit)) continue;
      const definition = getUnitType(unit.type);
      const restore = [definition.ragePassive, definition.rageArt]
        .map((source) => source?.effect)
        .find((effect) => effect?.type === "rageEntryRestore");
      if (restore) {
        const beforeHp = unit.hp;
        const beforeMp = unit.mp;
        unit.hp = Math.min(getEffectiveStats(unit, next).maxHp, unit.hp + (restore.hp ?? 0));
        unit.mp = Math.min(getEffectiveStats(unit, next).maxMp, unit.mp + (restore.mp ?? 0));
        events.push({
          type: "RAGE_REGENERATE",
          unitId: unit.id,
          hpRestored: unit.hp - beforeHp,
          mpRestored: unit.mp - beforeMp
        });
      }

      const freeCast = getRageEffectValue(unit, "freePyroclasm", null);
      if (!freeCast) continue;
      resolveVolcanicPyroclasmTick(next, unit, freeCast, events, {
        trigger: "rageEntry",
        force: true,
        resetCounter: true
      });
    }
    previousRage = beforeWaveRage;
  }
}

function applyOneShotRageTransitions(prevState, next, events) {
  for (const unit of next.units) {
    if (!oneShotRageEffect(unit)) continue;
    const previous = prevState.units.find((entry) => entry.id === unit.id);
    const wasRaging = previous ? isRaging(previous) : false;
    const nowRaging = isRaging(unit);
    if (!nowRaging) {
      unit.desperationRageArmed = false;
      unit.desperationShotSpent = false;
      continue;
    }
    if (!wasRaging && nowRaging) {
      unit.desperationRageArmed = true;
      unit.desperationShotSpent = false;
      events.push({ type: "DESPERATION_READY", unitId: unit.id });
    }
  }
}

// Virus's Spread (statusSpread): a NEW debuff on an enemy of a living Virus propagates to
// that enemy's allies within the Virus's spread radius (RAGE widens it). Diff-based over
// prev→next so it catches a status from ANY source — a cast, a basic-attack crit, a global
// blind — in one deterministic pass. Spread statuses are applied but NOT themselves
// re-spread (one hop, no chain reaction), because the newly-afflicted set is captured from
// the initial diff before any propagation runs. No RNG, so lockstep clients all agree.
function applySpreadReactions(prevState, next, events) {
  if (next.phase !== "playing") return;
  const spreaders = next.units
    .map((unit) => ({ unit, config: unit.hp > 0 ? getStatusSpreadConfig(unit) : null }))
    .filter((entry) => entry.config);
  if (!spreaders.length) return;

  const before = new Map(prevState.units.map((unit) =>
    [unit.id, new Set((unit.statuses ?? []).map((status) => status.type))]));

  // Capture every (unit, new-status) pair up front so a spread we add below is never
  // itself re-processed into a second hop.
  const newlyAfflicted = [];
  for (const unit of next.units) {
    if (unit.hp <= 0) continue;
    const had = before.get(unit.id) ?? new Set();
    for (const status of unit.statuses ?? []) {
      if (!had.has(status.type)) newlyAfflicted.push({ unit, status });
    }
  }

  for (const { unit, status } of newlyAfflicted) {
    const relevant = spreaders.filter(({ unit: virus, config }) =>
      virus.hp > 0 && areEnemies(virus, unit) && config.statuses.has(status.type));
    if (!relevant.length) continue;
    const radius = Math.max(...relevant.map(({ config }) => config.radius));
    if (radius <= 0) continue;

    const spreadTo = [];
    for (const ally of next.units) {
      if (ally.hp <= 0 || ally.id === unit.id || !areAllies(ally, unit)) continue;
      if (chebyshevDistance(unit.position, ally.position) > radius) continue;
      const applied = applyStatus(ally, { ...status });
      if (applied.applied) { ally.statuses = applied.statuses; spreadTo.push(ally.id); }
    }
    if (spreadTo.length) {
      events.push({ type: "STATUS_SPREAD", sourceUnitId: unit.id, status: status.type, spreadTo });
    }
  }
}

// Shared Pyroclasm damage: 5 magic to every enemy on any of the 8 straight rays within
// range. Magic honors Defend halving, Dead Zone team reduction, Black Death immunity,
// and Bruiser-Mode magic vulnerability — exactly like resolveNuke, so a manual cast and
// the free Volcanic-Rage eruption resolve identically. Mutates `state`; returns the hit
// set for the event. Does NOT resolve victory (the caller does, after).
function applyPyroclasmDamage(state, actor, art) {
  const damageByTarget = {};
  const targetIds = [];
  const reactionEvents = [];
  for (const target of getPyroclasmTargets(state, actor, art)) {
    const targetStats = { ...getEffectiveStats(target, state), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: art.damage.amount }, defender: targetStats, type: "magic" });
    const damage = finalizeMagicDamage({ attacker: actor, target, state, rawDamage: result.damage, art });
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    if (dealt > 0 || damage > 0) { targetIds.push(target.id); damageByTarget[target.id] = damage; }
  }
  return { targetIds, damageByTarget, reactionEvents };
}

function moveUnit(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (isCommandOnly(result.unit)) return reject(ERR.COMMANDER_CANNOT_ACT);
  if (state.activation.moved) return reject(ERR.MOVE_ALREADY_USED);
  if (!getLegalMoves(state, result.unit).has(positionKey(command.position))) return reject(ERR.MOVE_OUT_OF_RANGE);

  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  const from = { ...unit.position };
  const path = getLegalMovePath(state, result.unit, command.position) ?? [{ ...command.position }];
  const trampleDamage = Math.max(0, Number(getRageEffectValue(unit, "trampleDamage", 0)) || 0);
  const harmed = [];
  const damageByTarget = {};
  if (trampleDamage > 0) {
    for (const step of path) {
      const target = unitAt(next, step);
      if (!target || !areEnemies(unit, target)) continue;
      const dealt = Math.min(target.hp, trampleDamage);
      target.hp = Math.max(0, target.hp - trampleDamage);
      harmed.push(target.id);
      damageByTarget[target.id] = (damageByTarget[target.id] ?? 0) + dealt;
    }
  }
  unit.position = { ...command.position };
  if (stationaryStrengthEffect(unit)) unit.stationaryStrength = 0;
  next.activation.moved = true;
  resolveVictory(next);
  return accept(next, [{
    type: "UNIT_MOVED",
    unitId: unit.id,
    from,
    to: { ...unit.position },
    ...(harmed.length ? { path: path.map((step) => ({ ...step })), harmed, damageByTarget } : {})
  }]);
}

function cancelMove(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (!state.activation.moved) return reject(ERR.CANCEL_NOT_AVAILABLE);
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);

  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  const restoredTo = { ...next.activation.origin };
  unit.position = restoredTo;
  next.activation.moved = false;

  return accept(next, [{ type: "MOVE_CANCELLED", unitId: unit.id, restoredTo: { ...restoredTo } }]);
}

function attack(state, command) {
  const result = validateOpenActivation(state, command.player, command.actorId);
  if (result.error) return reject(result.error);
  if (isCommandOnly(result.unit)) return reject(ERR.COMMANDER_CANNOT_ACT);
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);
  // A wall is attacked by tile (no unit there); it resolves through its own path.
  if (command.targetPosition) return attackWall(state, command, result.unit);
  const target = findUnit(state, command.targetId);
  if (!target || target.hp <= 0 || !areEnemies(result.unit, target)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(result.unit.position, target.position) > getEffectiveStats(result.unit, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // A basic attack is body-blocked by any unit in between unless the attacker has an
  // explicit pierce passive (Sniper). Angel's Blessed Arrow changes damage type, not
  // targeting. A wall between blocks too, unless pierce says otherwise.
  const basicDamageType = getBasicAttackDamageType(result.unit);
  if (isShotBlocked(state, result.unit.position, target.position, result.unit) ||
      isWallBetween(state, result.unit.position, target.position, result.unit)) return reject(ERR.TARGET_OBSTRUCTED);

  const next = cloneState(state);
  const actor = findUnit(next, command.actorId);
  const nextTarget = findUnit(next, command.targetId);
  next.activation.primaryUsed = true;

  // Witch Doctor stance on-attack triggers fire on the swing itself (hit or miss):
  // Rain charges next-turn haste, Spirit restores MP to nearby allies. No-op for
  // every other unit (no stance).
  const triggerEvents = applyStanceAttackTriggers(next, actor);

  // To-hit roll first (miss/crit). Blind and the raging Archer's never-miss are
  // folded into the chance, so a guaranteed miss reads through the same path.
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    const desperationEvents = consumeOneShotRage(actor);
    return accept(next, [{ type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id, hit: false, missed: true, roll: swing.hitRoll }, ...triggerEvents, ...desperationEvents]);
  }
  const targets = getLineAttackTargets(next, actor, nextTarget);
  const targetIds = [];
  const damageByTarget = {};
  let totalDamageDealt = 0;
  let primaryDamage = null;
  // On-hit status riders. A raging kit that poisons EVERY landed hit (Virus's Infectious
  // Affinity) applies unconditionally; otherwise a crit rider (Angel's Blessed Arrow blind,
  // Virus's Spread crit-poison) applies only on a critical. Immunity is enforced by
  // applyStatus, so a status-immune target simply resists.
  const critStatus = getCritOnHitStatus(actor);
  const rageAttackStatus = getRageAttackStatus(actor);
  const poisonRefund = getPoisonMpRefund(actor);
  const critFire = getCritCreatesFire(actor);
  const blinded = []; // targets that received an on-hit status (event key kept for back-compat)
  const fireTiles = [];
  const rockHardEvents = []; // Rock Hard (Clod): MP refunded per physical strike while defending
  const magicReactionEvents = [];
  let poisonedByAttack = 0;
  const strike = (unit) => resolveBaseStrike(actor, unit, { proximity: true, critical: swing.critical, state: next, damageType: basicDamageType });
  for (const targetUnit of targets) {
    const damage = strike(targetUnit);
    const damageDealt = Math.min(targetUnit.hp, damage.damage);
    targetUnit.hp = Math.max(0, targetUnit.hp - damage.damage);
    const magicReaction = basicDamageType === "magic" ? applyMagicDamageReaction(targetUnit, damageDealt) : null;
    if (magicReaction) magicReactionEvents.push(magicReaction);
    targetIds.push(targetUnit.id);
    damageByTarget[targetUnit.id] = damage.damage;
    totalDamageDealt += damageDealt;
    rockHardEvents.push(...applyRockHardDefense(next, targetUnit, basicDamageType === "physical"));
    const onHit = rageAttackStatus ?? (swing.critical ? critStatus : null);
    if (onHit && targetUnit.hp > 0) {
      const applied = applyStatus(targetUnit, { type: onHit.status, duration: onHit.duration });
      if (applied.applied) {
        targetUnit.statuses = applied.statuses;
        blinded.push(targetUnit.id);
        if (onHit.status === "poison") poisonedByAttack += 1;
      }
    }
    if (swing.critical && critFire) {
      const position = { ...targetUnit.position };
      next.tileObjects[positionKey(position)] = { kind: critFire.kind ?? "fire", permanent: Boolean(critFire.permanent) };
      fireTiles.push(position);
    }
    if (targetUnit.id === nextTarget.id) primaryDamage = damage;
  }
  const damage = primaryDamage ?? strike(nextTarget);
  // A magic strike (Blessed Arrow) never feeds a physical-damage heal aura (Hand of Life).
  const healingEvents = basicDamageType === "physical" ? resolvePhysicalDamageHealing(next, actor, totalDamageDealt) : [];
  // Stone Body (Gargoyle): a landed MELEE strike on a DEFENDING Gargoyle returns TRUE
  // damage to the attacker (ignoring the attacker's DEF/Defend). Melee = the attacker
  // stands adjacent; a ranged shot (distance > 1) never triggers it. A Gargoyle raging
  // under Volcanic Rage is always defending, so it always bites a melee attacker.
  const retaliationEvents = [];
  const thorns = getMeleeDefendRetaliation(nextTarget);
  if (thorns > 0 && nextTarget.hp > 0 && isDefending(nextTarget) &&
      chebyshevDistance(actor.position, nextTarget.position) === 1) {
    const dealt = Math.min(actor.hp, thorns);
    actor.hp = Math.max(0, actor.hp - thorns);
    if (dealt > 0) retaliationEvents.push({ type: "STONE_RETALIATION", offenderId: actor.id, sourceId: nextTarget.id, damage: dealt });
  }
  // Growth (Virus): restore MP for each enemy this attack poisoned.
  const growthEvents = poisonRefund > 0 ? applyGrowth(next, actor, poisonRefund * poisonedByAttack) : [];
  const desperationEvents = consumeOneShotRage(actor);
  resolveVictory(next);
  const { type: _dmgType, ...damageFields } = damage;
  return accept(next, [{
    type: "ATTACK_RESOLVED", actorId: actor.id, targetId: nextTarget.id,
    hit: true, missed: false, roll: swing.hitRoll, targetHpAfter: nextTarget.hp, targetIds, damageByTarget,
    ...(blinded.length ? { blinded } : {}),
    ...(fireTiles.length ? { fireTiles } : {}),
    ...damageFields
  }, ...triggerEvents, ...healingEvents, ...retaliationEvents, ...growthEvents, ...desperationEvents, ...rockHardEvents, ...magicReactionEvents]);
}

// A Build Cover wall is a destructible obstacle, not a unit: an attack against it
// never rolls to-hit (it can't dodge) and deals the attacker's STR, removing the
// wall once its HP hits 0. Spends the unit's primary like any attack. Range and
// line-of-sight are checked like a unit attack — a body blocks a physical shot, a
// wall blocks the line, and only the Sniper's pierce reaches a covered wall.
function attackWall(state, command, attacker) {
  const pos = command.targetPosition;
  if (!isWallAt(state, pos)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(attacker.position, pos) > getEffectiveStats(attacker, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  if (isShotBlocked(state, attacker.position, pos, attacker) ||
      isWallBetween(state, attacker.position, pos, attacker)) return reject(ERR.TARGET_OBSTRUCTED);

  const next = cloneState(state);
  const key = positionKey(pos);
  const wall = next.tileObjects[key];
  wall.hp = Math.max(0, wall.hp - getEffectiveStats(findUnit(next, command.actorId), next).strength);
  next.activation.primaryUsed = true;
  const destroyed = wall.hp <= 0;
  if (destroyed) delete next.tileObjects[key];
  return accept(next, [{ type: "WALL_ATTACKED", actorId: command.actorId, position: { ...pos }, destroyed, hpAfter: destroyed ? 0 : wall.hp }]);
}

function defend(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (isCommandOnly(result.unit)) return reject(ERR.COMMANDER_CANNOT_ACT);
  if (state.activation.primaryUsed) return reject(ERR.PRIMARY_ALREADY_USED);
  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  unit.defending = true;
  next.activation.primaryUsed = true;
  const events = [{ type: "UNIT_DEFENDED", unitId: command.unitId }];
  // Snack Break (Fat Cleric): bracing without having moved this activation restores a
  // little HP (honoring a board-wide healing lockout) and MP. Read centrally off the
  // passive so no rule hard-codes the unit.
  const snack = getUnitType(unit.type).passive?.effect;
  if (snack?.type === "defendRestore" && !next.activation.moved) {
    const stats = getEffectiveStats(unit, next);
    const beforeHp = unit.hp;
    const beforeMp = unit.mp;
    if (!isHealingDisabled(next)) unit.hp = Math.min(stats.maxHp, unit.hp + (snack.hp ?? 0));
    unit.mp = Math.min(stats.maxMp, unit.mp + (snack.mp ?? 0));
    const hpRestored = unit.hp - beforeHp;
    const mpRestored = unit.mp - beforeMp;
    if (hpRestored > 0 || mpRestored > 0) {
      events.push({ type: "SNACK_BREAK", unitId: unit.id, hpRestored, mpRestored });
    }
  }
  return accept(next, events);
}

// New art mechanics register here instead of adding branches to useArt.
// Default (targeted attack + optional status/heal effect) needs no entry.
const ART_RESOLVERS = new Map([
  ["footwork", resolveRushPath],
  ["stumble", resolveRushPath],
  ["fart", resolveFart],
  ["volley-shot", resolveVolleyShot],
  ["pray", resolveHealAllies],
  ["wish", resolveHealAllies],
  ["silence", resolveStatusCast],
  ["smoke-bomb", resolveStatusCast],
  ["flee", resolveFlee],
  ["nuke", resolveNuke],
  ["dark-bomb", resolveNuke],
  ["summon-ghoul", resolveSummonGhoul],
  ["build-cover", resolveBuildCover],
  ["throw-cigar", resolveThrowCigar],
  ["lightseeker", resolveTilePulse],
  ["darkseeker", resolveTilePulse],
  ["heavenseeker", resolveTilePulse],
  // Angel: a friendly-only buff cast and a white-tile team heal.
  ["anoint", resolveAnoint],
  ["elevate", resolveHealAllies],
  // Mystic: friendly-only single-target cleanse.
  ["purify", resolveCleanseAlly],
  // Witch Doctor dances: each fires a one-shot team/global effect then enters its
  // stance (the "Dancing Man" passive). One resolver branches on the art's data.
  ["rain-dance", resolveWitchDance],
  ["fire-dance", resolveWitchDance],
  ["spirit-dance", resolveWitchDance],
  ["misfortune-dance", resolveWitchDance],
  ["black-death-dance", resolveWitchDance],
  // Father Time: ally-OR-enemy utility casts + a revive.
  ["age", resolveAge],
  ["time-stretch", resolveTimeStretch],
  ["rewind", resolveRewind],
  // Juggernaut: line grab/strike, a self MP vent, and a self-sacrifice blast.
  ["tether-grab", resolveTetherGrab],
  ["rocket-punch", resolveRocketPunch],
  ["recharge", resolveRecharge],
  ["self-destruct", resolveSelfDestruct],
  // King: the four global commands all record the command and spend the activation; the
  // buff itself is a live fold (getCommandBuffStats), so the resolver stores no numbers.
  ["strike", resolveKingCommand],
  ["hold", resolveKingCommand],
  ["pursue", resolveKingCommand],
  ["higher-ground", resolveKingCommand],
  // Monk: fixed-power kick with conditional knockback, and an ally guard reposition.
  ["front-kick", resolveFrontKick],
  ["protect", resolveProtect],
  // Gargoyle: fly-then-blast reposition, and a self-centred line burst.
  ["flight", resolveFlight],
  ["pyroclasm", resolvePyroclasm],
  // Nemesis: all-ray first-contact magic and the move+Pulse next-turn setup.
  ["dark-pulse", resolveDarkPulse],
  ["realm-traversal", resolveRealmTraversal],
  // Virus: a self-centred blind cloud and the two poison detonations (Poison Tick + Explosion).
  ["smog", resolveSmog],
  ["poison-tick", resolvePoisonBurst],
  ["explosion", resolvePoisonBurst],
  // Clod: a self-centred quake (variable magic + MP refund on a full-team hit), a STR-
  // scaling boulder throw with a guaranteed slow/crit-stun, and the RAGE targeted blast.
  ["quake", resolveQuake],
  ["stone-throw", resolveStoneThrow],
  ["thunderous-charge", resolveThunderousCharge],
  // Fat Wizard: Study mark, Clumsy splash casts, and direct HP/MP transfer.
  ["zap", resolveFatWizardZap],
  ["study", resolveStudy],
  ["surge", resolveFatWizardSurge],
  ["relay-power", resolveRelayPower],
  // Fat Cleric: a random-value team heal, a negative-only ally cleanse, and a roll-or-
  // backfire single-ally heal.
  ["hope", resolveHealAllies],
  ["cleanse", resolveCleanseAlly],
  ["focus-prayer", resolveFocusPrayer]
]);

function useArt(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (!canUseArt(state, result.unit, command.artId)) return reject(ERR.ART_NOT_AVAILABLE);
  const art = getArt(result.unit.type, command.artId);
  const resolver = ART_RESOLVERS.get(art.id) ?? resolveTargetedArt;
  return resolver(state, command, art);
}

function resolveRushPath(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  if (!validateRushPath(state, actorState, command.path, art)) return reject(ERR.INVALID_ART_PATH);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  const harmed = [];
  const damageByTarget = {};
  const damage = getRushContactDamage(actor, art);
  for (const step of command.path) {
    const target = unitAt(next, step);
    if (target && areEnemies(actor, target)) {
      const dealt = Math.min(target.hp, damage);
      target.hp = Math.max(0, target.hp - damage);
      harmed.push(target.id);
      damageByTarget[target.id] = (damageByTarget[target.id] ?? 0) + dealt;
    }
  }
  actor.position = { ...command.path.at(-1) };
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    path: command.path.map((step) => ({ ...step })),
    harmed,
    damageByTarget,
    mpCost: cost
  }]);
}

function fartPushDestination(actor, target) {
  const dx = Math.sign(target.position.x - actor.position.x);
  const dy = Math.sign(target.position.y - actor.position.y);
  if (Math.abs(target.position.x - actor.position.x) >= Math.abs(target.position.y - actor.position.y)) {
    return { x: target.position.x + dx, y: target.position.y };
  }
  return { x: target.position.x, y: target.position.y + dy };
}

function resolveFart(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = art.targeting?.radius ?? 1;
  const amount = art.damage?.amount ?? 2;
  const originalOccupied = new Set(livingUnits(next).map((unit) => positionKey(unit.position)));
  const pushed = {};
  const blocked = [];
  const damageByTarget = {};

  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const destination = fartPushDestination(actor, target);
    if (!isOnBoard(next, destination) || isWallAt(next, destination) || originalOccupied.has(positionKey(destination))) {
      const dealt = Math.min(target.hp, amount);
      target.hp = Math.max(0, target.hp - amount);
      blocked.push(target.id);
      damageByTarget[target.id] = dealt;
      continue;
    }
    const from = { ...target.position };
    target.position = destination;
    pushed[target.id] = { from, to: { ...destination } };
  }

  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    pushed,
    blocked,
    damageByTarget,
    mpCost: cost
  }]);
}

function resolveTargetedArt(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // ARTS that resolve as a physical strike (Poison Arrow, Leg Shot) are body-blocked
  // just like a basic attack; magic ARTS (Spark, Banish) reach their target directly.
  // A wall, however, blocks BOTH physical and magic ARTS (only the Sniper pierces it).
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }
  if ((art.damageType ?? "physical") === "physical" &&
      !art.effect?.pierceUnits &&
      isShotBlocked(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  // ART attacks roll to-hit like a basic attack (the ART's own status/heal check is
  // a SECOND, separate roll below). A missed swing deals no damage and lands no
  // effect, but the ART is still spent — you committed the activation and the MP.
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    const desperationEvents = consumeOneShotRage(actor);
    spendAndAdvance(next, actor);
    return accept(next, [{ type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost, hit: false, missed: true, roll: swing.hitRoll }, ...desperationEvents]);
  }

  if (art.damageType === "magic") next.activation.spellUsed = true;

  // Targeted attack ARTS resolve via the attacker's base strike type. `art.damageType`
  // overrides to magic for ARTS like Spark and Banish (magic ignores proximity bonuses). A
  // FIXED-amount magic art (Virus's Cough "5 magic") stands its `damage.amount` in for STR
  // via resolveFixedMagicStrike instead of scaling off effective STR.
  const fixedMagic = art.damageType === "magic" && Number.isFinite(art.damage?.amount);
  const damage = fixedMagic
    ? resolveFixedMagicStrike(actor, target, art.damage.amount, { critical: swing.critical, state: next, art })
    : resolveBaseStrike(actor, target, { proximity: true, critical: swing.critical, state: next, damageType: art.damageType ?? null, damageAffinity: art.damageAffinity ?? art.damage?.affinity ?? null });
  const damageDealt = Math.min(target.hp, damage.damage);
  target.hp = Math.max(0, target.hp - damage.damage);
  const magicReaction = damage.type === "magic" ? applyMagicDamageReaction(target, damageDealt) : null;

  let effect = null;
  let poisonedEnemy = false;
  if (art.effect?.type === "status" && target.hp > 0) {
    // Misfortune Stance (any living Witch Doctor) doubles the status chance globally.
    // Virus's Infectious Affinity forces its poison to 100% while raging.
    // Stone Body reflects a targeted status back onto the caster (applyRolledStatus).
    const guaranteed = getGuaranteedStatuses(actor).has(art.effect.status) || (art.effect.criticalGuarantees && swing.critical);
    const effectSpec = guaranteed ? { ...art.effect, chance: 1 } : art.effect;
    const attempts = guaranteed ? 1 : Math.max(1, Number(art.effect.rolls) || 1);
    const rolls = [];
    for (let index = 0; index < attempts; index += 1) {
      const override = index === 0 ? command.effectRoll : command[`effectRoll${index + 1}`];
      const roll = guaranteed
        ? { value: 0, rngState: next.rngState }
        : drawValue(next.rngState, override);
      next.rngState = roll.rngState;
      rolls.push(roll.value);
      effect = applyRolledStatus(target, effectSpec, roll.value, actor, getGlobalStatusChanceMultiplier(next));
      if (effect.applied || effect.reflected) break;
    }
    effect = {
      ...effect,
      ...(!guaranteed && attempts > 1 ? { rolls } : {}),
      ...(guaranteed ? { guaranteed: true } : {})
    };
    poisonedEnemy = Boolean(effect.applied && !effect.reflected && art.effect.status === "poison");
  } else if (art.effect?.type === "heal") {
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    const successful = roll.value >= 0 && roll.value < art.effect.chance;
    // Rain Stance's global heal bonus rides on a successful heal; a raging Juggernaut's
    // Null Zone shuts all healing off (isHealingDisabled) regardless of the roll.
    const healing = (successful && !isHealingDisabled(next)) ? Math.round(damage.damage / 2) + getGlobalHealBonus(next) + getCommandHealBonus(next, actor) : 0;
    actor.hp = Math.min(getEffectiveStats(actor, next).maxHp, actor.hp + healing);
    effect = { attempted: true, applied: successful, healing };
  }

  const healingEvents = damage.type === "physical" ? resolvePhysicalDamageHealing(next, actor, damageDealt) : [];
  // Growth (Virus): restore MP when this cast poisons an enemy (Cough).
  const growthEvents = poisonedEnemy ? applyGrowth(next, actor, getPoisonMpRefund(actor)) : [];
  // Rock Hard (Clod): a defending Clod struck by a physical ART refunds MP (its damage
  // was already negated by resolveBaseStrike).
  const rockHardEvents = applyRockHardDefense(next, target, damage.type === "physical");
  const desperationEvents = consumeOneShotRage(actor);
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: cost,
    hit: true,
    critical: swing.critical,
    roll: swing.hitRoll,
    damage,
    ...(effect ? { effect } : {})
  }, ...healingEvents, ...growthEvents, ...desperationEvents, ...rockHardEvents, ...(magicReaction ? [magicReaction] : [])]);
}

function clumsyEffect(actor) {
  return getUnitType(actor.type).passive?.effect?.type === "clumsyCast"
    ? getUnitType(actor.type).passive.effect
    : null;
}

function validateTargetedEnemyCast(state, actor, target, art) {
  if (!target || target.hp <= 0 || !areEnemies(actor, target)) return ERR.INVALID_TARGET;
  if (chebyshevDistance(actor.position, target.position) > getArtTargetRange(state, actor, art)) return ERR.TARGET_OUT_OF_RANGE;
  if (isWallBetween(state, actor.position, target.position, actor)) return ERR.TARGET_OBSTRUCTED;
  return null;
}

function applyStudyLeech(state, actor, target, damageDealt, events) {
  if (damageDealt <= 0) return;
  const reward = getMagicDamageReward(actor, target);
  if (!reward) return;
  const beforeHp = actor.hp;
  const beforeMp = actor.mp;
  actor.hp = Math.min(getEffectiveStats(actor, state).maxHp, actor.hp + reward.hp);
  actor.mp = Math.min(getEffectiveStats(actor, state).maxMp, actor.mp + reward.mp);
  const hpRestored = actor.hp - beforeHp;
  const mpRestored = actor.mp - beforeMp;
  if (hpRestored > 0 || mpRestored > 0) {
    events.push({ type: "STUDY_LEECH", actorId: actor.id, targetId: target.id, hpRestored, mpRestored });
  }
}

function applyMagicSplash(state, actor, center, { amount, excludeId, art, damageByTarget, targetIds, reactionEvents, leechEvents }) {
  if (!(amount > 0)) return;
  for (const target of livingUnits(state)) {
    if (target.id === excludeId) continue;
    if (chebyshevDistance(center.position, target.position) > (clumsyEffect(actor)?.radius ?? 1)) continue;
    const damage = resolveFixedMagicStrike(actor, target, amount, { state, art });
    const dealt = Math.min(target.hp, damage.damage);
    target.hp = Math.max(0, target.hp - damage.damage);
    if (dealt <= 0) continue;
    targetIds.push(target.id);
    damageByTarget[target.id] = (damageByTarget[target.id] ?? 0) + dealt;
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    applyStudyLeech(state, actor, target, dealt, leechEvents);
  }
}

function applyAreaHeal(state, actor, center, { amount, excludeId, healingByTarget, targetIds }) {
  if (!(amount > 0) || isHealingDisabled(state)) return;
  const boosted = amount + getGlobalHealBonus(state) + getCommandHealBonus(state, actor);
  for (const target of livingUnits(state)) {
    if (target.id === excludeId) continue;
    if (chebyshevDistance(center.position, target.position) > (clumsyEffect(actor)?.radius ?? 1)) continue;
    const before = target.hp;
    target.hp = Math.min(getEffectiveStats(target, state).maxHp, target.hp + boosted);
    const healed = target.hp - before;
    if (healed <= 0) continue;
    targetIds.push(target.id);
    healingByTarget[target.id] = (healingByTarget[target.id] ?? 0) + healed;
  }
}

function resolveFatWizardZap(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  const invalid = validateTargetedEnemyCast(state, actorState, targetState, art);
  if (invalid) return reject(invalid);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  next.activation.spellUsed = true;

  const splashDamageByTarget = {};
  const splashTargetIds = [];
  const reactionEvents = [];
  const leechEvents = [];
  const clumsy = clumsyEffect(actor);

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    applyMagicSplash(next, actor, target, {
      amount: clumsy?.missMagicDamage ?? 0,
      excludeId: target.id,
      art,
      damageByTarget: splashDamageByTarget,
      targetIds: splashTargetIds,
      reactionEvents,
      leechEvents
    });
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      mpCost: cost, hit: false, missed: true, roll: swing.hitRoll,
      splashTargetIds, splashDamageByTarget
    }, ...reactionEvents, ...leechEvents]);
  }

  const amount = (art.damage?.amount ?? 0) + Math.max(0, Number(getRageEffectValue(actor, "zapDamageBonus", 0)) || 0);
  const damage = resolveFixedMagicStrike(actor, target, amount, { critical: swing.critical, state: next, art });
  const damageDealt = Math.min(target.hp, damage.damage);
  target.hp = Math.max(0, target.hp - damage.damage);
  const magicReaction = applyMagicDamageReaction(target, damageDealt);
  if (magicReaction) reactionEvents.push(magicReaction);
  applyStudyLeech(next, actor, target, damageDealt, leechEvents);

  let effect = null;
  if (swing.critical && target.hp > 0) {
    const rageStatus = getRageEffectValue(actor, "zapCritStatus", null);
    const spec = rageStatus ?? { status: art.effect?.status, durationTurns: art.effect?.durationTurns ?? 1 };
    const applied = applyStatus(target, { type: spec.status, duration: spec.durationTurns });
    if (applied.applied) target.statuses = applied.statuses;
    effect = { status: spec.status, applied: applied.applied, ...(applied.reason ? { reason: applied.reason } : {}) };
  }

  const rageSplash = getRageEffectValue(actor, "zapSplashOnHit", null);
  const splashAmount = swing.critical
    ? (rageSplash?.critAmount ?? clumsy?.critMagicDamage ?? 0)
    : (rageSplash?.amount ?? 0);
  applyMagicSplash(next, actor, target, {
    amount: splashAmount,
    excludeId: target.id,
    art,
    damageByTarget: splashDamageByTarget,
    targetIds: splashTargetIds,
    reactionEvents,
    leechEvents
  });

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    mpCost: cost, hit: true, critical: swing.critical, roll: swing.hitRoll, damage,
    ...(effect ? { effect } : {}),
    ...(splashTargetIds.length ? { splashTargetIds, splashDamageByTarget } : {})
  }, ...reactionEvents, ...leechEvents]);
}

function resolveStudy(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  const invalid = validateTargetedEnemyCast(state, actorState, targetState, art);
  if (invalid) return reject(invalid);
  if (actorState.studiedTargetId && state.units.some((unit) => unit.id === actorState.studiedTargetId && unit.hp > 0)) {
    return reject(ERR.ART_NOT_AVAILABLE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  actor.studiedTargetId = target.id;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, studiedTargetId: target.id, mpCost: cost
  }]);
}

function resolveFatWizardSurge(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areAllies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const healingByTarget = {};
  const splashHealingByTarget = {};
  const healTargetIds = [];
  const splashTargetIds = [];
  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;

  const clumsy = clumsyEffect(actor);
  if (swing.missed) {
    applyAreaHeal(next, actor, target, {
      amount: clumsy?.surgeHeal ?? 0,
      excludeId: target.id,
      healingByTarget: splashHealingByTarget,
      targetIds: splashTargetIds
    });
  } else {
    const amount = swing.critical ? (art.heal?.critAmount ?? art.heal?.amount ?? 0) : (art.heal?.amount ?? 0);
    if (!isHealingDisabled(next)) {
      const boosted = amount + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);
      const before = target.hp;
      target.hp = Math.min(getEffectiveStats(target, next).maxHp, target.hp + boosted);
      const healed = target.hp - before;
      if (healed > 0) {
        healTargetIds.push(target.id);
        healingByTarget[target.id] = healed;
      }
    }
    const rageSplash = getRageEffectValue(actor, "surgeSplashOnHit", null);
    const splashAmount = swing.critical ? (clumsy?.surgeHeal ?? 0) : (rageSplash?.amount ?? 0);
    applyAreaHeal(next, actor, target, {
      amount: splashAmount,
      excludeId: target.id,
      healingByTarget: splashHealingByTarget,
      targetIds: splashTargetIds
    });
  }

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    mpCost: cost, hit: !swing.missed, missed: swing.missed, critical: swing.critical, roll: swing.hitRoll,
    healTargetIds, healingByTarget,
    ...(splashTargetIds.length ? { splashTargetIds, splashHealingByTarget } : {})
  }]);
}

function resolveRelayPower(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || targetState.id === actorState.id || !areAllies(actorState, targetState)) {
    return reject(ERR.INVALID_TARGET);
  }
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  const hp = Math.max(0, Number(art.effect?.hp) || 0);
  const mp = Math.max(0, Number(art.effect?.mp) || 0);
  if (actorState.hp <= hp || actorState.mp < mp) return reject(ERR.ART_NOT_AVAILABLE);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  actor.hp = Math.max(0, actor.hp - hp);
  actor.mp = Math.max(0, actor.mp - mp);
  const beforeHp = target.hp;
  const beforeMp = target.mp;
  if (!isHealingDisabled(next)) {
    target.hp = Math.min(getEffectiveStats(target, next).maxHp, target.hp + hp + getGlobalHealBonus(next) + getCommandHealBonus(next, actor));
  }
  target.mp = Math.min(getEffectiveStats(target, next).maxMp, target.mp + mp);
  const healed = target.hp - beforeHp;
  const restored = target.mp - beforeMp;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: 0,
    hpPaid: hp,
    mpPaid: mp,
    healingByTarget: healed > 0 ? { [target.id]: healed } : {},
    restoredByTarget: restored > 0 ? { [target.id]: restored } : {}
  }]);
}

function resolveFlee(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const legal = getLegalFleeTiles(state, actorState);
  if (!command.targetPosition || !legal.has(positionKey(command.targetPosition))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const from = { ...actor.position };
  actor.position = { ...command.targetPosition };
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    path: [from, { ...command.targetPosition }],
    mpCost: cost
  }]);
}

function resolveNuke(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  const radius = getSelfBlastRadius(next, actor, art);
  const damageByTarget = {};
  const targetIds = [];
  const reactionEvents = [];

  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const targetStats = { ...getEffectiveStats(target, next), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: art.damage.amount }, defender: targetStats, type: "magic" });
    const damage = finalizeMagicDamage({ attacker: actor, target, state: next, rawDamage: result.damage, art });
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    targetIds.push(target.id);
    damageByTarget[target.id] = damage;
  }

  actor.mp -= cost;
  next.activation.spellUsed = true;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds,
    damageByTarget,
    mpCost: cost
  }, ...reactionEvents]);
}

// Flight (Gargoyle): fly onto a chosen empty tile within (Move + 1) Chebyshev spaces,
// then deal a small TRUE blast to every enemy within `blastRadius` of the landing tile
// (true damage ignores DEF and Defend). Spends MP + the whole activation like any ART.
function resolveFlight(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getFlightTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const from = { ...actor.position };
  actor.position = { ...placement };
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const radius = art.blastRadius ?? 1;
  const amount = art.damage?.amount ?? 0;
  const damageByTarget = {};
  const targetIds = [];
  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const dealt = Math.min(target.hp, amount);
    target.hp = Math.max(0, target.hp - amount);
    targetIds.push(target.id);
    damageByTarget[target.id] = dealt;
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id,
    path: [from, { ...placement }], targetIds, damageByTarget, mpCost: cost
  }]);
}

// Pyroclasm (Gargoyle): a self-centred line burst — 5 magic to every enemy standing on
// any of the 8 straight rays within range (a wall/edge stops a ray; a body does NOT).
// Shares the magic-damage math with the free Volcanic-Rage eruption (applyPyroclasmDamage).
function resolvePyroclasm(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const { targetIds, damageByTarget, reactionEvents } = applyPyroclasmDamage(next, actor, art);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  next.activation.spellUsed = true;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget, mpCost: cost
  }, ...reactionEvents]);
}

// Smog (Virus): a self-centred blind CLOUD — every enemy within the blast radius is
// blinded with no roll. A board-wide AoE status, so it applies directly (immunity
// respected) and is NOT reflected the way a single-target cast is (mirrors the Witch
// Doctor's global blind). Shares the nukeAura radius plumbing for its preview + reach.
function resolveSmog(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = getSelfBlastRadius(next, actor, art);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  const statusTargets = [];
  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const applied = applyStatus(target, { type: art.effect.status, duration: art.effect.durationTurns });
    if (applied.applied) { target.statuses = applied.statuses; statusTargets.push(target.id); }
  }
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, statusTargets, mpCost: cost
  }]);
}

// Poison Tick / Explosion (Virus): a global detonation of poisoned enemies. Every
// poisoned enemy takes `damage.amount` TRUE damage (ignores DEF, Defend, team reduction);
// an optional `splash` also hits enemies within `splash.radius` of a poisoned enemy.
// `selfKill` consumes Virus (Explosion). No target, no roll.
function resolvePoisonBurst(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const amount = Math.max(0, Number(art.damage?.amount) || 0);
  const splash = art.splash ?? null;
  const poisoned = livingUnits(next).filter((unit) =>
    areEnemies(actor, unit) && (unit.statuses ?? []).some((status) => status.type === "poison"));
  const poisonedIds = new Set(poisoned.map((unit) => unit.id));

  const damageByTarget = {};
  const targetIds = [];
  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    let dealt = 0;
    if (poisonedIds.has(target.id)) {
      dealt = amount;
    } else if (splash && poisoned.some((p) => chebyshevDistance(p.position, target.position) <= splash.radius)) {
      dealt = Math.max(0, Number(splash.amount) || 0);
    }
    if (dealt <= 0) continue;
    const applied = Math.min(target.hp, dealt);
    target.hp = Math.max(0, target.hp - dealt);
    targetIds.push(target.id);
    damageByTarget[target.id] = applied;
  }

  if (art.selfKill) actor.hp = 0; // Explosion consumes Virus
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget,
    ...(art.selfKill ? { selfDestruct: true } : {}), mpCost: cost
  }]);
}

// Quake (Clod): a self-centred ground slam. Every enemy within the radius takes the SAME
// (base + number caught) magic damage — magic honors Defend halving / Dead Zone / immunity
// like every self-centred blast. If the quake catches the ENTIRE enemy team, the MP is
// refunded (mirrors the Nemesis Dark Pulse refund).
function resolveQuake(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = getSelfBlastRadius(next, actor, art);
  const enemies = livingUnits(next).filter((u) => areEnemies(actor, u) && chebyshevDistance(actor.position, u.position) <= radius);
  const totalEnemies = livingUnits(next).filter((u) => areEnemies(actor, u)).length;
  const amount = (art.damage?.amount ?? 3) + enemies.length;

  const damageByTarget = {};
  const targetIds = [];
  const reactionEvents = [];
  for (const target of enemies) {
    const targetStats = { ...getEffectiveStats(target, next), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: amount }, defender: targetStats, type: "magic" });
    const damage = finalizeMagicDamage({ attacker: actor, target, state: next, rawDamage: result.damage, art });
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    targetIds.push(target.id);
    damageByTarget[target.id] = dealt;
  }

  const refunded = enemies.length > 0 && enemies.length === totalEnemies;
  const cost = getArtMpCost(actor, art, next);
  if (!refunded) actor.mp -= cost;
  next.activation.spellUsed = true;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget,
    mpCost: cost, refunded, quakeAmount: amount
  }, ...reactionEvents]);
}

// Stone Throw (Clod): a STR-scaling physical boulder (fixed power that rises with STR above
// Clod's base, like Front Kick) that rolls to-hit/crit. On a LANDED hit it also applies a
// guaranteed status with NO roll — a crit stuns, otherwise it slows. A defending Rock-Hard
// target negates the damage but still eats the status; Stone Body reflects the status.
function resolveStoneThrow(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // A thrown boulder is a physical ranged strike: a body OR a wall between blocks it.
  if (isShotBlocked(state, actorState.position, targetState.position, actorState) ||
      isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, targetIds: [], damageByTarget: {}, mpCost: cost
    }]);
  }

  const actorStats = getEffectiveStats(actor, next);
  const scaleStat = art.damage.scaleStat;
  const baseStat = art.damage.baseStat ?? actorStats[scaleStat];
  const power = (art.damage.amount ?? 8) + Math.max(0, actorStats[scaleStat] - baseStat);
  const result = resolveDamage({
    attacker: { strength: power },
    defender: { ...getEffectiveStats(target, next), defending: isDefending(target) },
    type: "physical", critical: swing.critical && !ignoresCriticalDamage(target)
  });
  const damage = negatesPhysicalWhileDefending(target) ? 0 : result.damage;
  const damageDealt = Math.min(target.hp, damage);
  target.hp = Math.max(0, target.hp - damage);
  const rockHardEvents = applyRockHardDefense(next, target, true);

  let appliedStatus = null;
  if (target.hp > 0) {
    const spec = swing.critical ? art.onCrit : art.onHit;
    const res = applyRolledStatus(target, { ...spec, chance: 1 }, 0, actor);
    if (res.applied && !res.reflected) appliedStatus = spec.status;
  }

  const healingEvents = resolvePhysicalDamageHealing(next, actor, damageDealt);
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    targetIds: [target.id], damageByTarget: { [target.id]: damage },
    hit: true, critical: swing.critical, roll: swing.hitRoll, damage, appliedStatus, mpCost: cost
  }, ...healingEvents, ...rockHardEvents]);
}

// Thunderous Charge (Clod, RAGE): Clod CHARGES to a clear tile within range and quakes a
// Chebyshev radius on landing: 10 physical (DEF + Defend still apply; a defending Rock Hard
// enemy negates it) and a guaranteed 1-turn stun to every enemy caught. He ends the turn
// standing on that tile. The stun is an AoE application (immunity respected, never reflected),
// like Smog.
function resolveThunderousCharge(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const center = command.targetPosition;
  if (!center || !getTargetedBlastAimTiles(state, actorState, art).has(positionKey(center))) {
    return reject(ERR.INVALID_TARGET);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const from = { ...actor.position };
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  // The blast is centered on where Clod lands; move him there first so the footprint (and
  // his committed position) agree. The tile is a validated clear landing spot.
  actor.position = { ...center };

  const radius = art.targeting?.radius ?? 2;
  const damageByTarget = {};
  const targetIds = [];
  const stunnedIds = [];
  const rockHardEvents = [];
  for (const target of getTargetedBlastTargets(next, actor, center, radius)) {
    const result = resolveDamage({
      attacker: { strength: art.damage.amount },
      defender: { ...getEffectiveStats(target, next), defending: isDefending(target) },
      type: "physical"
    });
    const damage = negatesPhysicalWhileDefending(target) ? 0 : result.damage;
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    targetIds.push(target.id);
    damageByTarget[target.id] = dealt;
    rockHardEvents.push(...applyRockHardDefense(next, target, true));
    if (target.hp > 0) {
      const applied = applyStatus(target, { type: "stun", duration: art.stun?.durationTurns ?? 1 });
      if (applied.applied) { target.statuses = applied.statuses; stunnedIds.push(target.id); }
    }
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, from, center: { ...center },
    targetIds, damageByTarget, stunnedIds, mpCost: cost
  }, ...rockHardEvents]);
}

function serializePulseRays(rays) {
  return rays.map((ray) => ({
    dir: { ...ray.dir },
    distance: ray.distance,
    stopKind: ray.stopKind,
    position: { ...ray.position },
    ...(ray.targetId ? { targetId: ray.targetId } : {})
  }));
}

function applyDarkPulse(state, actor, art) {
  const targetIds = [];
  const damageByTarget = {};
  const healingByTarget = {};
  const reactionEvents = [];
  const pulseRays = getDarkPulseRays(state, actor);
  for (const { unit: targetRef } of pulseRays) {
    if (!targetRef) continue;
    const target = findUnit(state, targetRef.id);
    if (!target || target.hp <= 0) continue;
    targetIds.push(target.id);
    if (areAllies(actor, target)) {
      if (isHealingDisabled(state)) continue;
      const before = target.hp;
      target.hp = Math.min(getEffectiveStats(target, state).maxHp, target.hp + 1 + getGlobalHealBonus(state) + getCommandHealBonus(state, actor));
      const healed = target.hp - before;
      if (healed > 0) healingByTarget[target.id] = healed;
      continue;
    }

    const targetStats = { ...getEffectiveStats(target, state), defending: isDefending(target) };
    const result = resolveDamage({ attacker: { strength: art.damage.amount }, defender: targetStats, type: "magic" });
    const damage = finalizeMagicDamage({ attacker: actor, target, state, rawDamage: result.damage, art });
    const dealt = Math.min(target.hp, damage);
    target.hp = Math.max(0, target.hp - damage);
    const reaction = applyMagicDamageReaction(target, dealt);
    if (reaction) reactionEvents.push(reaction);
    damageByTarget[target.id] = damage;
  }
  return { targetIds, damageByTarget, healingByTarget, pulseRays: serializePulseRays(pulseRays), reactionEvents };
}

function resolveDarkPulse(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  const { targetIds, damageByTarget, healingByTarget, pulseRays, reactionEvents } = applyDarkPulse(next, actor, art);
  const refunded = targetIds.length >= (art.refundTargets ?? 4);
  if (!refunded) actor.mp -= cost;
  next.activation.spellUsed = true;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds,
    damageByTarget,
    healingByTarget,
    pulseRays,
    mpCost: cost,
    refunded
  }, ...reactionEvents]);
}

function resolveRealmTraversal(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  if (actor.realmTraversalLocked) return reject(ERR.ART_NOT_AVAILABLE);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  actor.realmTraversalCharged = true;
  actor.realmTraversalLocked = true;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    mpCost: cost,
    realmTraversalCharged: true
  }]);
}

// A summoned piece is a full unit object (same shape createUnit produces) plus a
// `summonerId` so the per-Necromancer summon cap can find it. It spawns already
// `spent` so the turn loop never offers it an activation.
function createSummon(id, type, player, team, position, summonerId) {
  const definition = getUnitType(type);
  return {
    id,
    player,
    team,
    type,
    position: { ...position },
    hp: definition.stats.maxHp,
    mp: definition.stats.maxMp,
    statModifiers: {},
    statuses: [],
    linkedStatMods: [],
    defending: false,
    spent: true,
    mageChargeCount: 0,
    stance: null,
    rainCharged: 0,
    realmTraversalCharged: false,
    realmTraversalLocked: false,
    summonerId
  };
}

function resolveSummonGhoul(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getSummonPlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const maxActive = art.summon?.maxActive ?? 1;
  const activeSummons = state.units.filter((unit) => unit.hp > 0 && unit.summonerId === actorState.id).length;
  if (activeSummons >= maxActive) {
    return reject(ERR.SUMMON_LIMIT);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  // Unique id across this Necromancer's whole summon history (dead Ghouls stay in
  // the units array), so findUnit never collides with a previous corpse.
  const seq = next.units.filter((unit) => unit.summonerId === actor.id).length;
  const ghoulId = `${actor.id}-${art.summon.type}-${seq}`;
  const ghoul = createSummon(ghoulId, art.summon.type, actor.player, teamOfUnit(actor), placement, actor.id);
  next.units.push(ghoul);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    summonedUnitId: ghoulId,
    position: { ...placement },
    mpCost: cost
  }]);
}

// Build Cover: drop a destructible wall on a clear tile within range. Spends the
// activation and MP like any active ART; the wall lives in state.tileObjects.
function resolveBuildCover(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getWallPlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  next.tileObjects[positionKey(placement)] = { kind: "wall", hp: art.wall?.hp ?? 1 };
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, position: { ...placement }, mpCost: cost
  }]);
}

// Throw Cigar: set a tile alight within range (an occupied tile is allowed — fire at
// the target's feet). The fire burns at every rollover via applyFireTick.
function resolveThrowCigar(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const placement = command.targetPosition;
  if (!placement || !getFirePlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  next.tileObjects[positionKey(placement)] = { kind: "fire", turnsLeft: art.fire?.turns ?? 3 };
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, position: { ...placement }, mpCost: cost
  }]);
}

function resolveTilePulse(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const targets = getTilePulseTargets(next, actor, art);
  const targetIds = [];
  const damageByTarget = {};
  const amount = Math.max(0, Number(art.effect.amount) || 0);

  for (const target of targets) {
    const damage = Math.min(target.hp, amount);
    if (damage <= 0) continue;
    target.hp = Math.max(0, target.hp - amount);
    targetIds.push(target.id);
    damageByTarget[target.id] = damage;
  }

  // Optional heal rider (Angel's Heavenseeker): allies standing on the pulse's affinity
  // tile also restore HP. Reuses the same tile-affinity + heal plumbing as the damage
  // side, and honors the global heal bonus / healing lockout like every other heal site.
  const healTargetIds = [];
  const healingByTarget = {};
  if (art.effect.heal) {
    const healAmount = isHealingDisabled(next)
      ? 0
      : Math.max(0, Number(art.effect.heal.amount) || 0) + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);
    if (healAmount > 0) {
      for (const ally of livingTeamUnits(next, actor)) {
        if (getTileAffinity(next, ally.position) !== art.effect.affinity) continue;
        if (!art.effect.global && chebyshevDistance(actor.position, ally.position) > (art.effect.range ?? 0)) continue;
        const before = ally.hp;
        ally.hp = Math.min(getEffectiveStats(ally, next).maxHp, ally.hp + healAmount);
        const healed = ally.hp - before;
        if (healed <= 0) continue;
        healTargetIds.push(ally.id);
        healingByTarget[ally.id] = healed;
      }
    }
  }

  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  if (art.bonusActionGroup) {
    next.activation.bonusActionGroups = [
      ...(next.activation.bonusActionGroups ?? []),
      art.bonusActionGroup
    ];
  } else {
    spendAndAdvance(next, actor);
  }
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds,
    damageByTarget,
    ...(healTargetIds.length ? { healTargetIds, healingByTarget } : {}),
    mpCost: cost,
    bonusActionGroup: art.bonusActionGroup ?? null
  }]);
}

function resolveHealAllies(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  const healingByTarget = {};
  const targetIds = [];
  // A randomAmount heal (Fat Cleric's Hope) rolls ONE shared value in [min,max] from the
  // authoritative RNG and applies it to every ally — deterministic, so online clients agree.
  let base = Math.max(0, Number(art.effect.amount) || 0);
  if (!isHealingDisabled(next) && art.effect.randomAmount) {
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    const min = Math.max(0, Number(art.effect.randomAmount.min) || 0);
    const max = Math.max(min, Number(art.effect.randomAmount.max) || 0);
    base = min + Math.floor(roll.value * (max - min + 1));
  }
  // Rain Stance's global heal bonus lifts every heal on the board (Pray/Wish too); a
  // raging Juggernaut's Null Zone zeroes all healing.
  const amount = isHealingDisabled(next) ? 0 : base + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);

  for (const target of livingTeamUnits(next, actor)) {
    if (!art.effect.global && chebyshevDistance(actor.position, target.position) > art.effect.radius) continue;
    // Tile-affinity-gated heal (Angel's Elevate: only allies on a white/light tile).
    if (art.effect.affinity && getTileAffinity(next, target.position) !== art.effect.affinity) continue;
    const before = target.hp;
    target.hp = Math.min(getEffectiveStats(target, next).maxHp, target.hp + amount);
    const healed = target.hp - before;
    if (healed <= 0) continue;
    targetIds.push(target.id);
    healingByTarget[target.id] = healed;
  }

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetIds,
    healingByTarget,
    mpCost: cost
  }]);
}

// Anoint: a friendly-only buff (Angel grants an ally +1 range for 1 turn). Cannot target
// self or an enemy; a wall does NOT block a friendly cast (same as a friendly Time
// Stretch haste). Reuses the `empowered` status lifecycle.
function resolveAnoint(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (targetState.id === actorState.id || !areAllies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const result = applyStatus(target, {
    type: art.effect.status,
    duration: art.effect.durationTurns,
    ...(art.effect.statModifiers ? { statModifiers: { ...art.effect.statModifiers } } : {})
  });
  if (result.applied) target.statuses = result.statuses;

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost,
    effect: { status: art.effect.status, applied: result.applied, ...(result.reason ? { reason: result.reason } : {}) }
  }]);
}

// "+1 STR" / "+2 STR / +1 DEF / +1 MOVE" — turns a statModifiers object into the
// label the view floats over a buffed unit. Kept here (not in the view layer) so
// the wording can never drift from the actual numbers applied above.
function resolveCleanseAlly(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (targetState.id === actorState.id || !areAllies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  const target = findUnit(next, command.targetId);
  actor.mp -= cost;

  // A scoped cleanse (Fat Cleric's Cleanse) strips only the NEGATIVE statuses, leaving
  // friendly buffs intact; the default (Mystic's Purify) wipes the whole status stack.
  const before = target.statuses ?? [];
  const kept = art.effect?.scope === "negative" ? before.filter((status) => !isNegativeStatus(status)) : [];
  const hadStatuses = before.length > kept.length;
  target.statuses = kept;

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: cost,
    cleansed: hadStatuses ? [target.id] : []
  }]);
}

// Deterministically pick a status from a WEIGHTED misfire table using a [0,1) roll: an
// entry's chance is its weight over the total. Falls back to a uniform draw across the
// standard negative statuses when no table is authored. Higher weight → more likely.
function pickMisfireStatus(pool, roll) {
  if (!Array.isArray(pool) || !pool.length) {
    return NEGATIVE_STATUS_TYPES[Math.min(NEGATIVE_STATUS_TYPES.length - 1, Math.floor(roll * NEGATIVE_STATUS_TYPES.length))];
  }
  const total = pool.reduce((sum, entry) => sum + Math.max(0, Number(entry.weight) || 0), 0);
  if (total <= 0) return pool[0].status;
  let threshold = roll * total;
  for (const entry of pool) {
    threshold -= Math.max(0, Number(entry.weight) || 0);
    if (threshold < 0) return entry.status;
  }
  return pool[pool.length - 1].status;
}

// Focus Prayer (Fat Cleric): a friendly heal that ROLLS to-hit. A landed prayer heals the
// ally (heal bonuses + the global healing lockout apply, like every heal site); a MISS makes
// the prayer backfire and inflict ONE random NEGATIVE status on the ally for a turn (immunity
// respected centrally). Cannot self-cast. A blinded Cleric always misses, so she always
// backfires — the gamble is real. No "hit" key on the event, so the CPU/online routers treat
// it as an instant (non-combat) art.
function resolveFocusPrayer(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (targetState.id === actorState.id || !areAllies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;

  const event = { type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost };
  if (!swing.missed) {
    const heal = isHealingDisabled(next) ? 0 : Math.max(0, Number(art.heal?.amount) || 0) + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);
    const beforeHp = target.hp;
    target.hp = Math.min(getEffectiveStats(target, next).maxHp, target.hp + heal);
    const healed = target.hp - beforeHp;
    event.healingByTarget = healed > 0 ? { [target.id]: healed } : {};
  } else {
    // Pick one random negative status from a seeded draw and try to apply it for a turn.
    // A weighted misfire table (art.misfire.pool) biases the pick — Fat Cleric's stun is
    // rare; with no table it falls back to a uniform draw over the standard negatives.
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    const status = pickMisfireStatus(art.misfire?.pool, roll.value);
    const result = applyStatus(target, { type: status, duration: art.misfire?.durationTurns ?? 1 });
    if (result.applied) target.statuses = result.statuses;
    event.effect = { attempted: true, applied: result.applied, status, ...(result.reason ? { reason: result.reason } : {}) };
  }

  spendAndAdvance(next, actor);
  return accept(next, [event]);
}

const STAT_MODIFIER_ABBR = Object.freeze({ strength: "STR", defense: "DEF", moveRange: "MOVE", attackRange: "RNG", maxHp: "HP", maxMp: "MP" });
function formatStatModifierLabel(statModifiers) {
  return Object.entries(statModifiers ?? {})
    .filter(([, value]) => value)
    .map(([key, value]) => `${value > 0 ? "+" : ""}${value} ${STAT_MODIFIER_ABBR[key] ?? key.toUpperCase()}`)
    .join(" / ");
}

function resolveWitchDance(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  const event = {
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    mpCost: cost,
    stance: art.stance
  };

  if (art.effect?.type === "healAllies") {
    const amount = isHealingDisabled(next) ? 0 : Math.max(0, Number(art.effect.amount) || 0) + getGlobalHealBonus(next) + getCommandHealBonus(next, actor);
    const healingByTarget = {};
    const targetIds = [];
    for (const target of livingTeamUnits(next, actor)) {
      if (!art.effect.global && chebyshevDistance(actor.position, target.position) > art.effect.radius) continue;
      const before = target.hp;
      target.hp = Math.min(getEffectiveStats(target, next).maxHp, target.hp + amount);
      const healed = target.hp - before;
      if (healed <= 0) continue;
      targetIds.push(target.id);
      healingByTarget[target.id] = healed;
    }
    event.targetIds = targetIds;
    event.healingByTarget = healingByTarget;
  }

  if (art.teamBuff) {
    const buffed = [];
    for (const target of livingTeamUnits(next, actor)) {
      const result = applyStatus(target, {
        type: "empowered",
        duration: art.teamBuff.durationTurns,
        statModifiers: { ...(art.teamBuff.statModifiers ?? {}) }
      });
      if (!result.applied) continue;
      target.statuses = result.statuses;
      buffed.push(target.id);
    }
    event.buffed = buffed;
    event.buffLabel = formatStatModifierLabel(art.teamBuff.statModifiers);
  }

  if (art.teamMp) {
    const restoredByTarget = {};
    for (const target of livingTeamUnits(next, actor)) {
      const before = target.mp;
      target.mp = Math.min(getEffectiveStats(target, next).maxMp, target.mp + art.teamMp.amount);
      const restored = target.mp - before;
      if (restored > 0) restoredByTarget[target.id] = restored;
    }
    event.restoredByTarget = restoredByTarget;
  }

  if (art.cleanse?.scope === "all") {
    const cleansed = [];
    for (const target of livingUnits(next)) {
      if (!target.statuses?.length) continue;
      target.statuses = [];
      cleansed.push(target.id);
    }
    event.cleansed = cleansed;
  }

  if (art.selfBuff) {
    // +1 duration so the buff SURVIVES this activation's own end-of-turn tick (the
    // dance spends the Witch Doctor's turn) and is live on his NEXT turn — otherwise
    // "+2 STR / +1 DEF / +1 MOVE for 1 turn" would be ticked to nothing before it
    // could ever be used. Ally buffs (teamBuff) need no bonus: the caster's tick
    // doesn't touch an ally's statuses, so they already get one buffed activation.
    const result = applyStatus(actor, {
      type: "empowered",
      duration: (art.selfBuff.durationTurns ?? 1) + 1,
      statModifiers: { ...(art.selfBuff.statModifiers ?? {}) }
    });
    if (result.applied) {
      actor.statuses = result.statuses;
      event.selfBuffed = true;
      event.selfBuffLabel = formatStatModifierLabel(art.selfBuff.statModifiers);
    }
  }

  if (art.globalStatus) {
    const statusTargets = [];
    for (const target of livingUnits(next)) {
      const result = applyStatus(target, {
        type: art.globalStatus.status,
        duration: art.globalStatus.durationTurns
      });
      if (!result.applied) continue;
      target.statuses = result.statuses;
      statusTargets.push(target.id);
    }
    event.statusTargets = statusTargets;
  }

  // Every dance is a global effect (team-wide or board-wide, never a single-target
  // cast), so the view sweeps a beacon pulse across every unit the ritual actually
  // reaches — a cleanse/global-status dance reaches everyone on the board, a
  // team-scoped dance (heal/buff/MP) reaches only the caster's living squad — so
  // the animation's reach can never drift from what the effect actually touched.
  event.beaconTargetIds = (art.cleanse?.scope === "all" || art.globalStatus
    ? livingUnits(next)
    : livingTeamUnits(next, actor)
  ).map((unit) => unit.id);

  actor.stance = art.stance ?? null;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [event]);
}

function resolveStatusCast(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getEffectiveStats(actorState, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // A wall blocks a pure cast (Silence) just like any other ranged ability.
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const roll = drawValue(next.rngState, command.effectRoll);
  next.rngState = roll.rngState;
  // Misfortune Stance (any living Witch Doctor) doubles the status chance globally.
  // Stone Body reflects a targeted status back onto the caster (applyRolledStatus).
  const effect = applyRolledStatus(target, art.effect, roll.value, actor, getGlobalStatusChanceMultiplier(next));

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetId: target.id,
    mpCost: cost,
    effect: { ...effect, status: art.effect.status }
  }]);
}

function resolveVolleyShot(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const cells = getVolleyShotCells(state, actorState, command.targetPosition);
  if (!cells) return reject(ERR.INVALID_TARGET);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const targetIds = [];
  const damageByTarget = {};
  for (const position of cells) {
    const target = unitAt(next, position);
    if (!target || !areEnemies(actor, target)) continue;
    const damage = art.damage.amount + getProximityBonus(actor, target);
    target.hp = Math.max(0, target.hp - damage);
    targetIds.push(target.id);
    damageByTarget[target.id] = damage;
  }
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED",
    artId: art.id,
    actorId: actor.id,
    targetPosition: { ...command.targetPosition },
    targetIds,
    damageByTarget,
    mpCost: cost
  }]);
}

// Age: place a SOURCE-LINKED persistent stat modifier on a target in range. On an ally
// it's a buff (+amount), on an enemy a debuff (-amount); the stat (strength|defense)
// rides on the command from the stat-picker UI (defaults to strength). The modifier
// lives on the target's `linkedStatMods` and is folded by getEffectiveStats only while
// Father Time is alive — so it "lasts until Father Time is defeated" with no cleanup.
function resolveAge(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getEffectiveStats(actorState, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  // A wall blocks the cast like any other ranged ability.
  if (isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const stat = command.stat === "defense" ? "defense" : "strength";
  const amount = Math.max(1, Number(art.effect?.amount) || 1);
  const delta = areEnemies(actorState, targetState) ? -amount : amount;

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  target.linkedStatMods = [...(target.linkedStatMods ?? []), { sourceId: actor.id, stats: { [stat]: delta } }];
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost, stat, delta
  }]);
}

// Time Stretch: an ally-OR-enemy timed status. Ally → an `empowered` +MOVE buff; enemy
// → a `slow` -MOVE debuff. No damage and no roll — it always attempts (immunity is
// still respected centrally, so a Slow-immune enemy simply resists).
function resolveTimeStretch(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getEffectiveStats(actorState, state).attackRange) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  const enemy = areEnemies(actorState, targetState);
  // Slowing an enemy is a ranged ability, so a wall blocks it; a friendly haste is not
  // shot-gated.
  if (enemy && isWallBetween(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const spec = enemy ? art.enemy : art.ally;
  // Stone Body reflects a slow (the enemy branch) back onto Father Time; a friendly
  // haste is never reflected.
  const recipient = (enemy && reflectsStatus(target)) ? actor : target;
  const result = applyStatus(recipient, {
    type: spec.status,
    duration: spec.durationTurns,
    ...(spec.statModifiers ? { statModifiers: { ...spec.statModifiers } } : {})
  });
  if (result.applied) recipient.statuses = result.statuses;

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id, mpCost: cost,
    effect: { status: spec.status, applied: result.applied, ...(result.reason ? { reason: result.reason } : {}) }
  }]);
}

// Rewind (RAGE): return a fallen ally to the board on a chosen tile within range, fully
// healed with statuses cleared. Its MP is NOT restored. The revived unit is placed
// already `spent` so the revival doesn't hand its owner a bonus activation this round.
function resolveRewind(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const target = getReviveTargets(state, actorState).find((unit) => unit.id === command.targetId);
  if (!target) return reject(ERR.INVALID_TARGET);
  const placement = command.targetPosition;
  if (!placement || !getRevivePlacementTiles(state, actorState, art).has(positionKey(placement))) {
    return reject(ERR.INVALID_TARGET);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const revived = findUnit(next, command.targetId);
  revived.position = { ...placement };
  revived.statuses = [];
  revived.defending = false;
  revived.hp = getEffectiveStats(revived, next).maxHp;
  revived.spent = true;
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, revivedUnitId: revived.id, position: { ...placement }, mpCost: cost
  }]);
}

// Tether Grab: grab the first ally OR enemy on a straight ray within range and haul them
// to the tile one step from the Juggernaut along that ray. An enemy also takes 3 magic
// damage; an ally is only repositioned. The tiles between are empty (it was the first
// contact), so the pull destination is always clear.
function resolveTetherGrab(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const line = getLineTargets(state, actorState, art.targeting.range, { includeAllies: true });
  const hit = line.find((entry) => entry.unit.id === command.targetId);
  if (!hit) return reject(ERR.INVALID_TARGET);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const grabsEnemy = areEnemies(actor, target);

  // Grabbing an ENEMY rolls to-hit like any attacking ART: a whiff hauls no one and
  // deals no damage (the tether misses), though the ART is still spent. An ally grab is
  // pure repositioning — allies are never rolled against, so it always lands.
  let swing = null;
  if (grabsEnemy) {
    swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
    next.rngState = swing.rngState;
    if (swing.missed) {
      spendAndAdvance(next, actor);
      resolveVictory(next);
      return accept(next, [{
        type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
        hit: false, missed: true, rolled: true, roll: swing.hitRoll, damage: 0, targetIds: [], damageByTarget: {}, mpCost: cost
      }]);
    }
  }

  // Stone Body: a displacement-immune target (Gargoyle) cannot be hauled — it stays put
  // and the grabber takes displacement-recoil TRUE damage. The grab's magic hit (below)
  // still lands; only the pull is negated.
  const immobile = resistsDisplacement(target);
  const destination = immobile
    ? { ...target.position }
    : { x: actor.position.x + hit.dir.x, y: actor.position.y + hit.dir.y };
  const from = { ...target.position };
  target.position = { ...destination };

  const damageByTarget = {};
  const targetIds = [];
  let damage = 0;
  if (grabsEnemy) {
    // A landed grab crits like any strike — the fixed 3 scales ×1.5 before the reduction
    // fold (magic ignores DEF; Tether Grab does not halve under Defend).
    const critical = swing.critical && !ignoresCriticalDamage(target);
    const baseAmount = critical ? Math.ceil(art.damage.amount * CRIT_MULTIPLIER) : art.damage.amount;
    damage = finalizeMagicDamage({ attacker: actor, target, state: next, rawDamage: baseAmount, art });
    if (damage > 0) {
      const dealt = Math.min(target.hp, damage);
      target.hp = Math.max(0, target.hp - damage);
      applyMagicDamageReaction(target, dealt);
      damageByTarget[target.id] = damage;
      targetIds.push(target.id);
    }
  }

  const stoneEvents = [];
  if (immobile && target.hp > 0) {
    const retaliation = getDisplacementRetaliation(target);
    if (retaliation > 0) {
      const dealt = Math.min(actor.hp, retaliation);
      actor.hp = Math.max(0, actor.hp - retaliation);
      if (dealt > 0) stoneEvents.push({ type: "STONE_RETALIATION", offenderId: actor.id, sourceId: target.id, damage: dealt });
    }
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    from, to: { ...destination }, damage, hit: true, rolled: grabsEnemy, critical: Boolean(swing?.critical && !ignoresCriticalDamage(target)),
    displaced: !immobile, targetIds, damageByTarget, mpCost: cost
  }, ...stoneEvents]);
}

// Rocket Punch: a fixed-power physical strike on the first ENEMY on a straight ray within
// range (an ally on the ray blocks the shot, so the plan is never legal). It rolls to-hit
// like any attacking ART — a miss deals no damage AND rolls no stun (the whole punch
// whiffs), though the ART is still spent. On a landing hit Defense reduces it and Defend
// halves it (a crit scales ×1.5 first), then a SEPARATE 30% roll stuns a survivor 1 turn.
function resolveRocketPunch(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const line = getLineTargets(state, actorState, art.targeting.range, { includeAllies: false });
  const hit = line.find((entry) => entry.unit.id === command.targetId);
  if (!hit) return reject(ERR.INVALID_TARGET);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, targetIds: [], damageByTarget: {}, stunned: false, mpCost: cost
    }]);
  }

  const result = resolveDamage({
    attacker: { strength: art.damage.amount },
    defender: { ...getEffectiveStats(target, next), defending: isDefending(target) },
    type: "physical",
    critical: swing.critical
  });
  // Rock Hard (Clod): a defending Clod negates this physical hit entirely.
  const damage = negatesPhysicalWhileDefending(target) ? 0 : result.damage;
  target.hp = Math.max(0, target.hp - damage);
  const rockHardEvents = applyRockHardDefense(next, target, true);

  let effect = null;
  if (target.hp > 0) {
    const roll = drawValue(next.rngState, command.effectRoll);
    next.rngState = roll.rngState;
    // Stone Body reflects the stun back onto the Juggernaut (applyRolledStatus).
    effect = applyRolledStatus(target, art.effect, roll.value, actor, getGlobalStatusChanceMultiplier(next));
  }

  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    targetIds: [target.id], damageByTarget: { [target.id]: damage },
    hit: true, critical: swing.critical, stunned: Boolean(effect?.applied && !effect.reflected), mpCost: cost
  }, ...rockHardEvents]);
}

function knockbackDestination(state, target, direction, distance) {
  let destination = { ...target.position };
  for (let step = 1; step <= distance; step += 1) {
    const next = { x: target.position.x + direction.x * step, y: target.position.y + direction.y * step };
    if (next.x < 0 || next.y < 0 || next.x >= state.size || next.y >= state.size) break;
    if (isWallAt(state, next) || unitAt(state, next)) break;
    destination = next;
  }
  return destination;
}

function resolveFrontKick(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areEnemies(actorState, targetState)) return reject(ERR.INVALID_TARGET);
  if (chebyshevDistance(actorState.position, targetState.position) > getArtTargetRange(state, actorState, art)) {
    return reject(ERR.TARGET_OUT_OF_RANGE);
  }
  if (isWallBetween(state, actorState.position, targetState.position, actorState) ||
      isShotBlocked(state, actorState.position, targetState.position, actorState)) {
    return reject(ERR.TARGET_OBSTRUCTED);
  }

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll });
  next.rngState = swing.rngState;
  if (swing.missed) {
    spendAndAdvance(next, actor);
    resolveVictory(next);
    return accept(next, [{
      type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
      hit: false, missed: true, roll: swing.hitRoll, targetIds: [], damageByTarget: {}, knockedBack: false, mpCost: cost
    }]);
  }

  const actorStats = getEffectiveStats(actor, next);
  const scaleStat = art.damage.scaleStat;
  const baseStat = art.damage.baseStat ?? actorStats[scaleStat];
  const power = (art.damage.amount ?? 10) + Math.max(0, actorStats[scaleStat] - baseStat);
  const result = resolveDamage({
    attacker: { strength: power },
    defender: { ...getEffectiveStats(target, next), defending: isDefending(target) },
    type: "physical",
    critical: swing.critical
  });
  // Rock Hard (Clod): a defending Clod negates the kick's damage (the knockback below
  // is still governed by displacement rules, which Clod does not resist).
  const damage = negatesPhysicalWhileDefending(target) ? 0 : result.damage;
  const damageDealt = Math.min(target.hp, damage);
  target.hp = Math.max(0, target.hp - damage);
  const rockHardEvents = applyRockHardDefense(next, target, true);

  const direction = {
    x: Math.sign(targetState.position.x - actorState.position.x),
    y: Math.sign(targetState.position.y - actorState.position.y)
  };
  const shouldKnockback = target.hp > 0 && (swing.critical || getRageEffectValue(actor, "frontKickAlwaysKnockback", false));
  // Stone Body: a displacement-immune target (Gargoyle) is never knocked back — the kick
  // still deals its damage, but the recoil TRUE damage lands on the kicker instead.
  const immobile = resistsDisplacement(target);
  const stoneEvents = [];
  const from = { ...target.position };
  let to = { ...target.position };
  if (shouldKnockback && (direction.x !== 0 || direction.y !== 0)) {
    if (immobile) {
      const retaliation = getDisplacementRetaliation(target);
      if (retaliation > 0) {
        const dealt = Math.min(actor.hp, retaliation);
        actor.hp = Math.max(0, actor.hp - retaliation);
        if (dealt > 0) stoneEvents.push({ type: "STONE_RETALIATION", offenderId: actor.id, sourceId: target.id, damage: dealt });
      }
    } else {
      to = knockbackDestination(next, target, direction, art.knockback?.distance ?? 3);
      target.position = { ...to };
    }
  }

  const healingEvents = resolvePhysicalDamageHealing(next, actor, damageDealt);
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    targetIds: [target.id], damageByTarget: { [target.id]: damage },
    hit: true, critical: swing.critical, damage: { ...result, damage },
    knockedBack: shouldKnockback && (from.x !== to.x || from.y !== to.y),
    from, to, mpCost: cost
  }, ...healingEvents, ...stoneEvents, ...rockHardEvents]);
}

function resolveProtect(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const targetState = findUnit(state, command.targetId);
  if (!targetState || targetState.hp <= 0 || !areAllies(actorState, targetState) || targetState.id === actorState.id) {
    return reject(ERR.INVALID_TARGET);
  }
  const landing = [...getProtectLandingTiles(state, actorState, targetState, art)][0];
  if (!landing) return reject(ERR.INVALID_TARGET);
  const [x, y] = landing.split(",").map(Number);
  const destination = { x, y };

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const from = { ...actor.position };
  const cost = getArtMpCost(actor, art, next);
  actor.position = destination;
  actor.defending = true;
  target.defending = true;
  actor.mp -= cost;

  let healed = 0;
  const healAmount = Number(getRageEffectValue(actor, "protectHeal", 0)) || 0;
  if (healAmount > 0 && !isHealingDisabled(next)) {
    const before = target.hp;
    target.hp = Math.min(getEffectiveStats(target, next).maxHp, target.hp + healAmount + getGlobalHealBonus(next) + getCommandHealBonus(next, actor));
    healed = target.hp - before;
  }

  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    from, to: { ...destination }, defended: [actor.id, target.id],
    healingByTarget: healed > 0 ? { [target.id]: healed } : {},
    mpCost: cost
  }]);
}

// Recharge: vent the reactor. Restore MP up to full; if already at full MP, mend 1 HP
// instead — the mend is a heal, so a board-wide healing lockout (a raging Juggernaut's
// own Null Zone) shuts it off. Spends the activation like any ART.
function resolveRecharge(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const stats = getEffectiveStats(actor, next);
  let mpRestored = 0;
  let hpHealed = 0;
  if (actor.mp < stats.maxMp) {
    const before = actor.mp;
    actor.mp = Math.min(stats.maxMp, actor.mp + (art.restore?.mp ?? 0));
    mpRestored = actor.mp - before;
  } else if (!isHealingDisabled(next)) {
    const before = actor.hp;
    actor.hp = Math.min(stats.maxHp, actor.hp + (art.restore?.hpIfFull ?? 0));
    hpHealed = actor.hp - before;
  }
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, mpRestored, hpHealed, mpCost: getArtMpCost(actor, art, next)
  }]);
}

// Self Destruct (RAGE): overload the core for 10 TRUE damage to every enemy within the
// blast radius — ignoring DEF, Defend, and team reduction — at the cost of the
// Juggernaut's own life. Reuses the nukeAura targeting/preview; the caster is set to 0 HP.
function resolveSelfDestruct(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const radius = getSelfBlastRadius(next, actor, art);
  const damageByTarget = {};
  const targetIds = [];
  for (const target of livingUnits(next)) {
    if (!areEnemies(actor, target)) continue;
    if (chebyshevDistance(actor.position, target.position) > radius) continue;
    const dealt = Math.min(target.hp, art.damage.amount);
    target.hp = Math.max(0, target.hp - art.damage.amount);
    targetIds.push(target.id);
    damageByTarget[target.id] = dealt;
  }
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;
  actor.hp = 0; // the core is spent — the Juggernaut is consumed
  spendAndAdvance(next, actor);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetIds, damageByTarget,
    selfDestruct: true, mpCost: cost
  }]);
}

// A King command (Strike/Hold/Pursue/Higher Ground): record which command is now active
// (and remember the one it replaced — Strike reads it for its Pursue bonus), stamp the
// turn it was issued on, and spend the activation. The actual team buff is folded live by
// getEffectiveStats/getCommandHealBonus/getCommandRangeBonus off this stored command, so
// nothing about the buff's magnitude is baked here — it tracks the board until the turn ends.
function resolveKingCommand(state, command, art) {
  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  actor.previousCommand = actor.command ?? null;
  actor.command = art.command.id;
  actor.commandTurn = next.turnNumber;
  const cost = getArtMpCost(actor, art, next); // 0 — commands are free
  actor.mp -= cost;
  spendAndAdvance(next, actor);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, command: art.command.id, mpCost: 0
  }]);
}

function finishActivation(state, command) {
  const result = validateOpenActivation(state, command.player, command.unitId);
  if (result.error) return reject(result.error);
  if (!state.activation.primaryUsed) return reject(ERR.FINISH_REQUIRES_ACTION);
  const next = cloneState(state);
  const unit = findUnit(next, command.unitId);
  spendAndAdvance(next, unit);
  return accept(next, [{ type: "ACTIVATION_FINISHED", unitId: unit.id }]);
}

function resolvePhysicalDamageHealing(state, actor, damageDealt) {
  const effect = getUnitType(actor.type).passive?.effect;
  if (effect?.type !== "physicalDamageHealAura" || damageDealt <= 0) return [];
  if (isHealingDisabled(state)) return []; // a raging Juggernaut's Null Zone shuts it off
  const base = effect.rounding === "floor"
    ? Math.floor(damageDealt * effect.fraction)
    : Math.round(damageDealt * effect.fraction);
  if (base <= 0) return [];
  // Rain Stance's global heal bonus lifts this heal too ("all HP healing globally").
  const amount = base + getGlobalHealBonus(state) + getCommandHealBonus(state, actor);

  const healingByTarget = {};
  for (const target of livingTeamUnits(state, actor)) {
    if (target.id === actor.id) continue;
    if (chebyshevDistance(actor.position, target.position) > effect.radius) continue;
    const before = target.hp;
    target.hp = Math.min(getEffectiveStats(target, state).maxHp, target.hp + amount);
    const healed = target.hp - before;
    if (healed > 0) healingByTarget[target.id] = healed;
  }

  return Object.keys(healingByTarget).length
    ? [{ type: "HAND_OF_LIFE", actorId: actor.id, healingByTarget }]
    : [];
}

function applyStanceAttackTriggers(state, actor) {
  const trigger = getStanceEffect(actor)?.onAttack;
  if (!trigger) return [];
  const events = [];

  if (Number.isFinite(trigger.hasteMove) && trigger.hasteMove > 0) {
    actor.rainCharged = Math.max(actor.rainCharged ?? 0, trigger.hasteMove);
    events.push({ type: "STANCE_HASTE_CHARGED", unitId: actor.id, amount: trigger.hasteMove });
  }

  if (Number.isFinite(trigger.allyMp) && trigger.allyMp > 0) {
    const restoredByTarget = {};
    for (const ally of alliesInRadius(state, actor, trigger.allyMpRadius)) {
      const before = ally.mp;
      ally.mp = Math.min(getEffectiveStats(ally, state).maxMp, ally.mp + trigger.allyMp);
      const restored = ally.mp - before;
      if (restored > 0) restoredByTarget[ally.id] = restored;
    }
    if (Object.keys(restoredByTarget).length) {
      events.push({ type: "STANCE_MP_RESTORED", unitId: actor.id, restoredByTarget });
    }
  }

  return events;
}

function spendAndAdvance(state, unit) {
  unit.statuses = tickStatuses(unit.statuses);
  unit.spent = true;

  const spellUsed = state.activation?.spellUsed ?? false;
  const realmTraversalActive = state.activation?.unitId === unit.id && state.activation?.realmTraversalActive;
  const passive = getUnitType(unit.type)?.passive;
  if (passive?.effect?.type === "mpRegen") {
    if (spellUsed) {
      unit.mageChargeCount = 0;
    } else {
      unit.mageChargeCount = (unit.mageChargeCount ?? 0) + 1;
      if (unit.mageChargeCount >= passive.effect.interval) {
        const maxMp = getEffectiveStats(unit, state).maxMp;
        unit.mp = Math.min(maxMp, unit.mp + passive.effect.amount);
        unit.mageChargeCount = 0;
      }
    }
  }

  if (realmTraversalActive) unit.realmTraversalLocked = false;
  state.activation = null;
  advanceTurnIfExhausted(state);
}

function appendPendingRolloverEvents(state, events) {
  if (!events.length) return;
  state.pendingRolloverEvents = [...(state.pendingRolloverEvents ?? []), ...events];
}

function autoSpendStunnedUnits(state, player) {
  const events = [];
  for (const member of livingUnits(state, player)) {
    if (!takesTurns(member) || member.spent || !isStunned(member)) continue;

    member.defending = false;
    member.statuses = tickStatuses(member.statuses);
    member.spent = true;
    events.push({ type: "UNIT_STUNNED", unitId: member.id });
  }
  if (events.length) resolveVictory(state);
  return events;
}

function applySquadTurnChargeStatuses(state, player) {
  const events = [];
  for (const member of livingUnits(state, player)) {
    events.push(...resolveTurnStartStatuses(member));
  }
  if (events.length) resolveVictory(state);
  return events;
}

function releaseStunLoopGuard(state) {
  const unitIds = [];
  for (const member of livingUnits(state, state.currentPlayer)) {
    if (!takesTurns(member)) continue;
    member.statuses = (member.statuses ?? []).filter((status) => status.type !== "stun");
    member.spent = false;
    unitIds.push(member.id);
  }
  if (unitIds.length) {
    appendPendingRolloverEvents(state, [{
      type: "STUN_LOOP_GUARD",
      player: state.currentPlayer,
      unitIds
    }]);
  }
}

function playerHasUnspentUnits(state, player) {
  return livingUnits(state, player).some((member) => takesTurns(member) && !member.spent);
}

function playerHasLivingTurnUnits(state, player) {
  return livingUnits(state, player).some(takesTurns);
}

function nextActivePlayer(state, fromPlayer) {
  const order = state.turnOrder?.length ? state.turnOrder : [1, 2];
  const start = Math.max(0, order.indexOf(fromPlayer));
  for (let step = 1; step <= order.length; step += 1) {
    const player = order[(start + step) % order.length];
    if (playerHasLivingTurnUnits(state, player)) return player;
  }
  return fromPlayer;
}

// Pass the turn to the other player once the current one has no unspent living
// commander left. Summons never take turns, so they neither keep the turn open nor
// get their spent flag reset.
function advanceTurnIfExhausted(state) {
  if (state.phase !== "playing") return;
  let rollovers = 0;
  while (
    state.phase === "playing" &&
    !livingUnits(state, state.currentPlayer).some((member) => takesTurns(member) && !member.spent)
  ) {
    if (rollovers >= MAX_STUN_FAST_FORWARD_ROLLOVERS) {
      releaseStunLoopGuard(state);
      break;
    }
    state.currentPlayer = nextActivePlayer(state, state.currentPlayer);
    state.turnNumber += 1;
    rollovers += 1;
    for (const member of livingUnits(state, state.currentPlayer)) if (takesTurns(member)) member.spent = false;
    appendPendingRolloverEvents(state, applySquadTurnChargeStatuses(state, state.currentPlayer));
    // Board hazards resolve at the rollover, after the turn flips: fire burns whoever
    // stands on it and counts down. A burn can be lethal, so re-check victory. Burn
    // events are stashed on the state for accept() to surface (presentation only).
    const fireEvents = [];
    applyFireTick(state, fireEvents);
    // Black Death Stance burns EVERY living unit (allies and foes, the Witch Doctor
    // included) for 1 true damage at the same rollover. Lethal, so re-check victory.
    applyBlackDeathTick(state, fireEvents);
    // Father Time's Time Steal: each living Father Time drains nearby enemies and is
    // refunded MP for it, at the same rollover. Also lethal.
    applyTimeStealTick(state, fireEvents);
    resolveVictory(state);
    appendPendingRolloverEvents(state, fireEvents);
    appendPendingRolloverEvents(state, autoSpendStunnedUnits(state, state.currentPlayer));
  }
}

const FIRE_DAMAGE = 1;

// Throw Cigar fire: at every turn rollover, any unit (friend OR foe) standing on a
// fire tile takes 1 TRUE damage — it ignores DEF and Defend, so this subtracts HP
// directly. The fire then counts down and is removed once its turns run out. Board
// level, so it lives beside the rollover rather than in the per-unit status tick.
// Pushes a FIRE_DAMAGE event per burn so the view can voice + float it.
function applyFireTick(state, events) {
  for (const [key, obj] of Object.entries(state.tileObjects ?? {})) {
    if (obj.kind !== "fire") continue;
    const [x, y] = key.split(",").map(Number);
    const occupant = unitAt(state, { x, y });
    if (occupant && !isFireDamageImmune(occupant)) {
      const dealt = Math.min(occupant.hp, FIRE_DAMAGE);
      occupant.hp = Math.max(0, occupant.hp - FIRE_DAMAGE);
      if (dealt > 0) events.push({ type: "FIRE_DAMAGE", unitId: occupant.id, position: { x, y }, damage: dealt });
    }
    if (obj.permanent) continue;
    obj.turnsLeft -= 1;
    if (obj.turnsLeft <= 0) delete state.tileObjects[key];
  }
}

// Black Death Stance (Witch Doctor): while any living unit holds the stance, every
// living unit on the board — allies, foes, and the Witch Doctor himself — takes 1
// TRUE damage at each turn rollover. Board-level like the fire tick, and lethal, so
// the caller re-resolves victory after.
function applyBlackDeathTick(state, events) {
  const amount = getGlobalTrueTick(state);
  if (amount <= 0) return;
  for (const unit of livingUnits(state)) {
    const dealt = Math.min(unit.hp, amount);
    unit.hp = Math.max(0, unit.hp - amount);
    if (dealt > 0) events.push({ type: "BLACK_DEATH_DAMAGE", unitId: unit.id, damage: dealt });
  }
}

// Father Time's Time Steal (a `damageAura` passive): at every rollover, each living
// source deals its aura damage (true) to every enemy within its Chebyshev radius, then
// is refunded MP for the TOTAL damage it dealt (refundMpPerDamage per point). Board-
// level like the fire/black-death ticks, and lethal, so the caller re-resolves victory.
function applyTimeStealTick(state, events) {
  for (const source of livingUnits(state)) {
    const effect = getUnitType(source.type).passive?.effect;
    if (effect?.type !== "damageAura") continue;
    const radius = effect.radius ?? 2;
    const amount = effect.amount ?? 1;
    let totalDealt = 0;
    for (const target of livingUnits(state)) {
      if (!areEnemies(source, target)) continue;
      if (chebyshevDistance(source.position, target.position) > radius) continue;
      const dealt = Math.min(target.hp, amount);
      if (dealt <= 0) continue;
      target.hp = Math.max(0, target.hp - amount);
      totalDealt += dealt;
      events.push({ type: "TIME_STEAL", sourceId: source.id, targetId: target.id, position: { ...target.position }, damage: dealt });
    }
    if (totalDealt > 0 && effect.refundMpPerDamage) {
      const before = source.mp;
      source.mp = Math.min(getEffectiveStats(source, state).maxMp, source.mp + totalDealt * effect.refundMpPerDamage);
      const gained = source.mp - before;
      if (gained > 0) events.push({ type: "TIME_STEAL_MP", sourceId: source.id, mpGained: gained });
    }
  }
}

// A player resigns. Their living units all drop out, then victory is re-resolved
// (in a 1v1 this always completes the match for the opponent). Written
// player-generically so it carries forward to FFA/teams: if the match continues and
// the conceding player was on the clock, the turn passes on. Summons follow their
// commander out, so a forfeit can't leave a lone Ghoul stalling the board.
function concede(state, command) {
  if (!Number.isInteger(command.player) || command.player < 1) return reject(ERR.INVALID_COMMAND);
  const next = cloneState(state);
  const events = [];
  for (const unit of next.units) {
    if (unit.player === command.player && unit.hp > 0) {
      unit.hp = 0;
      events.push({ type: "UNIT_DEFEATED", unitId: unit.id });
    }
  }
  events.push({ type: "PLAYER_CONCEDED", player: command.player });
  next.activation = null;
  resolveVictory(next);
  if (next.phase === "playing" && next.currentPlayer === command.player) {
    next.currentPlayer = nextActivePlayer(next, command.player);
    next.turnNumber += 1;
    for (const member of livingUnits(next, next.currentPlayer)) if (takesTurns(member)) member.spent = false;
  }
  return accept(next, events);
}

function resolveVictory(state) {
  // Defeat is decided by living units that can actually WIN, not raw bodies: a player
  // whose only survivor is a turn-less summon (a lone Ghoul) or a non-combatant commander
  // (a lone King) has lost and cannot stall — see unitCatalog.sustainsVictory.
  const livingTeams = new Set(livingUnits(state).filter(sustainsVictory).map(teamOfUnit));
  if (livingTeams.size === 1) {
    state.winner = [...livingTeams][0];
    state.phase = "complete";
    state.activation = null;
  }
}

// The King's Dictator/Spectator passive, applied centrally after every command. Diffs the
// pre-command state against the result: for each of the King's squadmates that newly FELL,
// the King loses `damagePerAllyFallen` and the rest of the squad rallies for `allyRallyHeal`
// (the King excluded); for each fallen ally REVIVED (Father Time's Rewind), the King regains
// `healPerAllyRevived`. Reactions are driven by Kings that were ALIVE when the falls happened
// (the pre-command snapshot), so a King finished off by the same blast still mourns his squad.
// Summons and other Kings don't count as "an allied unit"; a global healing lockout (a raging
// Juggernaut's Null Zone) suppresses the King's HP gains but never the damage.
function applyCommanderReactions(prevState, next, events) {
  const reactingKings = prevState.units.filter((u) => u.hp > 0 && isCommandOnly(u));
  if (!reactingKings.length) return;

  const wasAlive = new Map(prevState.units.map((u) => [u.id, u.hp > 0]));
  const isAlly = (unit) => takesTurns(unit) && !isCommandOnly(unit); // a real squad unit
  const fell = [];
  const revived = [];
  for (const unit of next.units) {
    if (!isAlly(unit) || !wasAlive.has(unit.id)) continue;
    const before = wasAlive.get(unit.id);
    if (before && unit.hp <= 0) fell.push(unit);
    else if (!before && unit.hp > 0) revived.push(unit);
  }
  if (!fell.length && !revived.length) return;

  const healingOff = isHealingDisabled(next);
  for (const kingBefore of reactingKings) {
    const king = findUnit(next, kingBefore.id);
    if (!king) continue;
    const effect = getUnitType(king.type).passive?.effect;
    const teamFell = fell.filter((u) => areAllies(u, king));
    const teamRevived = revived.filter((u) => areAllies(u, king));

    if (teamFell.length && effect?.damagePerAllyFallen) {
      const total = effect.damagePerAllyFallen * teamFell.length;
      const dealt = Math.min(king.hp, total);
      king.hp = Math.max(0, king.hp - total);
      if (dealt > 0) events.push({ type: "KING_MOURNS", kingId: king.id, damage: dealt, fallen: teamFell.map((u) => u.id) });
    }
    if (teamRevived.length && effect?.healPerAllyRevived && !healingOff) {
      const before = king.hp;
      king.hp = Math.min(getEffectiveStats(king, next).maxHp, king.hp + effect.healPerAllyRevived * teamRevived.length);
      const healed = king.hp - before;
      if (healed > 0) events.push({ type: "KING_RESTORED", kingId: king.id, healing: healed });
    }
  }

  // Rally: once per team that had a living King, heal the rest of that squad (Kings and
  // summons excluded) by allyRallyHeal for every ally that fell. Not a "heal ART", so
  // Hold's heal bonus doesn't touch it — it's the passive's own flat number.
  if (!healingOff) {
    const teamsWithKing = new Map(); // team -> allyRallyHeal
    for (const king of reactingKings) {
      const rally = getUnitType(king.type).passive?.effect?.allyRallyHeal ?? 0;
      const team = teamOfUnit(king);
      teamsWithKing.set(team, Math.max(teamsWithKing.get(team) ?? 0, rally));
    }
    for (const [team, rally] of teamsWithKing) {
      const falls = fell.filter((u) => teamOfUnit(u) === team).length;
      if (!falls || rally <= 0) continue;
      const rallied = [];
      for (const ally of next.units) {
        if (ally.hp <= 0 || teamOfUnit(ally) !== team || !isAlly(ally)) continue;
        const before = ally.hp;
        ally.hp = Math.min(getEffectiveStats(ally, next).maxHp, ally.hp + rally * falls);
        if (ally.hp > before) rallied.push(ally.id);
      }
      if (rallied.length) events.push({ type: "SQUAD_RALLY", team, healing: rally * falls, rallied });
    }
  }

  // A King finished off by his own mourning doesn't change victory (he never sustained
  // it), but re-resolve so a rally that outlives the last fighter can't be missed.
  resolveVictory(next);
}
