import { findUnit } from "../core/state.js";
import { isRaging } from "../core/unitCatalog.js";
import {
  BROTHERS_MISSION_ID,
  CLOD_MISSION_ID,
  FATHER_TIME_MISSION_ID,
  FINAL_BATTLE_MISSION_ID,
  GARGOYLE_MISSION_ID,
  HASBEEN_HEROES_MISSION_ID,
  MINER_MISSION_ID,
  MONK_MISSION_ID,
  NECROMANCER_MISSION_ID,
  NOT_MY_KING_ENEMY_TYPES,
  NOT_MY_KING_MISSION_ID,
  OUT_OF_RETIREMENT_MISSION_ID,
  PALADIN_MISSION_ID,
  RONIN_MISSION_ID,
  SHOWDOWN_FAT_TYPES,
  SHOWDOWN_MISSION_ID,
  SNIPER_MISSION_ID,
  SPIRIT_WOODS_MISSION_ID,
  VIRUS_MISSION_ID,
  VOIDWOOD_MISSION_ID,
  VOID_CASTLE_MISSION_ID,
  WITCH_DOCTOR_MISSION_ID,
  WRONG_PLACE_MISSION_ID,
} from "./campaign.js";
import {
  countPlayerMagicDamageDealt,
  eventDamageForTarget,
  eventTargetIds,
  playerFireHitTarget,
  playerLandedEnemyStatus,
  playerTriedBlindOnEnemyMonk,
  playerTriedPoisonOnTarget,
  playerTriedStatusOnTargets,
} from "./campaignObservations.js";

export function recordCampaignProgress({
  matchMode,
  campaignMissionId,
  campaignMeta,
  state,
  command = null,
  result = null,
  beforeState = null,
}) {
  if (matchMode !== "campaign") return;
  // Defensive: a bad call site passing no result must never throw here — an
  // exception in a resolver leaves `resolving` stuck and hardlocks the match.
  const events = result?.events ?? [];
  if (campaignMissionId === CLOD_MISSION_ID) {
    const charge = events.find((event) =>
      event.type === "ART_RESOLVED" &&
      event.actorId === "p2-0-clod" &&
      event.artId === "thunderous-charge");
    if (charge) {
      campaignMeta.clodChargeUsed = true;
      const playerHitIds = (charge.targetIds ?? []).filter((id) => findUnit(state, id)?.player === 1);
      campaignMeta.clodChargeHitCount = Math.max(campaignMeta.clodChargeHitCount, playerHitIds.length);
      campaignMeta.chargeDefended ||= playerHitIds.some((id) => findUnit(state, id)?.defending);
    }
  } else if (campaignMissionId === NECROMANCER_MISSION_ID || campaignMissionId === VIRUS_MISSION_ID) {
    // A cleanse (Mystic Purify / Fat Cleric Cleanse) that actually stripped something
    // reports a non-empty `cleansed` list; only the player's own cast counts.
    const cleansed = events.some((event) =>
      event.type === "ART_RESOLVED" &&
      Array.isArray(event.cleansed) && event.cleansed.length > 0 &&
      findUnit(state, event.actorId)?.player === 1);
    if (campaignMissionId === NECROMANCER_MISSION_ID && cleansed) campaignMeta.cleanseUsed = true;
    // Virus's Spread jumping a debuff onto a second player unit fails the spacing bonus.
    for (const event of events) {
      if (event.type !== "STATUS_SPREAD") continue;
      if ((event.spreadTo ?? []).some((id) => findUnit(state, id)?.player === 1)) {
        campaignMeta.spreadHitCount += 1;
      }
    }
    if (campaignMissionId === VIRUS_MISSION_ID && playerLandedEnemyStatus(state, events)) {
      campaignMeta.playerAfflictedEnemyStatus = true;
    }
  } else if (campaignMissionId === WITCH_DOCTOR_MISSION_ID) {
    campaignMeta.ghoulsDefeatedCount = Math.max(
      campaignMeta.ghoulsDefeatedCount,
      state.units.filter((unit) => unit.player === 2 && unit.type === "ghoul" && unit.hp <= 0).length,
    );
    for (const event of events) {
      if (event.type === "FIRE_DAMAGE" && findUnit(state, event.unitId)?.player === 1) {
        campaignMeta.fireDamageTakenCount += 1;
      }
      if (event.type === "AUTO_STRIKE") {
        const source = findUnit(state, event.sourceId);
        const target = findUnit(state, event.targetId);
        if (source?.type === "ghoul" && target?.player === 1) campaignMeta.ghoulBiteTakenCount += 1;
      }
      if (event.type === "ART_RESOLVED" && event.stance === "blackDeath") {
        const actor = findUnit(state, event.actorId);
        if (actor?.player === 2 && actor.type === "witch-doctor") campaignMeta.blackDeathDanceUsed = true;
      }
      // Count every Rain Dance cast against the mission's heal-cast cap so the CPU
      // can't stall to full HP while the player crosses the Ghoul lattice — see
      // WITCH_DOCTOR_HEAL_CAST_CAP in campaign.js.
      if (event.type === "ART_RESOLVED" && event.artId === "rain-dance") {
        const actor = findUnit(state, event.actorId);
        if (actor?.player === 2 && actor.type === "witch-doctor") {
          campaignMeta.witchDoctorHealCastCount += 1;
        }
      }
    }
  } else if (campaignMissionId === FATHER_TIME_MISSION_ID) {
    const fatherTime = state.units.find((unit) => unit.player === 2 && unit.type === "father-time") ?? null;
    const archer = state.units.find((unit) => unit.player === 2 && unit.type === "archer") ?? null;
    if (archer?.hp <= 0 && fatherTime?.hp > 0) {
      campaignMeta.archerDefeatedBeforeFatherTime = true;
    }
    if (archer?.statuses?.some((status) => status.type === "blind")) {
      campaignMeta.archerBlinded = true;
    }
    for (const event of events) {
      if (event.type !== "ART_RESOLVED") continue;
      const actor = findUnit(state, event.actorId);
      if (actor?.player !== 2 || actor.type !== "father-time") continue;
      if (event.artId === "rewind") {
        campaignMeta.rewindUsed = true;
      }
    }
  } else if (campaignMissionId === PALADIN_MISSION_ID || campaignMissionId === OUT_OF_RETIREMENT_MISSION_ID) {
    const paladinId = campaignMissionId === OUT_OF_RETIREMENT_MISSION_ID ? "p2-1-paladin" : "p2-0-paladin";
    for (const event of events) {
      if (event.type === "ART_RESOLVED" && event.actorId === paladinId && event.artId === "lightseeker") {
        const playerHits = (event.targetIds ?? []).filter((id) =>
          findUnit(state, id)?.player === 1 && (event.damageByTarget?.[id] ?? 0) > 0);
        campaignMeta.paladinLightseekerDamageTakenCount += playerHits.length;
      }
    }
    const immuneTargets = campaignMissionId === OUT_OF_RETIREMENT_MISSION_ID
      ? ["p2-0-angel", "p2-1-paladin"]
      : ["p2-0-paladin"];
    if (playerTriedStatusOnTargets(state, command, events, immuneTargets)) {
      campaignMeta.paladinStatusAttempted = true;
    }
    if (campaignMissionId === OUT_OF_RETIREMENT_MISSION_ID) {
      const angel = findUnit(state, "p2-0-angel");
      const paladin = findUnit(state, "p2-1-paladin");
      if (angel?.hp <= 0 && paladin?.hp > 0) {
        campaignMeta.angelDefeatedBeforePaladin = true;
      }
    }
  } else if (campaignMissionId === SPIRIT_WOODS_MISSION_ID) {
    for (const event of events) {
      if (event.type === "ART_RESOLVED" && event.actorId === "p2-3-paladin" && event.artId === "lightseeker") {
        const playerHits = (event.targetIds ?? []).filter((id) =>
          findUnit(state, id)?.player === 1 && (event.damageByTarget?.[id] ?? 0) > 0);
        campaignMeta.paladinLightseekerDamageTakenCount += playerHits.length;
      }
      if (event.type === "ART_RESOLVED" && event.actorId === "p2-0-mother-nature" && event.artId === "great-flood") {
        campaignMeta.motherNatureGreatFloodUsed = true;
      }
      if (playerFireHitTarget(state, event, "p2-1-treant")) {
        campaignMeta.spiritWoodsTreantFireHit = true;
      }
    }
    if (playerTriedPoisonOnTarget(state, command, events, "p2-1-treant")) {
      campaignMeta.spiritWoodsTreantPoisonAttempted = true;
    }
    if (playerTriedStatusOnTargets(state, command, events, ["p2-3-paladin"])) {
      campaignMeta.paladinStatusAttempted = true;
    }
  } else if (campaignMissionId === SHOWDOWN_MISSION_ID) {
    if (state.units.some((unit) => unit.hp > 0 && isRaging(unit))) {
      campaignMeta.showdownAnyUnitEnteredRage = true;
    }
    for (const event of events) {
      if (event.type !== "ART_RESOLVED" || event.artId !== "footwork") continue;
      if (findUnit(state, event.actorId)?.player !== 1) continue;
      const enemiesBefore = (beforeState?.units ?? state.units)
        .filter((unit) => unit.player === 2 && unit.hp > 0);
      const harmed = new Set([...(event.harmed ?? []), ...(event.targetIds ?? [])]);
      if (
        enemiesBefore.length === SHOWDOWN_FAT_TYPES.length &&
        enemiesBefore.every((unit) => SHOWDOWN_FAT_TYPES.includes(unit.type)) &&
        enemiesBefore.every((unit) => harmed.has(unit.id))
      ) {
        campaignMeta.showdownFootworkHitAllEnemies = true;
      }
    }
  } else if (campaignMissionId === NOT_MY_KING_MISSION_ID) {
    if (state.units.some((unit) =>
      unit.player === 2 &&
      unit.hp > 0 &&
      NOT_MY_KING_ENEMY_TYPES.includes(unit.type) &&
      isRaging(unit))) {
      campaignMeta.notMyKingEnemyEnteredRage = true;
    }
  } else if (campaignMissionId === VOIDWOOD_MISSION_ID) {
    campaignMeta.playerMagicDamageDealtCount += countPlayerMagicDamageDealt(state, events);
    for (const event of events) {
      if (event.type === "AUTO_STRIKE") {
        const source = findUnit(state, event.sourceId);
        const target = findUnit(state, event.targetId);
        if (source?.type === "ghoul" && target?.player === 1) campaignMeta.ghoulBiteTakenCount += 1;
      }
      if (event.type !== "ART_RESOLVED" || event.artId !== "dark-bomb") continue;
      const actor = findUnit(state, event.actorId);
      if (actor?.player !== 2 || actor.type !== "necromancer") continue;
      const playerHits = eventTargetIds(event).filter((id) =>
        findUnit(state, id)?.player === 1 && eventDamageForTarget(event, id) > 0);
      campaignMeta.voidwoodDarkBombDamageTakenCount += playerHits.length;
    }
  } else if (campaignMissionId === VOID_CASTLE_MISSION_ID) {
    const trial = state.missionRules?.voidCastleTrial;
    if (state.units.some((unit) =>
      unit.player === 2 && unit.type === "nemesis" && unit.hp > 0 && isRaging(unit))) {
      campaignMeta.voidCastleNemesisEnteredRage = true;
    }
    // Only a decoy felled while the real Summoner is still standing counts against the
    // player. Once he falls, resolveVictory drops every copy at once — that is the win,
    // not a mistake.
    const realSummoner = trial?.realSummonerId ? findUnit(state, trial.realSummonerId) : null;
    if (
      trial?.phase === 2 &&
      realSummoner?.hp > 0 &&
      state.units.some((unit) => unit.trialDecoySummoner && unit.hp <= 0)
    ) {
      campaignMeta.voidCastleDecoyKilled = true;
    }
    // The finishing blow of phase 1 registers as a genuine victory in the engine (an enemy
    // team with no living bodies would otherwise stall the turn loop). Take it back here,
    // synchronously, before announceTurnChange can read state.phase and flash a results
    // screen — the same trick recordTutorialProgress uses for its scripted "victories".
    // The split beat that follows is what actually rebuilds the board.
    if (trial?.pendingSplit && state.phase === "complete") {
      state.phase = "playing";
      state.winner = null;
      state.activation = null;
    }
  } else if (campaignMissionId === FINAL_BATTLE_MISSION_ID) {
    // Banish: he spends every point of his own HP to erase every enemy standing on a dark
    // tile. Recorded here (not inferred from the corpses) so the loss beat can tell the
    // difference between "he wiped the party with the ultimate" and "he ground them down."
    if (events.some((event) => event.type === "ART_RESOLVED" && event.artId === "banish-dark")) {
      campaignMeta.finalBattleBanished = true;
    }
    // Every stage but the last registers as a genuine victory in the engine — a side with no
    // living bodies would otherwise stall the turn loop. Take it back here, synchronously,
    // before announceTurnChange can read state.phase and flash a results screen. The blackout
    // beat that follows is what actually rebuilds the board (the same trick the castle's split
    // and the tutorial's scripted "victories" use).
    if (state.missionRules?.finalBattle?.pendingStage && state.phase === "complete") {
      state.phase = "playing";
      state.winner = null;
      state.activation = null;
    }
  } else if (campaignMissionId === MONK_MISSION_ID) {
    const realMonkId = state.missionRules?.monkTrial?.realMonkId;
    const realMonk = realMonkId ? findUnit(state, realMonkId) : null;
    if (realMonk?.hp > 0 && state.units.some((unit) => unit.trialFakeMonk && unit.hp <= 0)) {
      campaignMeta.monkFakeKilledBeforeReal = true;
    }
    if (playerTriedBlindOnEnemyMonk(state, command, events)) {
      campaignMeta.monkBlindAttempted = true;
    }
  } else if (campaignMissionId === GARGOYLE_MISSION_ID) {
    const gargoyle = findUnit(state, "p2-0-gargoyle");
    if (gargoyle?.hp > 0 && gargoyle.hp <= 5) {
      campaignMeta.gargoyleEnteredRage = true;
    }
    for (const event of events) {
      if (event.type === "FIRE_DAMAGE" && findUnit(state, event.unitId)?.player === 1) {
        campaignMeta.fireDamageTakenCount += 1;
      }
      const isChosenPyroclasm =
        event.type === "ART_RESOLVED" &&
        event.actorId === "p2-0-gargoyle" &&
        event.artId === "pyroclasm";
      const isFreePyroclasm =
        event.type === "PYROCLASM_ERUPT" &&
        event.actorId === "p2-0-gargoyle";
      if (!isChosenPyroclasm && !isFreePyroclasm) continue;
      const playerHits = (event.targetIds ?? []).filter((id) =>
        findUnit(state, id)?.player === 1 && (event.damageByTarget?.[id] ?? 0) > 0);
      campaignMeta.gargoylePyroclasmDamageTakenCount += playerHits.length;
      if (isFreePyroclasm) campaignMeta.gargoyleEnteredRage = true;
    }
  } else if (campaignMissionId === SNIPER_MISSION_ID) {
    // A blind can tick off before the match ends, so latch the moment the enemy Sniper
    // wears one (mirrors Father Time's archerBlinded latch).
    const sniper = state.units.find((unit) => unit.player === 2 && unit.type === "sniper") ?? null;
    if (sniper?.statuses?.some((status) => status.type === "blind")) {
      campaignMeta.sniperBlinded = true;
    }
    for (const event of events) {
      if (event.type === "FIRE_DAMAGE" && findUnit(state, event.unitId)?.player === 1) {
        campaignMeta.fireDamageTakenCount += 1;
      }
      // Any wall the player brings down (a scattered cover wall or one the enemy Sniper
      // built) satisfies the destroy-a-wall objective.
      if (event.type === "WALL_ATTACKED" && event.destroyed && findUnit(state, event.actorId)?.player === 1) {
        campaignMeta.wallDestroyedCount += 1;
      }
    }
  } else if (campaignMissionId === MINER_MISSION_ID) {
    const miner = findUnit(state, "p2-0-miner");
    if (miner?.hp > 0 && miner.hp <= 5) {
      campaignMeta.minerEnteredRage = true;
    }
    for (const event of events) {
      if (event.type === "RAGE_REGENERATE" && event.unitId === "p2-0-miner" && (event.mpRestored ?? 0) > 0) {
        campaignMeta.minerEnteredRage = true;
        campaignMeta.minerRageHarvested = true;
      }
      if (event.type !== "ART_RESOLVED" || event.actorId !== "p2-0-miner" || event.artId !== "blasting-cap") continue;
      for (const id of event.blocked ?? []) {
        if (findUnit(state, id)?.player === 1 && (event.damageByTarget?.[id] ?? 0) > 0) {
          campaignMeta.minerBlastingCapSplashTakenCount += 1;
        }
      }
    }
  } else if (campaignMissionId === HASBEEN_HEROES_MISSION_ID) {
    // The star is "take no Fart displacement damage": a Fart that CAN'T shove its target
    // (wall/body/edge behind it) deals true damage instead, surfaced on the resolve event's
    // `blocked` list. Count each blocked-shove that actually hit one of the player's units.
    for (const event of events) {
      if (event.type !== "ART_RESOLVED" || event.artId !== "fart") continue;
      if (findUnit(state, event.actorId)?.player !== 2) continue;
      for (const id of event.blocked ?? []) {
        if (findUnit(state, id)?.player === 1 && (event.damageByTarget?.[id] ?? 0) > 0) {
          campaignMeta.fartDisplacementDamageTakenCount += 1;
        }
      }
    }
  } else if (campaignMissionId === RONIN_MISSION_ID) {
    const ronin = findUnit(state, "p2-0-ronin");
    if (ronin?.hp > 0 && ronin.hp <= 5) {
      campaignMeta.roninEnteredRage = true;
    }
    if (state.units.some((unit) =>
      unit.player === 1 && unit.statuses?.some((status) => status.type === "blind"))) {
      campaignMeta.roninBlindApplied = true;
    }
  } else if (campaignMissionId === WRONG_PLACE_MISSION_ID) {
    const playerStunned = events.some((event) => {
      const targetIds = [
        event.targetId,
        ...(event.targetIds ?? []),
        ...(event.statusTargets ?? []),
        ...(event.stunnedIds ?? []),
      ].filter(Boolean);
      const appliedStun =
        event.appliedStatus === "stun" ||
        event.effect?.status === "stun" ||
        event.status === "stun" ||
        event.stunned === true;
      return appliedStun && targetIds.some((id) => findUnit(state, id)?.player === 1);
    });
    if (playerStunned || state.units.some((unit) =>
      unit.player === 1 && unit.statuses?.some((status) => status.type === "stun"))) {
      campaignMeta.wrongPlacePlayerStunned = true;
    }
    for (const event of events) {
      if (event.type !== "ART_RESOLVED" || event.artId !== "nuke") continue;
      const actor = findUnit(state, event.actorId);
      if (actor?.player !== 1 || actor.type !== "magician") continue;
      const enemyIds = state.units.filter((unit) => unit.player === 2 && unit.type === "riot-cop").map((unit) => unit.id);
      if (enemyIds.length > 0 && enemyIds.every((id) => (event.targetIds ?? []).includes(id))) {
        campaignMeta.wrongPlaceNukedAllEnemies = true;
      }
    }
  } else if (campaignMissionId === BROTHERS_MISSION_ID) {
    // Latch the "kill before RAGE" star fail the moment either brother sits at RAGE
    // threshold (<=5 HP) while still alive (mirrors the Gargoyle/Miner rage latch).
    const bigBrother = findUnit(state, "p2-0-big-brother");
    const littleBrother = findUnit(state, "p2-1-little-brother");
    if ((bigBrother?.hp > 0 && bigBrother.hp <= 5) || (littleBrother?.hp > 0 && littleBrother.hp <= 5)) {
      campaignMeta.brothersEnteredRage = true;
    }
    // The "avoid double flame" star: any single Flamethrower cone — the active Little
    // Brother ART or the raging Flamespitter free cone — that damaged BOTH player units.
    for (const event of events) {
      const isFlamethrower =
        (event.type === "ART_RESOLVED" && event.artId === "flamethrower") ||
        (event.type === "FLAMESPITTER" && event.artId === "flamethrower");
      if (!isFlamethrower) continue;
      if (findUnit(state, event.actorId)?.player !== 2) continue;
      const playerHits = (event.targetIds ?? []).filter((id) =>
        findUnit(state, id)?.player === 1 && (event.damageByTarget?.[id] ?? 0) > 0);
      if (playerHits.length >= 2) campaignMeta.flamethrowerBothHitCount += 1;
    }
  }
}

// Returns the next eligible condition-triggered dialogue beat for the active mission
// (or null). Each beat marks its own once-only flag so the same warning never repeats.

