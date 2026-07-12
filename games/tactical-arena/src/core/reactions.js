import {
  getRageEffectValue,
  getStatusSpreadConfig,
  getUnitType,
  isCommandOnly,
  isRaging,
  takesTurns
} from "./unitCatalog.js";
import { areAllies, areEnemies, findUnit, teamOfUnit } from "./state.js";
import { chebyshevDistance } from "../rules/movement.js";
import { isHealingDisabled } from "../rules/combat.js";
import { restoreHp, restoreMp } from "./combatEffects.js";
import { applyStatus, isNegativeStatus } from "../rules/statuses.js";
import { resolveVictory } from "./turnEngine.js";

// --- Treant reaction helpers ------------------------------------------------
// The Verdant Bond buff-share config (radius) for a unit that carries the passive, or null.
function buffShareConfig(unit) {
  const definition = getUnitType(unit.type);
  for (const source of [definition.passive, ...definition.arts]) {
    if (source?.effect?.type === "buffShare") return { radius: Math.max(0, Number(source.effect.radius) || 0) };
  }
  return null;
}

// The Ether config (the stat block banked on MP recovery) for a unit, or null.
function mpRecoveryBuffConfig(unit) {
  const definition = getUnitType(unit.type);
  for (const source of [definition.passive, ...definition.arts]) {
    if (source?.effect?.type === "mpRecoveryBuff") return source.effect.stats ?? {};
  }
  return null;
}

// A stat buff worth sharing: a non-negative status carrying at least one positive stat mod
// (empowered, etc.). Negative statuses (slow, etc.) and pure markers never share.
function isShareableBuff(status) {
  if (isNegativeStatus(status) || !status?.statModifiers) return false;
  return Object.values(status.statModifiers).some((value) => Number(value) > 0);
}

function oneShotRageEffect(unit) {
  const definition = getUnitType(unit.type);
  return [definition.ragePassive, definition.rageArt]
    .map((source) => source?.effect)
    .find((effect) => effect?.type === "oneShotStatModifiers") ?? null;
}

export function syncOneShotRageArm(unit) {
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

export function consumeOneShotRage(unit) {
  const effect = activeOneShotRageEffect(unit);
  if (!effect) return [];
  unit.desperationShotSpent = true;
  if (effect.skipNextActivation) unit.skipNextActivation = true;
  return [{ type: "DESPERATION_SHOT", unitId: unit.id }];
}

export function applyPostCommandReactions(prevState, next, events, hooks) {
  applySpreadReactions(prevState, next, events);
  applyBuffShareReactions(prevState, next, events);
  applyEtherReactions(prevState, next, events);
  applyNemesisThresholdReactions(prevState, next, events, hooks);
  applyOneShotRageTransitions(prevState, next, events);
  applyRageEntryEffects(prevState, next, events, hooks);
  applyCommanderReactions(prevState, next, events);
}

// Verdant Bond (Treant): a positive stat-buff STATUS newly landed on an ally within a
// Treant's radius also lands on the Treant. Diff-based, one hop (a buff the Treant just
// picked up is not itself re-shared), mirroring applySpreadReactions.
function applyBuffShareReactions(prevState, next, events) {
  if (next.phase !== "playing") return;
  const treants = next.units
    .map((unit) => ({ unit, config: unit.hp > 0 ? buffShareConfig(unit) : null }))
    .filter((entry) => entry.config);
  if (!treants.length) return;

  const before = new Map(prevState.units.map((unit) =>
    [unit.id, new Set((unit.statuses ?? []).map((status) => status.type))]));

  const newlyBuffed = [];
  for (const unit of next.units) {
    if (unit.hp <= 0) continue;
    const had = before.get(unit.id) ?? new Set();
    for (const status of unit.statuses ?? []) {
      if (!had.has(status.type) && isShareableBuff(status)) newlyBuffed.push({ unit, status });
    }
  }

  for (const { unit, status } of newlyBuffed) {
    for (const { unit: treant, config } of treants) {
      if (treant.id === unit.id || treant.hp <= 0 || !areAllies(treant, unit)) continue;
      if (chebyshevDistance(treant.position, unit.position) > config.radius) continue;
      const applied = applyStatus(treant, { ...status, ignoreResistance: true });
      if (applied.applied) {
        treant.statuses = applied.statuses;
        events.push({ type: "BUFF_SHARED", sourceUnitId: unit.id, treantId: treant.id, status: status.type });
      }
    }
  }
}

// Ether (Treant): whenever the Treant's MP goes UP as a result of a command, bank his
// mpRecoveryBuff stat block onto `etherCharged`; beginActivation applies it as a one-turn
// empowered buff at his next turn (the Rain-haste pattern). Diff-based against the input MP.
function applyEtherReactions(prevState, next, events) {
  if (next.phase !== "playing") return;
  const beforeMp = new Map(prevState.units.map((unit) => [unit.id, unit.mp]));
  for (const unit of next.units) {
    if (unit.hp <= 0) continue;
    const stats = mpRecoveryBuffConfig(unit);
    if (!stats) continue;
    const prev = beforeMp.get(unit.id);
    if (!Number.isFinite(prev) || unit.mp <= prev) continue;
    unit.etherCharged = { ...stats };
    events.push({ type: "ETHER_CHARGED", unitId: unit.id });
  }
}

function nemesisThresholdBand(hp) {
  if (hp <= 0) return 0;
  let crossed = 0;
  for (const threshold of [20, 15, 10, 5]) {
    if (hp < threshold) crossed += 1;
  }
  return crossed;
}

function applyNemesisThresholdReactions(prevState, next, events, hooks) {
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
        hooks.resolveNemesisAutoPulse(next, unit, events, { trigger: "missingHpThreshold" });
      }
    }
    previousBand = beforeWave;
  }
}

function hasRageEntryEffect(unit) {
  const definition = getUnitType(unit.type);
  const effects = [definition.ragePassive, definition.rageArt].map((source) => source?.effect);
  return Boolean(
    effects.some((effect) => effect?.type === "rageEntryRestore" || effect?.rageEntryRestore) ||
    getRageEffectValue(unit, "freePyroclasm", null)
  );
}

function applyRageEntryEffects(prevState, next, events, hooks) {
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
        .map((effect) => effect?.type === "rageEntryRestore" ? effect : effect?.rageEntryRestore)
        .find(Boolean);
      if (restore) {
        const beforeHp = unit.hp;
        const beforeMp = unit.mp;
        restoreHp(next, unit, unit, restore.hp ?? 0);
        restoreMp(next, unit, unit, restore.mp ?? 0);
        events.push({
          type: "RAGE_REGENERATE",
          unitId: unit.id,
          hpRestored: unit.hp - beforeHp,
          mpRestored: unit.mp - beforeMp
        });
      }

      const freeCast = getRageEffectValue(unit, "freePyroclasm", null);
      if (!freeCast) continue;
      hooks.resolveVolcanicPyroclasmTick(next, unit, freeCast, events, {
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

// Virus's Spread (statusSpread): a NEW debuff on an enemy of a living Virus propagates
// to that enemy's allies within the Virus's spread radius. Diff-based, one hop, no RNG.
function applySpreadReactions(prevState, next, events) {
  if (next.phase !== "playing") return;
  const spreaders = next.units
    .map((unit) => ({ unit, config: unit.hp > 0 ? getStatusSpreadConfig(unit) : null }))
    .filter((entry) => entry.config);
  if (!spreaders.length) return;

  const before = new Map(prevState.units.map((unit) =>
    [unit.id, new Set((unit.statuses ?? []).map((status) => status.type))]));

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

// The King's Dictator/Spectator passive, applied centrally after every command.
function applyCommanderReactions(prevState, next, events) {
  const reactingKings = prevState.units.filter((u) => u.hp > 0 && isCommandOnly(u));
  if (!reactingKings.length) return;

  const wasAlive = new Map(prevState.units.map((u) => [u.id, u.hp > 0]));
  const isAlly = (unit) => takesTurns(unit) && !unit.ghost && !isCommandOnly(unit);
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
      restoreHp(next, king, king, effect.healPerAllyRevived * teamRevived.length);
      const healed = king.hp - before;
      if (healed > 0) events.push({ type: "KING_RESTORED", kingId: king.id, healing: healed });
    }
  }

  if (!healingOff) {
    const teamsWithKing = new Map();
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
        restoreHp(next, ally, ally, rally * falls);
        if (ally.hp > before) rallied.push(ally.id);
      }
      if (rallied.length) events.push({ type: "SQUAD_RALLY", team, healing: rally * falls, rallied });
    }
  }

  resolveVictory(next);
}
