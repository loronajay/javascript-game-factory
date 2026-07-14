import { findUnit } from "../core/state.js";
import { getArt } from "../core/unitCatalog.js";
import { teamColor } from "../match/matchBuilder.js";
import { createBoardMetrics, gridToScreen } from "./isometric.js";

const VFX_MANAGED_ARTS = new Set([
  "footwork", "dark-rush", "flee", "nuke", "dematerialize", "spark", "pray", "wish",
  "lightseeker", "darkseeker", "dark-bomb", "summon-ghoul", "summon", "beckon",
  "smoke-bomb", "build-cover", "shaft-prop", "throw-cigar", "age", "time-stretch",
  "rewind", "second-helping", "tether-grab", "rocket-punch", "recharge", "self-destruct", "anoint",
  "purify", "elevate", "heavenseeker", "hope", "cleanse", "focus-prayer", "flight",
  "pyroclasm", "ore-harvest", "ore-abundance", "headlamp", "blasting-cap", "dark-pulse",
  "realm-traversal", "quake", "thunderous-charge", "blizzard", "spring-shower", "heatwave",
  "landscaper", "thunderstorm", "great-flood", "patient-blade", "broken-oath", "challenge",
  "enrich", "source-shift", "petrify", "strike", "hold", "pursue", "higher-ground",
  "void-gravity",
]);

export function unitCenter(metrics, unit) {
  const screen = gridToScreen(metrics, unit.position.x, unit.position.y);
  return { x: screen.x, y: screen.y + metrics.tileHeight * 0.45 };
}

export function artCalloutLabel(unit, artId) {
  if (unit?.fakeArtNames?.[artId]) return unit.fakeArtNames[artId];
  const art = unit ? getArt(unit.type, artId) : null;
  if (art?.name) return art.name;
  return String(artId ?? "ART").split("-").filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function eventSoundKeys(event, { actorType = null } = {}) {
  if ("hit" in event) return [];
  if (event.type === "UNIT_MOVED") return ["unitMove"];
  if (event.type === "UNIT_DEFENDED") return ["defend"];
  if (event.type !== "ART_RESOLVED" || VFX_MANAGED_ARTS.has(event.artId)) return [];
  if (event.healingByTarget) return ["heal"];
  if (event.artId === "volley-shot") return ["arrowHit"];
  if (event.artId === "silence" || event.effect?.status === "silence") return ["silenceApplied"];
  if (actorType === "archer") return ["arrowAirborne", "arrowHit"];
  return ["attackHit"];
}

export function createBattleEventPresenter({ audio, effects, getState, onIdle = () => {} }) {
  let blockingPresentationCount = 0;

  function playAttackImpactSound(rolled, ranged) {
    if (rolled.missed) { audio.play("miss"); return; }
    if (rolled.defended) { audio.play("defendedHit"); return; }
    if (rolled.artId === "spark") { audio.play("spark"); return; }
    if (rolled.artId === "banish") { audio.play("banish"); return; }
    if (rolled.effect?.applied && (rolled.artId === "life-sap" || rolled.artId === "soul-sap")) audio.play("lifeSap");
    audio.play(ranged ? "arrowHit" : "attackHit");
  }

  function playArtCallout(event) {
    if (!event?.actorId || !event?.artId) return;
    const actor = findUnit(getState(), event.actorId);
    if (actor) effects.artCallout(actor, artCalloutLabel(actor, event.artId));
  }

  function playEventSounds(events) {
    const state = getState();
    for (const event of events) {
      const actorType = findUnit(state, event.actorId)?.type ?? null;
      for (const key of eventSoundKeys(event, { actorType })) audio.play(key);
    }
  }

  async function playRolloverFx(events) {
    const state = getState();
    const burns = events.filter((event) => event.type === "FIRE_DAMAGE");
    const steals = events.filter((event) => event.type === "TIME_STEAL");
    const bites = events.filter((event) => event.type === "AUTO_STRIKE");
    const mourns = events.filter((event) => event.type === "KING_MOURNS");
    const rallies = events.filter((event) => event.type === "SQUAD_RALLY");
    const restores = events.filter((event) => event.type === "KING_RESTORED");
    const darkPulses = events.filter((event) => event.type === "DARK_PULSE_AUTO");
    const erupts = events.filter((event) => event.type === "PYROCLASM_ERUPT");
    const retaliations = events.filter((event) => event.type === "STONE_RETALIATION");
    const snacks = events.filter((event) => event.type === "SNACK_BREAK" || event.type === "EMERGENCY_SNACK");
    const rageRegens = events.filter((event) =>
      event.type === "RAGE_REGENERATE" && findUnit(state, event.unitId)?.type !== "miner");
    const oreRageFills = events.filter((event) =>
      event.type === "RAGE_REGENERATE" && (event.mpRestored ?? 0) > 0 && findUnit(state, event.unitId)?.type === "miner");
    const duelHeals = events.filter((event) => event.type === "DUELIST_HEAL");
    const recoils = events.filter((event) => event.type === "ATTACK_RECOIL");
    const critMpRestores = events.filter((event) => event.type === "CRIT_MP_RESTORE");
    const ghostDissipations = events.filter((event) => event.type === "GHOST_DISSIPATED");
    const petrifyPulses = events.filter((event) => event.type === "PETRIFY_PULSE");
    const weatherRegens = events.filter((event) => event.type === "WEATHER_REGEN");
    const passiveRestores = events.filter((event) => event.type === "PASSIVE_RESTORE");
    const voidPressure = events.filter((event) => event.type === "VOID_PRESSURE");
    const voidAfflictions = events.filter((event) => event.type === "VOID_TILE_AFFLICTION");
    if (!burns.length && !steals.length && !mourns.length && !rallies.length && !restores.length &&
        !darkPulses.length && !erupts.length && !retaliations.length && !snacks.length && !bites.length &&
        !rageRegens.length && !oreRageFills.length && !duelHeals.length && !recoils.length && !critMpRestores.length &&
        !ghostDissipations.length && !petrifyPulses.length && !weatherRegens.length && !passiveRestores.length &&
        !voidPressure.length && !voidAfflictions.length) return;

    const metrics = createBoardMetrics(state.size);
    let killed = false;
    const blockingAnimations = [];

    for (const ghost of ghostDissipations) {
      const unit = findUnit(state, ghost.unitId);
      const shell = unit ?? { id: ghost.unitId, player: state.currentPlayer, position: ghost.position };
      effects.floatText(unitCenter(metrics, shell), "DISSIPATE", "#cbb8ff");
      effects.deathDissolve(ghost.unitId, ghost.position, teamColor(shell.player));
    }

    if (erupts.length) audio.play("nuke");
    for (const erupt of erupts) {
      for (const [id, amount] of Object.entries(erupt.damageByTarget ?? {})) {
        if (amount <= 0) continue;
        const unit = findUnit(state, id);
        const center = unitCenter(metrics, unit ?? { position: { x: 0, y: 0 } });
        effects.impact(center, false, "fire");
        effects.floatText(center, `-${amount}`, "#ff9a3c");
        if (!unit || unit.hp <= 0) { effects.deathBurst(center, teamColor(unit?.player ?? 1)); killed = true; }
      }
    }

    for (const pulse of darkPulses) {
      const actor = findUnit(state, pulse.actorId);
      if (!actor) continue;
      const targets = (pulse.targetIds ?? []).map((id) => findUnit(state, id)).filter(Boolean);
      blockingAnimations.push(effects.playAbilityVfx("dark-pulse", { actor, targets, rays: pulse.pulseRays ?? [] }).then(() => {
        for (const target of targets) {
          const center = unitCenter(metrics, target);
          const damage = pulse.damageByTarget?.[target.id] ?? 0;
          const healing = pulse.healingByTarget?.[target.id] ?? 0;
          if (damage > 0) {
            effects.floatText(center, `-${damage}`, "#c89cff");
            if (target.hp <= 0) { effects.deathBurst(center, teamColor(target.player)); audio.play("unitDefeated"); }
          } else if (healing > 0) effects.floatText(center, `+${healing}`, "#8cf0a4");
        }
      }));
    }

    for (const retaliation of retaliations) {
      const offender = findUnit(state, retaliation.offenderId);
      const center = unitCenter(metrics, offender ?? { position: { x: 0, y: 0 } });
      effects.impact(center, false, "true");
      effects.floatText(center, `-${retaliation.damage}`, "#e8f4ff");
      if (!offender || offender.hp <= 0) { effects.deathBurst(center, teamColor(offender?.player ?? 1)); killed = true; }
    }

    for (const heal of duelHeals) {
      const unit = findUnit(state, heal.unitId);
      if (unit && heal.hpRestored > 0) effects.floatText(unitCenter(metrics, unit), `+${heal.hpRestored}`, "#8cf0a4");
    }
    for (const recoil of recoils) {
      const unit = findUnit(state, recoil.unitId);
      const center = unitCenter(metrics, unit ?? { position: { x: 0, y: 0 } });
      effects.floatText(center, `-${recoil.damage}`, "#ff7684");
      if (!unit || unit.hp <= 0) { effects.deathBurst(center, teamColor(unit?.player ?? 1)); killed = true; }
    }
    for (const restore of critMpRestores) {
      const unit = findUnit(state, restore.unitId);
      if (!unit) continue;
      const center = unitCenter(metrics, unit);
      if (restore.mpGained > 0) effects.floatText(center, `+${restore.mpGained} MP`, "#7fd0ff");
      else if (restore.hpRestored > 0) effects.floatText(center, `+${restore.hpRestored}`, "#8cf0a4");
    }
    for (const regen of weatherRegens) {
      const unit = findUnit(state, regen.unitId);
      if (!unit) continue;
      if (regen.hpRestored > 0) effects.floatText(unitCenter(metrics, unit), `+${regen.hpRestored}`, "#8cf0a4");
      else if (regen.mpRestored > 0) effects.floatText(unitCenter(metrics, unit), `+${regen.mpRestored} MP`, "#8cc8ff");
    }
    for (const restore of passiveRestores) {
      const source = findUnit(state, restore.sourceId ?? restore.unitId);
      const unit = findUnit(state, restore.unitId);
      if (source && restore.passiveName) effects.artCallout(source, restore.passiveName);
      if (!unit) continue;
      const center = unitCenter(metrics, unit);
      if (restore.mpRestored > 0) effects.floatText(center, `+${restore.mpRestored} MP`, "#7fd0ff");
      else if (restore.hpRestored > 0) effects.floatText(center, `+${restore.hpRestored}`, "#8cf0a4");
    }
    for (const regen of rageRegens) {
      const unit = findUnit(state, regen.unitId);
      if (!unit) continue;
      const center = unitCenter(metrics, unit);
      if (regen.hpRestored > 0) effects.floatText(center, `+${regen.hpRestored}`, "#8cf0a4");
      if (regen.mpRestored > 0) effects.floatText(center, `+${regen.mpRestored} MP`, "#8cc8ff");
    }

    if (voidPressure.length) audio.play("timeSteal");
    for (const pressure of voidPressure) {
      const center = unitCenter(metrics, { position: pressure.position });
      effects.impact(center, false, "true");
      effects.floatText(center, `-${pressure.damage}`, "#b996ff");
      const unit = findUnit(state, pressure.unitId);
      if (!unit || unit.hp <= 0) { effects.deathBurst(center, teamColor(unit?.player ?? 1)); killed = true; }
    }
    for (const affliction of voidAfflictions) {
      if (!(affliction.applied ?? []).length) continue;
      const unit = findUnit(state, affliction.unitId);
      if (!unit) continue;
      effects.floatText(unitCenter(metrics, unit), affliction.applied.map((type) => type.toUpperCase()).join(" + "), "#b996ff");
    }

    for (const pulse of petrifyPulses) {
      const statue = findUnit(state, pulse.unitId);
      if (statue && (pulse.hpRestored > 0 || pulse.mpRestored > 0)) {
        const parts = [];
        if (pulse.hpRestored > 0) parts.push(`+${pulse.hpRestored}`);
        if (pulse.mpRestored > 0) parts.push(`+${pulse.mpRestored} MP`);
        effects.floatText(unitCenter(metrics, statue), parts.join(" "), "#c9e6b0");
      }
      for (const id of pulse.alliesHealed ?? []) {
        const ally = findUnit(state, id);
        if (ally) effects.floatText(unitCenter(metrics, ally), "+", "#8cf0a4");
      }
      for (const id of pulse.enemiesDrained ?? []) {
        const enemy = findUnit(state, id);
        const center = unitCenter(metrics, enemy ?? { position: { x: 0, y: 0 } });
        effects.floatText(center, "DRAIN", "#c48fbf");
        if (!enemy || enemy.hp <= 0) { effects.deathBurst(center, teamColor(enemy?.player ?? 1)); killed = true; }
      }
    }

    if (bites.length) audio.play("attackHit");
    for (const bite of bites) {
      const center = unitCenter(metrics, { position: bite.position });
      effects.impact(center, false, "true");
      effects.floatText(center, `-${bite.damage}`, "#e8f4ff");
      const after = findUnit(state, bite.targetId);
      if (!after || after.hp <= 0) { effects.deathBurst(center, teamColor(after?.player ?? 1)); killed = true; }
    }

    if (burns.length) audio.play("fireTick");
    for (const burn of burns) {
      const center = unitCenter(metrics, { position: burn.position });
      effects.impact(center, false, "fire");
      effects.floatText(center, `-${burn.damage}`, "#ff9a3c");
      const after = findUnit(state, burn.unitId);
      if (!after || after.hp <= 0) { effects.deathBurst(center, teamColor(after?.player ?? 1)); killed = true; }
    }

    if (steals.length) {
      audio.play("timeSteal");
      for (const steal of steals) {
        const center = unitCenter(metrics, { position: steal.position });
        effects.impact(center, false, "true");
        effects.floatText(center, `-${steal.damage}`, "#c9b3ff");
        const after = findUnit(state, steal.unitId);
        if (!after || after.hp <= 0) { effects.deathBurst(center, teamColor(after?.player ?? 1)); killed = true; }
      }
      for (const mp of events.filter((event) => event.type === "TIME_STEAL_MP")) {
        const source = findUnit(state, mp.sourceId);
        if (!source) continue;
        const center = unitCenter(metrics, source);
        if (mp.mpGained > 0) effects.floatText(center, `+${mp.mpGained} MP`, "#7fd0ff");
        else if (mp.hpRestored > 0) effects.floatText(center, `+${mp.hpRestored}`, "#8cf0a4");
      }
    }

    for (const mourn of mourns) {
      const king = findUnit(state, mourn.kingId);
      if (!king) continue;
      const center = unitCenter(metrics, king);
      effects.floatText(center, `-${mourn.damage}`, "#ff7684");
      if (king.hp <= 0) { effects.deathBurst(center, teamColor(king.player)); killed = true; }
    }
    for (const rally of rallies) {
      for (const id of rally.rallied ?? []) {
        const unit = findUnit(state, id);
        if (unit) effects.floatText(unitCenter(metrics, unit), `+${rally.healing}`, "#8cf0a4");
      }
    }
    for (const restore of restores) {
      const king = findUnit(state, restore.kingId);
      if (king) effects.floatText(unitCenter(metrics, king), `+${restore.healing}`, "#8cf0a4");
    }
    for (const snack of snacks) {
      const unit = findUnit(state, snack.unitId);
      if (!unit) continue;
      const center = unitCenter(metrics, unit);
      if (snack.hpRestored > 0) effects.floatText(center, `+${snack.hpRestored}`, "#8cf0a4");
      if (snack.mpRestored > 0) effects.floatText(center, `+${snack.mpRestored} MP`, "#8cc8ff");
    }
    for (const fill of oreRageFills) {
      const unit = findUnit(state, fill.unitId);
      if (!unit) continue;
      const center = unitCenter(metrics, unit);
      effects.playAbilityVfx("ore-abundance", { actor: unit, targets: [unit] }).then(() => {
        effects.floatText(center, `+${fill.mpRestored} ORE`, "#d8b35e");
      }).catch(() => {});
    }

    if (killed) audio.play("unitDefeated");
    if (blockingAnimations.length) {
      blockingPresentationCount += 1;
      try {
        await Promise.allSettled(blockingAnimations);
      } finally {
        blockingPresentationCount = Math.max(0, blockingPresentationCount - 1);
        if (blockingPresentationCount === 0) onIdle();
      }
    }
  }

  return {
    isBusy: () => blockingPresentationCount > 0,
    playArtCallout,
    playAttackImpactSound,
    playEventSounds,
    playRolloverFx,
  };
}
