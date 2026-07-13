import { findUnit } from "../core/state.js";
import { getConeCells } from "../rules/arts.js";
import { getBasicAttackDamageType } from "../rules/combat.js";
import { teamColor } from "../match/matchBuilder.js";
import { createBoardMetrics } from "./isometric.js";
import { unitCenter } from "./battleEventPresenter.js";
import {
  clumsySplashTargets,
  healingPresentationTargets,
  orderedHitTargets,
  shouldUseRangedAttackAnimation,
} from "./combatPresentation.js";

export function prepareRolledCombatPresentation(before, events = []) {
  const rolled = events.find((event) => (
    event.type === "ATTACK_RESOLVED" || event.type === "ART_RESOLVED"
  ) && "hit" in event);
  const attackerBefore = rolled ? findUnit(before, rolled.actorId) : null;
  const rolledTargetsBefore = rolled
    ? orderedHitTargets(rolled, (id) => findUnit(before, id))
    : [];
  const targetBefore = rolledTargetsBefore[0] ?? (rolled ? findUnit(before, rolled.targetId) : null);
  return { rolled, attackerBefore, rolledTargetsBefore, targetBefore };
}

export async function presentRolledCombat({
  before,
  result,
  events,
  rolled,
  attackerBefore,
  targetBefore,
  rolledTargetsBefore,
  effects,
  revealRoll,
  playAttackImpactSound,
  artDefinition,
}) {
  const metrics = createBoardMetrics(before.size);

  if (rolled?.artId === "surge" && attackerBefore && targetBefore) {
    const center = unitCenter(metrics, targetBefore);
    const healedTargetsBefore = healingPresentationTargets(rolled, (id) => findUnit(before, id));
    const splashTargetsBefore = clumsySplashTargets(rolled, (id) => findUnit(before, id), "healing");
    const targets = [...new Map([...healedTargetsBefore, ...splashTargetsBefore]
      .map((unit) => [unit.id, unit])).values()];

    await revealRoll({ missed: Boolean(rolled.missed), critical: Boolean(rolled.critical) }, null, attackerBefore);
    if (rolled.missed) await effects.floatText(center, "MISS", "#cbb78b");
    if (!rolled.missed || splashTargetsBefore.length) {
      await effects.playAbilityVfx("surge", {
        actor: attackerBefore,
        targets: targets.length ? targets : [targetBefore],
      });
    }

    const floats = [];
    if (splashTargetsBefore.length) floats.push(effects.floatText(center, "CLUMSY", "#d8c2f5"));
    for (const target of healedTargetsBefore) {
      const healed = rolled.healingByTarget?.[target.id] ?? 0;
      if (healed > 0) floats.push(effects.floatText(unitCenter(metrics, target), `+${healed}`, "#8cf0a4"));
    }
    for (const target of splashTargetsBefore) {
      const healed = rolled.splashHealingByTarget?.[target.id] ?? 0;
      if (healed > 0) floats.push(effects.floatText(unitCenter(metrics, target), `+${healed}`, "#8cf0a4"));
    }
    await Promise.all(floats);
  } else if (rolled && attackerBefore && targetBefore) {
    const artRange = rolled.artId ? artDefinition(attackerBefore, rolled.artId)?.targeting?.range : null;
    const ranged = shouldUseRangedAttackAnimation(attackerBefore, targetBefore, { artRange });
    const center = unitCenter(metrics, targetBefore);

    await effects.animateAttack(attackerBefore, targetBefore, ranged, rolled.artId ?? null);
    await revealRoll({ missed: Boolean(rolled.missed), critical: Boolean(rolled.critical) }, null, attackerBefore);
    playAttackImpactSound(rolled, ranged);

    if (rolled.missed) {
      await effects.floatText(center, "MISS", "#cbb78b");
    } else {
      const damage = Math.max(0, typeof rolled.damage === "number" ? rolled.damage : (rolled.damage?.damage ?? 0));
      const impactKind = (rolled.artId
        ? artDefinition(attackerBefore, rolled.artId)?.damageType === "magic"
        : getBasicAttackDamageType(attackerBefore) === "magic") ? "magic" : "physical";
      if (rolled.critical) {
        effects.critFlash();
        effects.shake(11);
      } else {
        effects.shake(Math.min(8, 2.5 + damage * 1.4));
      }
      effects.impact(center, Boolean(rolled.critical), impactKind);
      await effects.hitRecoil(targetBefore.id, targetBefore.position, Boolean(rolled.critical));
      await effects.floatText(center, damage > 0 ? (rolled.critical ? `✦ ${damage}` : `-${damage}`) : "0", rolled.critical ? "#ffd26a" : "#ff7684");
      for (const hitTarget of rolledTargetsBefore) {
        if (hitTarget.id === targetBefore.id) continue;
        const hitCenter = unitCenter(metrics, hitTarget);
        const hitDamage = Math.max(0, rolled.damageByTarget?.[hitTarget.id] ?? damage);
        effects.impact(hitCenter, Boolean(rolled.critical), impactKind);
        await effects.hitRecoil(hitTarget.id, hitTarget.position, Boolean(rolled.critical));
        await effects.floatText(hitCenter, hitDamage > 0 ? (rolled.critical ? `✦ ${hitDamage}` : `-${hitDamage}`) : "0", rolled.critical ? "#ffd26a" : "#ff7684");
      }
      await presentArtRider({ rolled, attackerBefore, targetBefore, metrics, effects, revealRoll, artDefinition });
      if (rolled.appliedStatus) {
        await effects.floatText(center, rolled.appliedStatus.toUpperCase(), rolled.appliedStatus === "stun" ? "#ffe45e" : "#70b7ff");
      }
      await dissolveSlainTargets(result.nextState, rolled, rolledTargetsBefore, targetBefore, effects);
    }
  }

  await presentClumsyDamage({ before, result, rolled, attackerBefore, targetBefore, metrics, effects });
  await presentHandOfLife({ before, events, metrics, effects });
  presentResourceRestores({ before, events, metrics, effects });
  await presentFlamespitter({ before, result, events, metrics, effects, artDefinition });
  await presentAttackSplash({ before, result, events, metrics, effects });
}

async function presentArtRider({ rolled, attackerBefore, targetBefore, metrics, effects, revealRoll, artDefinition }) {
  if (!rolled.artId) return;
  const art = artDefinition(attackerBefore, rolled.artId);
  if (art?.effect?.type === "status" && rolled.effect?.attempted) {
    const statusName = (art.effect.status ?? "status").toUpperCase();
    await revealRoll(
      { missed: !rolled.effect.applied, critical: false },
      rolled.effect.applied ? statusName : "RESISTED",
      attackerBefore,
    );
    if (rolled.effect.applied) {
      await effects.playAbilityVfx(rolled.artId, {
        actor: attackerBefore,
        target: targetBefore,
        effect: { ...rolled.effect, status: art.effect.status },
      });
    }
  }
  if (art?.effect?.type !== "heal" || !rolled.effect?.attempted) return;
  const drinksMp = art.effect.restore === "mp";
  await revealRoll(
    { missed: !rolled.effect.applied, critical: false },
    rolled.effect.applied ? (drinksMp ? "DRAINED" : "HEALED") : (drinksMp ? "NO DRAIN" : "NO HEAL"),
    attackerBefore,
  );
  if (!rolled.effect.applied) return;
  await effects.playAbilityVfx(rolled.artId, { actor: attackerBefore, target: targetBefore, effect: rolled.effect });
  if (drinksMp && rolled.effect.mpRestored > 0) {
    await effects.floatText(unitCenter(metrics, attackerBefore), `+${rolled.effect.mpRestored} MP`, "#8cc8ff");
  } else if (!drinksMp && rolled.effect.healing > 0) {
    await effects.floatText(unitCenter(metrics, attackerBefore), `+${rolled.effect.healing}`, "#8cf0a4");
  }
}

async function dissolveSlainTargets(nextState, rolled, targets, primary, effects) {
  const primaryAfter = findUnit(nextState, rolled.targetId);
  if (!primaryAfter || primaryAfter.hp <= 0) {
    await effects.deathDissolve(primary.id, primary.position, teamColor(primary.player));
  }
  for (const target of targets) {
    if (target.id === primary.id) continue;
    const after = findUnit(nextState, target.id);
    if (!after || after.hp <= 0) {
      await effects.deathDissolve(target.id, target.position, teamColor(target.player));
    }
  }
}

async function presentClumsyDamage({ before, result, rolled, attackerBefore, targetBefore, metrics, effects }) {
  const targets = rolled ? clumsySplashTargets(rolled, (id) => findUnit(before, id), "damage") : [];
  if (!rolled?.splashDamageByTarget || !attackerBefore || !targetBefore || !targets.length) return;
  await effects.floatText(unitCenter(metrics, targetBefore), "CLUMSY", "#d8c2f5");
  await Promise.all(targets.map(async (target) => {
    const damage = rolled.splashDamageByTarget?.[target.id] ?? 0;
    if (damage <= 0) return;
    const center = unitCenter(metrics, target);
    effects.impact(center, false, "magic");
    await effects.hitRecoil(target.id, target.position, false);
    await effects.floatText(center, `-${damage}`, "#c89cff");
    const after = findUnit(result.nextState, target.id);
    if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
  }));
}

async function presentHandOfLife({ before, events, metrics, effects }) {
  const event = events.find((candidate) => candidate.type === "HAND_OF_LIFE");
  if (!event) return;
  const actor = findUnit(before, event.actorId);
  const targets = Object.keys(event.healingByTarget).map((id) => findUnit(before, id)).filter(Boolean);
  if (!actor || !targets.length) return;
  await effects.playAbilityVfx("hand-of-life", { actor, targets });
  await Promise.all(targets.map((target) => {
    const floats = [];
    const healed = event.healingByTarget[target.id] ?? 0;
    const restored = event.restoredByTarget?.[target.id] ?? 0;
    if (healed > 0) floats.push(effects.floatText(unitCenter(metrics, target), `+${healed}`, "#f7e27d"));
    if (restored > 0) floats.push(effects.floatText(unitCenter(metrics, target), `+${restored} MP`, "#8cc8ff"));
    return Promise.all(floats);
  }));
}

function presentResourceRestores({ before, events, metrics, effects }) {
  for (const type of ["GROWTH_MP", "ROCK_HARD_MP"]) {
    const event = events.find((candidate) => candidate.type === type);
    const unit = event ? findUnit(before, event.unitId) : null;
    if (!unit) continue;
    const center = unitCenter(metrics, unit);
    if (event.mpGained > 0) effects.floatText(center, `+${event.mpGained} MP`, "#8cc8ff");
    else if (event.hpRestored > 0) effects.floatText(center, `+${event.hpRestored}`, "#8cf0a4");
  }
  const study = events.find((event) => event.type === "STUDY_LEECH");
  const student = study ? findUnit(before, study.actorId) : null;
  if (student) {
    const center = unitCenter(metrics, student);
    if (study.hpRestored > 0) effects.floatText(center, `+${study.hpRestored}`, "#8cf0a4");
    if (study.mpRestored > 0) effects.floatText(center, `+${study.mpRestored} MP`, "#8cc8ff");
  }
  const stance = events.find((event) => event.type === "STANCE_MP_RESTORED");
  for (const [id, amount] of Object.entries(stance?.restoredByTarget ?? {})) {
    const unit = amount > 0 ? findUnit(before, id) : null;
    if (unit) effects.floatText(unitCenter(metrics, unit), `+${amount} MP`, "#8cc8ff");
  }
  for (const [id, amount] of Object.entries(stance?.healedByTarget ?? {})) {
    const unit = amount > 0 ? findUnit(before, id) : null;
    if (unit) effects.floatText(unitCenter(metrics, unit), `+${amount}`, "#8cf0a4");
  }
}

async function presentFlamespitter({ before, result, events, metrics, effects, artDefinition }) {
  const event = events.find((candidate) => candidate.type === "FLAMESPITTER");
  if (!event) return;
  const actor = findUnit(before, event.actorId);
  const art = actor ? artDefinition(actor, event.artId) : null;
  const targets = (event.targetIds ?? []).map((id) => findUnit(before, id)).filter(Boolean);
  if (!actor || !art) return;
  const coneCells = getConeCells(before, actor, event.targetPosition, art) ?? [];
  await effects.playAbilityVfx(art.id, { actor, targets, targetPosition: event.targetPosition, coneCells });
  await Promise.all(targets.map(async (target) => {
    const center = unitCenter(metrics, target);
    await effects.hitRecoil(target.id, target.position, false);
    await effects.floatText(center, `-${event.damageByTarget?.[target.id] ?? 0}`, "#ff7684");
    const after = findUnit(result.nextState, target.id);
    if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
  }));
}

async function presentAttackSplash({ before, result, events, metrics, effects }) {
  const event = events.find((candidate) => candidate.type === "SPLASH_FIRE" || candidate.type === "ATTACK_SPLASH");
  if (!event) return;
  const targets = (event.targetIds ?? []).map((id) => findUnit(before, id)).filter(Boolean);
  await Promise.all(targets.map(async (target) => {
    const center = unitCenter(metrics, target);
    effects.impact(center, false, "true");
    await effects.hitRecoil(target.id, target.position, false);
    await effects.floatText(center, `-${event.damageByTarget?.[target.id] ?? 0}`, "#ff7684");
    const after = findUnit(result.nextState, target.id);
    if (!after || after.hp <= 0) await effects.deathDissolve(target.id, target.position, teamColor(target.player));
  }));
}
