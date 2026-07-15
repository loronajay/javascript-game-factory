import { getArtMpCost, getEffectiveStats, isDefending } from "../unitCatalog.js";
import { areEnemies, cloneState, findUnit } from "../state.js";
import { getLineTargets } from "../../rules/arts.js";
import { finalizeMagicDamage, getDisplacementRetaliation, ignoresCriticalDamage, negatesPhysicalWhileDefending, resistsDisplacement, rollToHit } from "../../rules/combat.js";
import { CRIT_MULTIPLIER, resolveDamage } from "../../rules/damage.js";
import { drawValue } from "../rng.js";
import { getGlobalStatusChanceMultiplier } from "../../rules/stances.js";
import { applyMagicDamageReaction, applyRockHardDefense, applyRolledStatus } from "../combatEffects.js";
import { accept, ERR, reject } from "../reducerResult.js";
import { resolveVictory, spendAndAdvance } from "../turnEngine.js";

export function resolveTetherGrab(state, command, art) {
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
    swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, { target, state: next, accuracy: art.accuracy });
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
    const rawDamage = finalizeMagicDamage({ attacker: actor, target, state: next, rawDamage: baseAmount, art });
    if (rawDamage > 0) {
      const dealt = Math.min(target.hp, rawDamage);
      target.hp = Math.max(0, target.hp - rawDamage);
      applyMagicDamageReaction(target, dealt);
      damage = dealt;
      damageByTarget[target.id] = dealt;
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
export function resolveRocketPunch(state, command, art) {
  const actorState = findUnit(state, command.unitId);
  const line = getLineTargets(state, actorState, art.targeting.range, { includeAllies: false });
  const hit = line.find((entry) => entry.unit.id === command.targetId);
  if (!hit) return reject(ERR.INVALID_TARGET);

  const next = cloneState(state);
  const actor = findUnit(next, command.unitId);
  const target = findUnit(next, command.targetId);
  const cost = getArtMpCost(actor, art, next);
  actor.mp -= cost;

  const swing = rollToHit(next.rngState, actor, { attackRoll: command.attackRoll, critRoll: command.critRoll }, { target, state: next, accuracy: art.accuracy });
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
    targetIds: [target.id], damageByTarget: { [target.id]: damage }, damage,
    hit: true, critical: swing.critical, stunned: Boolean(effect?.applied && !effect.reflected), mpCost: cost
  }, ...rockHardEvents]);
}
