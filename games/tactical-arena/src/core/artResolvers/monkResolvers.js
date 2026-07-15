import { getArtMpCost, getCommandHealBonus, getEffectiveStats, getRageEffectValue, isDefending } from "../unitCatalog.js";
import { areEnemies, areAllies, cloneState, findUnit, isWallAt, unitAt } from "../state.js";
import { getArtTargetRange, getProtectLandingTiles } from "../../rules/arts.js";
import { getDisplacementRetaliation, isShotBlocked, isWallBetween, negatesPhysicalWhileDefending, resistsDisplacement, rollToHit } from "../../rules/combat.js";
import { resolveDamage } from "../../rules/damage.js";
import { chebyshevDistance } from "../../rules/movement.js";
import { getGlobalHealBonus } from "../../rules/stances.js";
import { applyRockHardDefense, resolvePhysicalDamageHealing, restoreHp } from "../combatEffects.js";
import { completeArtUse } from "./artCompletion.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory } from "../turnEngine.js";

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

export function resolveFrontKick(state, command, art) {
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

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, { target, state: next, accuracy: art.accuracy });
  next.rngState = swing.rngState;
  if (swing.missed) {
    completeArtUse(next, actor, art);
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
  completeArtUse(next, actor, art);
  resolveVictory(next);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    targetIds: [target.id], damageByTarget: { [target.id]: damage },
    hit: true, critical: swing.critical, damage: { ...result, damage },
    knockedBack: shouldKnockback && (from.x !== to.x || from.y !== to.y),
    from, to, mpCost: cost
  }, ...healingEvents, ...stoneEvents, ...rockHardEvents]);
}

export function resolveProtect(state, command, art) {
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
  let mpRestored = 0;
  const healAmount = Number(getRageEffectValue(actor, "protectHeal", 0)) || 0;
  if (healAmount > 0) {
    const restored = restoreHp(next, actor, target, healAmount + getGlobalHealBonus(next) + getCommandHealBonus(next, actor));
    healed = restored.hpRestored;
    mpRestored = restored.mpRestored;
  }

  completeArtUse(next, actor, art);
  return accept(next, [{
    type: "ART_RESOLVED", artId: art.id, actorId: actor.id, targetId: target.id,
    from, to: { ...destination }, defended: [actor.id, target.id],
    healingByTarget: healed > 0 ? { [target.id]: healed } : {},
    restoredByTarget: mpRestored > 0 ? { [target.id]: mpRestored } : {},
    mpCost: cost
  }]);
}
