import {
  getEffectiveStats,
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
import { applyStatus } from "../rules/statuses.js";
import { resolveVictory } from "./turnEngine.js";

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
  applyNemesisThresholdReactions(prevState, next, events, hooks);
  applyOneShotRageTransitions(prevState, next, events);
  applyRageEntryEffects(prevState, next, events, hooks);
  applyCommanderReactions(prevState, next, events);
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
  const isAlly = (unit) => takesTurns(unit) && !isCommandOnly(unit);
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
        ally.hp = Math.min(getEffectiveStats(ally, next).maxHp, ally.hp + rally * falls);
        if (ally.hp > before) rallied.push(ally.id);
      }
      if (rallied.length) events.push({ type: "SQUAD_RALLY", team, healing: rally * falls, rallied });
    }
  }

  resolveVictory(next);
}
