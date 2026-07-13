import { findUnit } from "../core/state.js";
import {
  FINAL_BATTLE_DUEL_COUNT,
  getFinalBattleRules,
} from "./missions/the-final-battle/stages.js";
import {
  BROTHERS_MISSION_ID,
  CLOD_MISSION_ID,
  FATHER_TIME_MISSION_ID,
  FINAL_BATTLE_MISSION_ID,
  GARGOYLE_MISSION_ID,
  HASBEEN_HEROES_FAT_TYPES,
  HASBEEN_HEROES_MISSION_ID,
  MINER_MISSION_ID,
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
  brothersRageWarningScript,
  clodRageWarningScript,
  fatherTimeRageWarningScript,
  finalBattleDuelScript,
  finalBattleDuelWonScript,
  finalBattleLastStandScript,
  finalBattleRageWarningScript,
  finalBattleReachWarningScript,
  gargoyleRageWarningScript,
  hasbeenFatRageWarningScript,
  minerBlastingCapSplashWarningScript,
  minerRageWarningScript,
  necromancerRageWarningScript,
  necromancerStatusWarningScript,
  necromancerSummonWarningScript,
  notMyKingEnemyRageWarningScript,
  outOfRetirementAngelRageWarningScript,
  outOfRetirementLightseekerWarningScript,
  outOfRetirementStatusTauntScript,
  paladinLightseekerWarningScript,
  paladinRageWarningScript,
  paladinStatusTauntScript,
  roninBlindWarningScript,
  roninRageWarningScript,
  showdownFatRageWarningScript,
  shouldShowBrothersRageWarning,
  shouldShowClodRageWarning,
  shouldShowFatherTimeRageWarning,
  shouldShowFinalBattleRageWarning,
  shouldShowFinalBattleReachWarning,
  shouldShowGargoyleRageWarning,
  shouldShowHasbeenFatRageWarning,
  shouldShowMinerBlastingCapSplashWarning,
  shouldShowMinerRageWarning,
  shouldShowNecromancerRageWarning,
  shouldShowNecromancerStatusWarning,
  shouldShowNecromancerSummonWarning,
  shouldShowNotMyKingEnemyRageWarning,
  shouldShowOutOfRetirementAngelRageWarning,
  shouldShowPaladinLightseekerWarning,
  shouldShowPaladinRageWarning,
  shouldShowPaladinStatusTaunt,
  shouldShowRoninBlindWarning,
  shouldShowRoninRageWarning,
  shouldShowShowdownFatRageWarning,
  shouldShowSniperFireWarning,
  shouldShowSpiritWoodsGreatFloodDialogue,
  shouldShowSpiritWoodsPaladinStatusTaunt,
  shouldShowSpiritWoodsTreantFireTaunt,
  shouldShowSpiritWoodsTreantPoisonTaunt,
  shouldShowVirusEnemyStatusTaunt,
  shouldShowVirusPoisonWarning,
  shouldShowVoidCastleNemesisRageWarning,
  shouldShowWitchDoctorBlockedShotWarning,
  shouldShowWitchDoctorFireWarning,
  shouldShowWitchDoctorGhoulWarning,
  shouldShowWitchDoctorRageWarning,
  sniperFireWarningScript,
  spiritWoodsGreatFloodScript,
  spiritWoodsPaladinStatusTauntScript,
  spiritWoodsTreantFireTauntScript,
  spiritWoodsTreantPoisonTauntScript,
  virusEnemyStatusTauntScript,
  virusPoisonWarningScript,
  voidCastleNemesisRageWarningScript,
  voidCastleSplitScript,
  voidwoodEnemyFallScript,
  witchDoctorBlockedShotWarningScript,
  witchDoctorFireWarningScript,
  witchDoctorGhoulWarningScript,
  witchDoctorRageWarningScript,
} from "./campaign.js";

export function nextCampaignDialogueBeat({
  campaignMissionId,
  campaignMeta,
  state,
}) {
  if (campaignMissionId === FINAL_BATTLE_MISSION_ID) {
    const rules = getFinalBattleRules(state);
    if (!rules) return null;
    const stage = rules.stage;
    // A stage that has just been won outranks everything: this is the beat that reopens a
    // match the engine has already called for the player. The last duel leads into the last
    // stand instead of into another duel.
    if (rules.pendingStage && !campaignMeta.finalBattleStageShown[`won-${stage}`]) {
      return {
        markShown: () => { campaignMeta.finalBattleStageShown[`won-${stage}`] = true; },
        script: stage >= FINAL_BATTLE_DUEL_COUNT ? finalBattleLastStandScript : finalBattleDuelWonScript,
      };
    }
    // The duel that was just built, introducing itself.
    if (stage >= 1 && stage <= FINAL_BATTLE_DUEL_COUNT && !campaignMeta.finalBattleStageShown[`intro-${stage}`]) {
      return {
        markShown: () => { campaignMeta.finalBattleStageShown[`intro-${stage}`] = true; },
        script: finalBattleDuelScript,
      };
    }
    // RAGE first: Banish can end the run in one action, and it is the only warning that is
    // still actionable at the moment it fires (get off the dark tiles).
    if (shouldShowFinalBattleRageWarning(state, { warningShown: campaignMeta.finalBattleRageWarningShown })) {
      return {
        markShown: () => { campaignMeta.finalBattleRageWarningShown = true; },
        script: finalBattleRageWarningScript,
      };
    }
    if (shouldShowFinalBattleReachWarning(state, { warningShown: campaignMeta.finalBattleReachWarningShown })) {
      return {
        markShown: () => { campaignMeta.finalBattleReachWarningShown = true; },
        script: finalBattleReachWarningScript,
      };
    }
    return null;
  }
  if (campaignMissionId === VOID_CASTLE_MISSION_ID) {
    // The split outranks everything: it is the beat that reopens a match the engine has
    // already called for the player.
    if (state.missionRules?.voidCastleTrial?.pendingSplit && !campaignMeta.voidCastleSplitShown) {
      return { markShown: () => { campaignMeta.voidCastleSplitShown = true; }, script: voidCastleSplitScript };
    }
    if (shouldShowVoidCastleNemesisRageWarning(state, {
      warningShown: campaignMeta.voidCastleNemesisRageWarningShown,
    })) {
      return {
        markShown: () => { campaignMeta.voidCastleNemesisRageWarningShown = true; },
        script: voidCastleNemesisRageWarningScript,
      };
    }
    return null;
  }
  if (campaignMissionId === CLOD_MISSION_ID) {
    if (shouldShowClodRageWarning(state, { warningShown: campaignMeta.clodWarningShown, chargeUsed: campaignMeta.clodChargeUsed })) {
      return { markShown: () => { campaignMeta.clodWarningShown = true; }, script: clodRageWarningScript };
    }
    return null;
  }
  if (campaignMissionId === NECROMANCER_MISSION_ID) {
    if (shouldShowNecromancerStatusWarning(state, { warningShown: campaignMeta.statusWarningShown })) {
      return { markShown: () => { campaignMeta.statusWarningShown = true; }, script: necromancerStatusWarningScript };
    }
    if (shouldShowNecromancerSummonWarning(state, { warningShown: campaignMeta.summonWarningShown })) {
      return { markShown: () => { campaignMeta.summonWarningShown = true; }, script: necromancerSummonWarningScript };
    }
    if (shouldShowNecromancerRageWarning(state, { warningShown: campaignMeta.rageWarningShown })) {
      return { markShown: () => { campaignMeta.rageWarningShown = true; }, script: necromancerRageWarningScript };
    }
    return null;
  }
  if (campaignMissionId === WITCH_DOCTOR_MISSION_ID) {
    if (shouldShowWitchDoctorFireWarning(state, {
      warningShown: campaignMeta.fireWarningShown,
      fireDamageTakenCount: campaignMeta.fireDamageTakenCount,
    })) {
      return { markShown: () => { campaignMeta.fireWarningShown = true; }, script: witchDoctorFireWarningScript };
    }
    if (shouldShowWitchDoctorBlockedShotWarning(state, {
      warningShown: campaignMeta.blockedShotWarningShown,
      blockedShotQueued: campaignMeta.blockedShotQueued,
    })) {
      return {
        markShown: () => {
          campaignMeta.blockedShotWarningShown = true;
          campaignMeta.blockedShotQueued = false;
        },
        script: witchDoctorBlockedShotWarningScript,
      };
    }
    if (shouldShowWitchDoctorGhoulWarning(state, {
      warningShown: campaignMeta.ghoulWarningShown,
      ghoulBiteTakenCount: campaignMeta.ghoulBiteTakenCount,
    })) {
      return { markShown: () => { campaignMeta.ghoulWarningShown = true; }, script: witchDoctorGhoulWarningScript };
    }
    if (shouldShowWitchDoctorRageWarning(state, {
      warningShown: campaignMeta.witchDoctorRageWarningShown,
      blackDeathDanceUsed: campaignMeta.blackDeathDanceUsed,
    })) {
      return { markShown: () => { campaignMeta.witchDoctorRageWarningShown = true; }, script: witchDoctorRageWarningScript };
    }
    return null;
  }
  if (campaignMissionId === FATHER_TIME_MISSION_ID) {
    if (shouldShowFatherTimeRageWarning(state, {
      warningShown: campaignMeta.fatherTimeRageWarningShown,
      rewindUsed: campaignMeta.rewindUsed,
    })) {
      return { markShown: () => { campaignMeta.fatherTimeRageWarningShown = true; }, script: fatherTimeRageWarningScript };
    }
    return null;
  }
  if (campaignMissionId === VIRUS_MISSION_ID) {
    if (shouldShowVirusPoisonWarning(state, {
      warningShown: campaignMeta.virusPoisonWarningShown,
    })) {
      return { markShown: () => { campaignMeta.virusPoisonWarningShown = true; }, script: virusPoisonWarningScript };
    }
    if (shouldShowVirusEnemyStatusTaunt(state, {
      warningShown: campaignMeta.virusEnemyStatusTauntShown,
      playerAfflictedEnemyStatus: campaignMeta.playerAfflictedEnemyStatus,
    })) {
      return { markShown: () => { campaignMeta.virusEnemyStatusTauntShown = true; }, script: virusEnemyStatusTauntScript };
    }
    return null;
  }
  if (campaignMissionId === PALADIN_MISSION_ID) {
    if (shouldShowPaladinLightseekerWarning(state, {
      warningShown: campaignMeta.paladinLightseekerWarningShown,
      lightseekerDamageTakenCount: campaignMeta.paladinLightseekerDamageTakenCount,
    })) {
      return { markShown: () => { campaignMeta.paladinLightseekerWarningShown = true; }, script: paladinLightseekerWarningScript };
    }
    if (shouldShowPaladinStatusTaunt(state, {
      warningShown: campaignMeta.paladinStatusTauntShown,
      statusAttempted: campaignMeta.paladinStatusAttempted,
    })) {
      return { markShown: () => { campaignMeta.paladinStatusTauntShown = true; }, script: paladinStatusTauntScript };
    }
    if (shouldShowPaladinRageWarning(state, {
      warningShown: campaignMeta.paladinRageWarningShown,
    })) {
      return { markShown: () => { campaignMeta.paladinRageWarningShown = true; }, script: paladinRageWarningScript };
    }
    return null;
  }
  if (campaignMissionId === OUT_OF_RETIREMENT_MISSION_ID) {
    if (shouldShowPaladinLightseekerWarning(state, {
      warningShown: campaignMeta.paladinLightseekerWarningShown,
      lightseekerDamageTakenCount: campaignMeta.paladinLightseekerDamageTakenCount,
    })) {
      return { markShown: () => { campaignMeta.paladinLightseekerWarningShown = true; }, script: outOfRetirementLightseekerWarningScript };
    }
    if (
      !campaignMeta.paladinStatusTauntShown &&
      campaignMeta.paladinStatusAttempted &&
      state.phase === "playing" &&
      state.units.some((unit) => unit.player === 2 && (unit.type === "angel" || unit.type === "paladin") && unit.hp > 0)
    ) {
      return { markShown: () => { campaignMeta.paladinStatusTauntShown = true; }, script: outOfRetirementStatusTauntScript };
    }
    if (shouldShowOutOfRetirementAngelRageWarning(state, {
      warningShown: campaignMeta.angelRageWarningShown,
    })) {
      return { markShown: () => { campaignMeta.angelRageWarningShown = true; }, script: outOfRetirementAngelRageWarningScript };
    }
    return null;
  }
  if (campaignMissionId === VOIDWOOD_MISSION_ID) {
    for (const id of ["p2-0-treant", "p2-1-angel", "p2-2-witch-doctor", "p2-3-necromancer"]) {
      const unit = findUnit(state, id);
      if (unit?.hp <= 0 && !campaignMeta.voidwoodFallLinesShown[id]) {
        return {
          markShown: () => { campaignMeta.voidwoodFallLinesShown[id] = true; },
          script: (matchState) => voidwoodEnemyFallScript(matchState, id),
        };
      }
    }
    return null;
  }
  if (campaignMissionId === SPIRIT_WOODS_MISSION_ID) {
    if (shouldShowSpiritWoodsGreatFloodDialogue(state, {
      warningShown: campaignMeta.motherNatureGreatFloodDialogueShown,
      greatFloodUsed: campaignMeta.motherNatureGreatFloodUsed,
    })) {
      return {
        markShown: () => { campaignMeta.motherNatureGreatFloodDialogueShown = true; },
        script: spiritWoodsGreatFloodScript,
      };
    }
    if (shouldShowSpiritWoodsTreantPoisonTaunt(state, {
      warningShown: campaignMeta.spiritWoodsTreantPoisonTauntShown,
      poisonAttempted: campaignMeta.spiritWoodsTreantPoisonAttempted,
    })) {
      return {
        markShown: () => { campaignMeta.spiritWoodsTreantPoisonTauntShown = true; },
        script: spiritWoodsTreantPoisonTauntScript,
      };
    }
    if (shouldShowSpiritWoodsPaladinStatusTaunt(state, {
      warningShown: campaignMeta.spiritWoodsPaladinStatusTauntShown,
      statusAttempted: campaignMeta.paladinStatusAttempted,
    })) {
      return {
        markShown: () => { campaignMeta.spiritWoodsPaladinStatusTauntShown = true; },
        script: spiritWoodsPaladinStatusTauntScript,
      };
    }
    if (shouldShowSpiritWoodsTreantFireTaunt(state, {
      warningShown: campaignMeta.spiritWoodsTreantFireTauntShown,
      fireHit: campaignMeta.spiritWoodsTreantFireHit,
    })) {
      return {
        markShown: () => { campaignMeta.spiritWoodsTreantFireTauntShown = true; },
        script: spiritWoodsTreantFireTauntScript,
      };
    }
    return null;
  }
  if (campaignMissionId === SHOWDOWN_MISSION_ID) {
    for (const type of SHOWDOWN_FAT_TYPES) {
      if (shouldShowShowdownFatRageWarning(state, type, { warned: campaignMeta.showdownFatRageWarned[type] })) {
        return {
          markShown: () => {
            campaignMeta.showdownFatRageWarned[type] = true;
            campaignMeta.showdownAnyUnitEnteredRage = true;
          },
          script: (matchState) => showdownFatRageWarningScript(matchState, type),
        };
      }
    }
    return null;
  }
  if (campaignMissionId === NOT_MY_KING_MISSION_ID) {
    for (const type of NOT_MY_KING_ENEMY_TYPES) {
      if (shouldShowNotMyKingEnemyRageWarning(state, type, { warned: campaignMeta.notMyKingEnemyRageWarned[type] })) {
        return {
          markShown: () => {
            campaignMeta.notMyKingEnemyRageWarned[type] = true;
            campaignMeta.notMyKingEnemyEnteredRage = true;
          },
          script: (matchState) => notMyKingEnemyRageWarningScript(matchState, type),
        };
      }
    }
    return null;
  }
  if (campaignMissionId === GARGOYLE_MISSION_ID) {
    if (shouldShowGargoyleRageWarning(state, {
      warningShown: campaignMeta.gargoyleRageWarningShown,
    })) {
      return {
        markShown: () => {
          campaignMeta.gargoyleRageWarningShown = true;
          campaignMeta.gargoyleEnteredRage = true;
        },
        script: gargoyleRageWarningScript,
      };
    }
    return null;
  }
  if (campaignMissionId === SNIPER_MISSION_ID) {
    if (shouldShowSniperFireWarning(state, {
      warningShown: campaignMeta.sniperFireWarningShown,
      fireDamageTakenCount: campaignMeta.fireDamageTakenCount,
    })) {
      return { markShown: () => { campaignMeta.sniperFireWarningShown = true; }, script: sniperFireWarningScript };
    }
    return null;
  }
  if (campaignMissionId === MINER_MISSION_ID) {
    if (shouldShowMinerBlastingCapSplashWarning(state, {
      warningShown: campaignMeta.minerBlastingCapSplashWarningShown,
      minerBlastingCapSplashTakenCount: campaignMeta.minerBlastingCapSplashTakenCount,
    })) {
      return {
        markShown: () => { campaignMeta.minerBlastingCapSplashWarningShown = true; },
        script: minerBlastingCapSplashWarningScript,
      };
    }
    if (shouldShowMinerRageWarning(state, {
      warningShown: campaignMeta.minerRageWarningShown,
      minerRageHarvested: campaignMeta.minerRageHarvested,
    })) {
      return {
        markShown: () => {
          campaignMeta.minerRageWarningShown = true;
          campaignMeta.minerEnteredRage = true;
        },
        script: minerRageWarningScript,
      };
    }
    return null;
  }
  if (campaignMissionId === HASBEEN_HEROES_MISSION_ID) {
    // Each fat member gets ONE popup the first time it enters RAGE. Progression is not
    // gated on these — the player is meant to avoid pushing them this far. Fire them in
    // fielding order, one per check, so simultaneous rages queue instead of colliding.
    for (const type of HASBEEN_HEROES_FAT_TYPES) {
      if (shouldShowHasbeenFatRageWarning(state, type, { warned: campaignMeta.hasbeenFatRageWarned[type] })) {
        return {
          markShown: () => { campaignMeta.hasbeenFatRageWarned[type] = true; },
          script: (matchState) => hasbeenFatRageWarningScript(matchState, type),
        };
      }
    }
    return null;
  }
  if (campaignMissionId === RONIN_MISSION_ID) {
    if (shouldShowRoninBlindWarning(state, {
      warningShown: campaignMeta.roninBlindWarningShown,
      roninBlindApplied: campaignMeta.roninBlindApplied,
    })) {
      return {
        markShown: () => { campaignMeta.roninBlindWarningShown = true; },
        script: roninBlindWarningScript,
      };
    }
    if (shouldShowRoninRageWarning(state, {
      warningShown: campaignMeta.roninRageWarningShown,
    })) {
      return {
        markShown: () => {
          campaignMeta.roninRageWarningShown = true;
          campaignMeta.roninEnteredRage = true;
        },
        script: roninRageWarningScript,
      };
    }
    return null;
  }
  if (campaignMissionId === BROTHERS_MISSION_ID) {
    // Each brother gets ONE popup the first time it enters RAGE. Firing it also latches the
    // "kill before RAGE" star fail. Big Brother first, then Little Brother, one per check.
    for (const type of ["big-brother", "little-brother"]) {
      if (shouldShowBrothersRageWarning(state, type, { warned: campaignMeta.brothersRageWarned[type] })) {
        return {
          markShown: () => {
            campaignMeta.brothersRageWarned[type] = true;
            campaignMeta.brothersEnteredRage = true;
          },
          script: (matchState) => brothersRageWarningScript(matchState, type),
        };
      }
    }
    return null;
  }
  return null;
}

