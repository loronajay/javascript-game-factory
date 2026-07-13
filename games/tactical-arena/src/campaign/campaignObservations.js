import { getArt } from "../core/unitCatalog.js";
import { findUnit } from "../core/state.js";
import { getBasicAttackDamageType, isFireBasedDamage } from "../rules/combat.js";

function nestedMatch(value, predicate) {
  if (!value || typeof value !== "object") return false;
  if (predicate(value)) return true;
  return Object.values(value).some((child) =>
    Array.isArray(child)
      ? child.some((entry) => nestedMatch(entry, predicate))
      : nestedMatch(child, predicate),
  );
}

export function artHasStatusEffect(value) {
  return nestedMatch(value, (entry) =>
    entry.effect?.type === "status" ||
    entry.type === "status" ||
    (typeof entry.status === "string" && entry.type !== "immunity"),
  );
}

export function artHasPoisonEffect(value) {
  return nestedMatch(value, (entry) =>
    entry.effect?.status === "poison" ||
    entry.globalStatus?.status === "poison" ||
    (entry.status === "poison" && entry.type !== "immunity"),
  );
}

export function artHasBlindEffect(value) {
  return nestedMatch(value, (entry) =>
    entry.effect?.status === "blind" ||
    entry.globalStatus?.status === "blind" ||
    (entry.status === "blind" && entry.type !== "immunity"),
  );
}

export function playerTriedStatusOnTargets(state, command, events = [], targetIds = ["p2-0-paladin"]) {
  if (command?.type !== "USE_ART" || command.player !== 1) return false;
  const actor = findUnit(state, command.unitId);
  const art = actor ? getArt(actor.type, command.artId) : null;
  if (!artHasStatusEffect(art)) return false;
  const targets = targetIds.filter((id) => findUnit(state, id));
  if (!targets.length) return false;
  if (targets.includes(command.targetId)) return true;
  if (!command.targetId && (art.selfCast || art.globalStatus || art.targeting?.shape === "selfAura")) return true;
  return events.some((event) =>
    event.type === "ART_RESOLVED" &&
    event.actorId === command.unitId &&
    targets.some((targetId) =>
      event.targetId === targetId ||
      (event.targetIds ?? []).includes(targetId) ||
      (event.statusTargets ?? []).includes(targetId) ||
      (event.blinded ?? []).includes(targetId)),
  );
}

export function playerTriedPoisonOnTarget(state, command, events = [], targetId) {
  if (command?.type !== "USE_ART" || command.player !== 1 || !targetId) return false;
  const actor = findUnit(state, command.unitId);
  const art = actor ? getArt(actor.type, command.artId) : null;
  if (!artHasPoisonEffect(art)) return false;
  if (command.targetId === targetId) return true;
  return events.some((event) =>
    event.type === "ART_RESOLVED" &&
    event.actorId === command.unitId &&
    (event.targetId === targetId ||
      (event.targetIds ?? []).includes(targetId) ||
      (event.statusTargets ?? []).includes(targetId)),
  );
}

export function playerTriedBlindOnEnemyMonk(state, command, events = []) {
  if (command?.type !== "USE_ART" || command.player !== 1) return false;
  const actor = findUnit(state, command.unitId);
  const art = actor ? getArt(actor.type, command.artId) : null;
  if (!artHasBlindEffect(art)) return false;
  if (command.targetId && findUnit(state, command.targetId)?.type === "monk") return true;
  const monks = state.units.filter((unit) => unit.player === 2 && unit.type === "monk" && unit.hp > 0);
  if (!monks.length) return false;
  if (!command.targetId && (art.selfCast || art.globalStatus || art.targeting?.shape === "selfAura")) return true;
  return events.some((event) =>
    event.type === "ART_RESOLVED" &&
    event.actorId === command.unitId &&
    monks.some((monk) =>
      event.targetId === monk.id ||
      (event.targetIds ?? []).includes(monk.id) ||
      (event.statusTargets ?? []).includes(monk.id) ||
      (event.blinded ?? []).includes(monk.id)),
  );
}

export function playerLandedEnemyStatus(state, events) {
  return events.some((event) => {
    const actor = findUnit(state, event.actorId);
    if (actor?.player !== 1) return false;
    const targetIds = [
      event.targetId,
      ...(event.targetIds ?? []),
      ...(event.statusTargets ?? []),
      ...(event.blinded ?? []),
    ].filter(Boolean);
    if (!targetIds.some((id) => findUnit(state, id)?.player === 2)) return false;
    return Boolean(event.effect?.applied || event.appliedStatus || event.statusTargets?.length || event.blinded?.length);
  });
}

export function numericDamage(value) {
  if (typeof value === "number") return Math.max(0, value);
  if (value && typeof value.damage === "number") return Math.max(0, value.damage);
  return 0;
}

export function eventTargetIds(event) {
  return [...new Set([
    event.targetId,
    ...(event.targetIds ?? []),
    ...Object.keys(event.damageByTarget ?? {}),
  ].filter(Boolean))];
}

export function eventDamageForTarget(event, targetId) {
  if (typeof event.damageByTarget?.[targetId] === "number") return Math.max(0, event.damageByTarget[targetId]);
  const targets = eventTargetIds(event);
  if (event.targetId === targetId || targets.length <= 1) return numericDamage(event.damage);
  return 0;
}

export function playerFireHitTarget(state, event, targetId) {
  if (event?.type !== "ART_RESOLVED" || !targetId) return false;
  const actor = findUnit(state, event.actorId);
  if (actor?.player !== 1) return false;
  const art = getArt(actor.type, event.artId);
  if (!isFireBasedDamage({ art })) return false;
  return eventTargetIds(event).some((id) => id === targetId && eventDamageForTarget(event, id) > 0);
}

export function countPlayerMagicDamageDealt(state, events) {
  let count = 0;
  for (const event of events) {
    if (event.type !== "ATTACK_RESOLVED" && event.type !== "ART_RESOLVED") continue;
    const actor = findUnit(state, event.actorId);
    if (actor?.player !== 1) continue;
    const damageType = event.type === "ART_RESOLVED"
      ? getArt(actor.type, event.artId)?.damageType
      : getBasicAttackDamageType(actor);
    if (damageType !== "magic") continue;
    for (const targetId of eventTargetIds(event)) {
      if (findUnit(state, targetId)?.player === 2 && eventDamageForTarget(event, targetId) > 0) count += 1;
    }
  }
  return count;
}
