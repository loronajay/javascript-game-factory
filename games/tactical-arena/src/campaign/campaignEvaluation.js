import {
  CAMPAIGN_PROGRESS_KEY,
  CLOD_MISSION_ID,
  NECROMANCER_MISSION_ID,
  WITCH_DOCTOR_MISSION_ID,
  FATHER_TIME_MISSION_ID,
  VIRUS_MISSION_ID,
  PALADIN_MISSION_ID,
  MONK_MISSION_ID,
  BROTHERS_MISSION_ID,
  GARGOYLE_MISSION_ID,
  SNIPER_MISSION_ID,
  WANDERING_PARTY_MISSION_ID,
  MINER_MISSION_ID,
  HASBEEN_HEROES_MISSION_ID,
  RONIN_MISSION_ID,
  WRONG_PLACE_MISSION_ID,
  OUT_OF_RETIREMENT_MISSION_ID,
  VOIDWOOD_MISSION_ID,
  SPIRIT_WOODS_MISSION_ID,
  SHOWDOWN_MISSION_ID,
  NOT_MY_KING_MISSION_ID,
  VOID_CASTLE_MISSION_ID,
  FINAL_BATTLE_MISSION_ID,
  WANDERING_PARTY_SKIN_PACK,
  HASBEEN_MYSTIC_SKIN_PACK,
  HASBEEN_HEROES_FAT_TYPES,
  SHOWDOWN_FAT_TYPES,
  NOT_MY_KING_ENEMY_TYPES,
  VOIDWOOD_SKIN_REWARDS,
  WITCH_DOCTOR_BOARD_SIZE,
  WITCH_DOCTOR_HEAL_CAST_CAP,
  MIN_CAMPAIGN_SQUAD_SIZE,
  MAX_CAMPAIGN_SQUAD_SIZE,
  MAX_CAMPAIGN_MISSIONS,
} from "./campaignConstants.js";
import { getUnitType } from "../core/unitCatalog.js";
import { STARTER_UNIT_TYPES, readUnlockProgress, writeUnlockProgress } from "../progression/unlocks.js";
import { grantCampaignMissionValor } from "../progression/valorRewards.js";
import { enqueueDraftBattleUnlockAnnouncement, enqueueSkinUnlockAnnouncements, enqueueUnitUnlockAnnouncements } from "../progression/announcements.js";
import {
  buildCampaignSkinRewardClaim,
  buildCampaignUnitRewardClaim,
  enqueueGameProgressClaim,
} from "../platform/gameProgressClient.js";
import { getCampaignMission } from "./campaignModel.js";
import { defaultStorage, readCampaignProgress, writeCampaignProgress } from "./campaignProgress.js";

export function evaluateCampaignMission(missionId, state, meta = {}) {
  const mission = getCampaignMission(missionId);
  const victory = state?.winner === 1;
  const playerUnits = (state?.units ?? []).filter((unit) => unit.player === 1);
  const enemyUnits = (state?.units ?? []).filter((unit) => unit.player === 2);
  const survivingPlayerUnits = playerUnits.filter((unit) => unit.hp > 0).length;
  const allSurvived = victory && survivingPlayerUnits === playerUnits.length;

  // Base objectives shared by every mission; the third star + the bonus are the
  // mission's signature lesson. Only two missions exist, so branch rather than build a
  // premature objective DSL (see MISSION_2 plan's implementation notes).
  const complete = { id: "complete", label: "Complete the mission", earned: victory };
  const survive = { id: "survive", label: "Keep both chosen units alive", earned: allSurvived };

  let objectives;
  let bonusObjectives;
  let extra;
  if (missionId === NECROMANCER_MISSION_ID) {
    const cleanseUsed = Boolean(meta.cleanseUsed);
    const spreadHitCount = Math.max(0, Math.floor(Number(meta.spreadHitCount) || 0));
    objectives = [
      complete,
      survive,
      { id: "cleansed", label: "Win after curing a status with a cleanse", earned: victory && cleanseUsed },
    ];
    bonusObjectives = [
      { id: "spread", label: "Bonus: never let a status spread between your units", earned: victory && spreadHitCount === 0 },
    ];
    extra = {
      cleanseUsed,
      spreadHitCount,
      necromancerDefeated: Boolean((enemyUnits.find((unit) => unit.type === "necromancer") ?? { hp: 0 }).hp <= 0),
    };
  } else if (missionId === WITCH_DOCTOR_MISSION_ID) {
    const ghoulsDefeatedCount = Math.max(0, Math.floor(Number(meta.ghoulsDefeatedCount) || 0));
    const fireDamageTakenCount = Math.max(0, Math.floor(Number(meta.fireDamageTakenCount) || 0));
    const ghoulBiteTakenCount = Math.max(0, Math.floor(Number(meta.ghoulBiteTakenCount) || 0));
    const blackDeathDanceUsed = Boolean(meta.blackDeathDanceUsed);
    const witchDoctor = enemyUnits.find((unit) => unit.type === "witch-doctor") ?? null;
    objectives = [
      complete,
      { id: "ghoulCleared", label: "Defeat at least one Ghoul", earned: victory && ghoulsDefeatedCount >= 1 },
      { id: "unscathed", label: "Avoid fire damage and Ghoul Bite hits", earned: victory && fireDamageTakenCount === 0 && ghoulBiteTakenCount === 0 },
    ];
    bonusObjectives = [
      { id: "noBlackDeath", label: "Bonus: win before Black Death Dance resolves", earned: victory && !blackDeathDanceUsed },
    ];
    extra = {
      witchDoctorDefeated: Boolean(witchDoctor && witchDoctor.hp <= 0),
      ghoulsDefeatedCount,
      fireDamageTakenCount,
      ghoulBiteTakenCount,
      blackDeathDanceUsed,
    };
  } else if (missionId === FATHER_TIME_MISSION_ID) {
    const archer = enemyUnits.find((unit) => unit.type === "archer") ?? null;
    const archerDefeatedBeforeFatherTime = Boolean(meta.archerDefeatedBeforeFatherTime);
    const archerBlinded = Boolean(meta.archerBlinded) ||
      Boolean(archer?.statuses?.some((status) => status.type === "blind"));
    const rewindUsed = Boolean(meta.rewindUsed);
    const fatherTime = enemyUnits.find((unit) => unit.type === "father-time") ?? null;
    objectives = [
      { id: "survive", label: "Lose no units", earned: allSurvived },
      { id: "archerFirst", label: "Defeat the Archer before Father Time", earned: victory && archerDefeatedBeforeFatherTime },
      { id: "noRewind", label: "Prevent Rewind from happening", earned: victory && !rewindUsed },
    ];
    bonusObjectives = [
      { id: "blindArcher", label: "Bonus: blind the Archer", earned: victory && archerBlinded },
    ];
    extra = {
      fatherTimeDefeated: Boolean(fatherTime && fatherTime.hp <= 0),
      archerDefeated: Boolean(archer && archer.hp <= 0),
      archerDefeatedBeforeFatherTime,
      archerBlinded,
      rewindUsed,
    };
  } else if (missionId === VIRUS_MISSION_ID) {
    const spreadHitCount = Math.max(0, Math.floor(Number(meta.spreadHitCount) || 0));
    const draftedMystic = playerUnits.some((unit) => unit.type === "mystic");
    const draftedWitchDoctor = playerUnits.some((unit) => unit.type === "witch-doctor");
    const virusesDefeated = enemyUnits.filter((unit) => unit.type === "virus" && unit.hp <= 0).length;
    const witchDoctor = enemyUnits.find((unit) => unit.type === "witch-doctor") ?? null;
    objectives = [
      complete,
      { id: "noSpread", label: "Prevent Virus Spread from happening", earned: victory && spreadHitCount === 0 },
      { id: "draftMystic", label: "Draft Mystic into your squad", earned: victory && draftedMystic },
    ];
    bonusObjectives = [
      { id: "mysticWitchDoctor", label: "Bonus: win with Mystic and Witch Doctor together", earned: victory && draftedMystic && draftedWitchDoctor },
    ];
    extra = {
      spreadHitCount,
      draftedMystic,
      draftedWitchDoctor,
      virusesDefeated,
      witchDoctorDefeated: Boolean(witchDoctor && witchDoctor.hp <= 0),
    };
  } else if (missionId === PALADIN_MISSION_ID) {
    const paladinLightseekerDamageTakenCount = Math.max(0, Math.floor(Number(meta.paladinLightseekerDamageTakenCount) || 0));
    const paladinStatusAttempted = Boolean(meta.paladinStatusAttempted);
    const duelist = playerUnits[0] ?? null;
    const draftedMelee = Boolean(duelist && getUnitType(duelist.type).classType === "melee");
    const paladin = enemyUnits.find((unit) => unit.type === "paladin") ?? null;
    objectives = [
      complete,
      { id: "noLightseeker", label: "Avoid Lightseeker damage", earned: victory && paladinLightseekerDamageTakenCount === 0 },
      { id: "noStatus", label: "Do not try status effects on the Paladin", earned: victory && !paladinStatusAttempted },
    ];
    bonusObjectives = [
      { id: "meleeDuel", label: "Bonus: win the challenge with a melee unit", earned: victory && draftedMelee },
    ];
    extra = {
      paladinDefeated: Boolean(paladin && paladin.hp <= 0),
      paladinLightseekerDamageTakenCount,
      paladinStatusAttempted,
      draftedMelee,
    };
  } else if (missionId === VOID_CASTLE_MISSION_ID) {
    // Three stars: win the two-part battle / never let a Nemesis reach RAGE in phase 1 /
    // solve phase 2 cleanly, felling the real Summoner without cutting down a single decoy.
    // The bonus is the starter four, the same "you brought who you started with" nod
    // Has-Been Heroes uses.
    const voidCastleNemesisEnteredRage = Boolean(meta.voidCastleNemesisEnteredRage);
    const voidCastleDecoyKilled = Boolean(meta.voidCastleDecoyKilled);
    const playerTypes = new Set(playerUnits.map((unit) => unit.type));
    const broughtStarterSquad = STARTER_UNIT_TYPES.every((type) => playerTypes.has(type));
    const realSummoner = enemyUnits.find((unit) => unit.trialRealSummoner) ??
      enemyUnits.find((unit) => unit.id === state?.missionRules?.voidCastleTrial?.realSummonerId) ??
      null;
    objectives = [
      complete,
      { id: "noNemesisRage", label: "Never let a Nemesis reach RAGE", earned: victory && !voidCastleNemesisEnteredRage },
      { id: "cleanSolve", label: "Fell the true Summoner without felling a copy", earned: victory && !voidCastleDecoyKilled },
    ];
    bonusObjectives = [
      { id: "starterSquad", label: "Bonus: bring the original starter four", earned: victory && broughtStarterSquad },
    ];
    extra = {
      voidCastleNemesisEnteredRage,
      voidCastleDecoyKilled,
      broughtStarterSquad,
      realSummonerDefeated: Boolean(realSummoner && realSummoner.hp <= 0),
      decoySummonersDefeated: enemyUnits.filter((unit) => unit.trialDecoySummoner && unit.hp <= 0).length,
    };
  } else if (missionId === MONK_MISSION_ID) {
    const monkBlindAttempted = Boolean(meta.monkBlindAttempted);
    const monkFakeKilledBeforeReal = Boolean(meta.monkFakeKilledBeforeReal);
    const realMonk = enemyUnits.find((unit) => unit.trialRealMonk) ??
      enemyUnits.find((unit) => unit.id === state?.missionRules?.monkTrial?.realMonkId) ??
      null;
    const fakeMonksDefeated = enemyUnits.filter((unit) => unit.trialFakeMonk && unit.hp <= 0).length;
    objectives = [
      complete,
      { id: "survive", label: "Lose no party members", earned: allSurvived },
      { id: "noBlind", label: "Do not try to blind any Monk", earned: victory && !monkBlindAttempted },
    ];
    bonusObjectives = [
      { id: "realFirst", label: "Bonus: defeat the real Monk before any fake Monk", earned: victory && !monkFakeKilledBeforeReal },
    ];
    extra = {
      realMonkDefeated: Boolean(realMonk && realMonk.hp <= 0),
      fakeMonksDefeated,
      monkBlindAttempted,
      monkFakeKilledBeforeReal,
    };
  } else if (missionId === GARGOYLE_MISSION_ID) {
    const gargoylePyroclasmDamageTakenCount = Math.max(0, Math.floor(Number(meta.gargoylePyroclasmDamageTakenCount) || 0));
    const fireDamageTakenCount = Math.max(0, Math.floor(Number(meta.fireDamageTakenCount) || 0));
    const gargoyleEnteredRage = Boolean(meta.gargoyleEnteredRage);
    const gargoyle = enemyUnits.find((unit) => unit.type === "gargoyle") ?? null;
    objectives = [
      complete,
      { id: "noPyroclasm", label: "Avoid Pyroclasm damage", earned: victory && gargoylePyroclasmDamageTakenCount === 0 },
      { id: "noFire", label: "Avoid fire space damage", earned: victory && fireDamageTakenCount === 0 },
    ];
    bonusObjectives = [
      { id: "preRageKill", label: "Bonus: defeat the Gargoyle before Volcanic Rage", earned: victory && !gargoyleEnteredRage },
    ];
    extra = {
      gargoyleDefeated: Boolean(gargoyle && gargoyle.hp <= 0),
      gargoylePyroclasmDamageTakenCount,
      fireDamageTakenCount,
      gargoyleEnteredRage,
    };
  } else if (missionId === FINAL_BATTLE_MISSION_ID) {
    // The finale is graded on one thing: did you win it. Winning means surviving four mirror
    // duels AND the last stand, so a per-objective breakdown here would only be re-scoring
    // the same fight three times. All three stars ride the victory, and there is no bonus
    // star — nothing is being held back from the player on the last mission of the game.
    const blacksword = enemyUnits.find((unit) => unit.type === "blacksword") ?? null;
    objectives = [
      { id: "duels", label: "Hold on to all four of yourselves", earned: victory },
      { id: "lastStand", label: "Defeat Blacksword", earned: victory },
      { id: "complete", label: "Drive the void back through the gate", earned: victory },
    ];
    bonusObjectives = [];
    extra = {
      blackswordDefeated: Boolean(blacksword && blacksword.hp <= 0),
      finalBattleBanished: Boolean(meta.finalBattleBanished),
    };
  } else if (missionId === WANDERING_PARTY_MISSION_ID) {
    // A friendly duel with no puzzle: winning is the whole objective. All three stars are
    // tied to the win so a victory is a flat 3/3, and there is no bonus objective.
    objectives = [
      { id: "complete", label: "Win the friendly challenge", earned: victory },
      { id: "bestParty", label: "Best all four wanderers", earned: victory },
      { id: "costume", label: "Earn the traveler's costume", earned: victory },
    ];
    bonusObjectives = [];
    extra = { rewardSkinPack: mission?.rewardSkinPack ?? WANDERING_PARTY_SKIN_PACK };
  } else if (missionId === HASBEEN_HEROES_MISSION_ID) {
    // Win / take no Fart displacement (blocked-shove) true damage / keep everyone alive.
    // Bonus: field the original starter four (Swordsman, Archer, Mystic, Magician).
    const fartDisplacementDamageTakenCount = Math.max(0, Math.floor(Number(meta.fartDisplacementDamageTakenCount) || 0));
    const playerTypes = new Set(playerUnits.map((unit) => unit.type));
    const broughtStarterSquad = STARTER_UNIT_TYPES.every((type) => playerTypes.has(type));
    objectives = [
      complete,
      { id: "noFartShove", label: "Take no Fart displacement damage", earned: victory && fartDisplacementDamageTakenCount === 0 },
      survive,
    ];
    bonusObjectives = [
      { id: "starterSquad", label: "Bonus: bring the original starter four", earned: victory && broughtStarterSquad },
    ];
    extra = {
      fartDisplacementDamageTakenCount,
      broughtStarterSquad,
      rewardSkinPack: mission?.rewardSkinPack ?? HASBEEN_MYSTIC_SKIN_PACK,
      fatSquadDefeated: enemyUnits.filter((unit) => HASBEEN_HEROES_FAT_TYPES.includes(unit.type) && unit.hp <= 0).length,
    };
  } else if (missionId === RONIN_MISSION_ID) {
    const roninBlindApplied = Boolean(meta.roninBlindApplied) ||
      playerUnits.some((unit) => unit.statuses?.some((status) => status.type === "blind"));
    const roninEnteredRage = Boolean(meta.roninEnteredRage);
    const draftedSwordsman = playerUnits.some((unit) => unit.type === "swordsman");
    const ronin = enemyUnits.find((unit) => unit.type === "ronin") ?? null;
    objectives = [
      { id: "complete", label: "Win the duel", earned: victory },
      { id: "noBlind", label: "Avoid being blinded by the Ronin", earned: victory && !roninBlindApplied },
      { id: "preRageKill", label: "Defeat the Ronin before Final Draw", earned: victory && !roninEnteredRage },
    ];
    bonusObjectives = [
      { id: "swordsmanDuelist", label: "Bonus: recruit the Swordsman for the duel", earned: victory && draftedSwordsman },
    ];
    extra = {
      roninDefeated: Boolean(ronin && ronin.hp <= 0),
      roninBlindApplied,
      roninEnteredRage,
      draftedSwordsman,
    };
  } else if (missionId === WRONG_PLACE_MISSION_ID) {
    const wrongPlacePlayerStunned = Boolean(meta.wrongPlacePlayerStunned) ||
      playerUnits.some((unit) => unit.statuses?.some((status) => status.type === "stun"));
    const wrongPlaceNukedAllEnemies = Boolean(meta.wrongPlaceNukedAllEnemies);
    objectives = [
      { id: "complete", label: "Win the duel", earned: victory },
      { id: "survive", label: "Keep all party members alive", earned: allSurvived },
      { id: "noStun", label: "Avoid stun status", earned: victory && !wrongPlacePlayerStunned },
    ];
    bonusObjectives = [
      { id: "nukeAll", label: "Bonus: hit every enemy with Magician's Nuke", earned: victory && wrongPlaceNukedAllEnemies },
    ];
    extra = {
      wrongPlacePlayerStunned,
      wrongPlaceNukedAllEnemies,
      riotCopsDefeated: enemyUnits.filter((unit) => unit.type === "riot-cop" && unit.hp <= 0).length,
    };
  } else if (missionId === OUT_OF_RETIREMENT_MISSION_ID) {
    const paladinLightseekerDamageTakenCount = Math.max(0, Math.floor(Number(meta.paladinLightseekerDamageTakenCount) || 0));
    const paladinStatusAttempted = Boolean(meta.paladinStatusAttempted);
    const angelDefeatedBeforePaladin = Boolean(meta.angelDefeatedBeforePaladin);
    const angel = enemyUnits.find((unit) => unit.type === "angel") ?? null;
    const paladin = enemyUnits.find((unit) => unit.type === "paladin") ?? null;
    objectives = [
      { id: "complete", label: "Win the duel", earned: victory },
      { id: "noLightseeker", label: "Avoid Lightseeker damage", earned: victory && paladinLightseekerDamageTakenCount === 0 },
      { id: "noStatus", label: "Do not try status effects on them", earned: victory && !paladinStatusAttempted },
    ];
    bonusObjectives = [
      { id: "angelFirst", label: "Bonus: defeat Angel first", earned: victory && angelDefeatedBeforePaladin },
    ];
    extra = {
      angelDefeated: Boolean(angel && angel.hp <= 0),
      paladinDefeated: Boolean(paladin && paladin.hp <= 0),
      angelDefeatedBeforePaladin,
      paladinLightseekerDamageTakenCount,
      paladinStatusAttempted,
      rewardSkins: [...(mission?.rewardSkins ?? [])],
    };
  } else if (missionId === SPIRIT_WOODS_MISSION_ID) {
    const paladinLightseekerDamageTakenCount = Math.max(0, Math.floor(Number(meta.paladinLightseekerDamageTakenCount) || 0));
    const motherNatureGreatFloodUsed = Boolean(meta.motherNatureGreatFloodUsed);
    const playerTypes = new Set(playerUnits.map((unit) => unit.type));
    const broughtStarterSquad = STARTER_UNIT_TYPES.every((type) => playerTypes.has(type));
    objectives = [
      { id: "complete", label: "Win the duel", earned: victory },
      { id: "noLightseeker", label: "Avoid Lightseeker damage", earned: victory && paladinLightseekerDamageTakenCount === 0 },
      { id: "noGreatFlood", label: "Avoid Mother Nature's RAGE art", earned: victory && !motherNatureGreatFloodUsed },
    ];
    bonusObjectives = [
      { id: "starterSquad", label: "Bonus: draft the starter squad", earned: victory && broughtStarterSquad },
    ];
    extra = {
      motherNatureDefeated: enemyUnits.some((unit) => unit.type === "mother-nature" && unit.hp <= 0),
      treantDefeated: enemyUnits.some((unit) => unit.type === "treant" && unit.hp <= 0),
      clodDefeated: enemyUnits.some((unit) => unit.type === "clod" && unit.hp <= 0),
      paladinDefeated: enemyUnits.some((unit) => unit.type === "paladin" && unit.hp <= 0),
      paladinLightseekerDamageTakenCount,
      motherNatureGreatFloodUsed,
      broughtStarterSquad,
    };
  } else if (missionId === SHOWDOWN_MISSION_ID) {
    const showdownAnyUnitEnteredRage = Boolean(meta.showdownAnyUnitEnteredRage);
    const showdownFootworkHitAllEnemies = Boolean(meta.showdownFootworkHitAllEnemies);
    objectives = [
      { id: "complete", label: "Win the duel", earned: victory },
      { id: "rageEntered", label: "Have any unit enter RAGE", earned: victory && showdownAnyUnitEnteredRage },
      { id: "survive", label: "Keep all party members alive", earned: allSurvived },
    ];
    bonusObjectives = [
      { id: "footworkAll", label: "Bonus: hit all enemy units with one Footwork while they are standing", earned: victory && showdownFootworkHitAllEnemies },
    ];
    extra = {
      showdownAnyUnitEnteredRage,
      showdownFootworkHitAllEnemies,
      fatPartyDefeated: enemyUnits.filter((unit) => SHOWDOWN_FAT_TYPES.includes(unit.type) && unit.hp <= 0).length,
    };
  } else if (missionId === NOT_MY_KING_MISSION_ID) {
    const notMyKingEnemyEnteredRage = Boolean(meta.notMyKingEnemyEnteredRage);
    objectives = [
      { id: "complete", label: "Win the duel", earned: victory },
      { id: "noEnemyRage", label: "Avoid any enemy reaching RAGE", earned: victory && !notMyKingEnemyEnteredRage },
      { id: "survive", label: "Keep all party members alive", earned: allSurvived },
    ];
    bonusObjectives = [];
    extra = {
      notMyKingEnemyEnteredRage,
      voidCrownDefeated: enemyUnits.filter((unit) => NOT_MY_KING_ENEMY_TYPES.includes(unit.type) && unit.hp <= 0).length,
    };
  } else if (missionId === VOIDWOOD_MISSION_ID) {
    const voidwoodDarkBombDamageTakenCount = Math.max(0, Math.floor(Number(meta.voidwoodDarkBombDamageTakenCount) || 0));
    const ghoulBiteTakenCount = Math.max(0, Math.floor(Number(meta.ghoulBiteTakenCount) || 0));
    const playerMagicDamageDealtCount = Math.max(0, Math.floor(Number(meta.playerMagicDamageDealtCount) || 0));
    objectives = [
      { id: "complete", label: "Win the duel", earned: victory },
      { id: "noDarkBomb", label: "Avoid Dark Bomb damage", earned: victory && voidwoodDarkBombDamageTakenCount === 0 },
      { id: "noGhoulBite", label: "Avoid Ghoul Bite damage", earned: victory && ghoulBiteTakenCount === 0 },
    ];
    bonusObjectives = [
      { id: "noMagicDamage", label: "Bonus: win without using magic damage", earned: victory && playerMagicDamageDealtCount === 0 },
    ];
    extra = {
      voidwoodDarkBombDamageTakenCount,
      ghoulBiteTakenCount,
      playerMagicDamageDealtCount,
      treantDefeated: enemyUnits.some((unit) => unit.type === "treant" && unit.hp <= 0),
      angelDefeated: enemyUnits.some((unit) => unit.type === "angel" && unit.hp <= 0),
      witchDoctorDefeated: enemyUnits.some((unit) => unit.type === "witch-doctor" && unit.hp <= 0),
      necromancerDefeated: enemyUnits.some((unit) => unit.type === "necromancer" && unit.hp <= 0),
      rewardSkins: [...(mission?.rewardSkins ?? [])],
    };
  } else if (missionId === SNIPER_MISSION_ID) {
    const wallDestroyedCount = Math.max(0, Math.floor(Number(meta.wallDestroyedCount) || 0));
    const fireDamageTakenCount = Math.max(0, Math.floor(Number(meta.fireDamageTakenCount) || 0));
    const sniper = enemyUnits.find((unit) => unit.type === "sniper") ?? null;
    const sniperBlinded = Boolean(meta.sniperBlinded) ||
      Boolean(sniper?.statuses?.some((status) => status.type === "blind"));
    objectives = [
      complete,
      { id: "wallBreak", label: "Destroy a wall tile", earned: victory && wallDestroyedCount >= 1 },
      { id: "noFire", label: "Avoid fire damage", earned: victory && fireDamageTakenCount === 0 },
    ];
    bonusObjectives = [
      { id: "blindSniper", label: "Bonus: blind the Sniper", earned: victory && sniperBlinded },
    ];
    extra = {
      sniperDefeated: Boolean(sniper && sniper.hp <= 0),
      wallDestroyedCount,
      fireDamageTakenCount,
      sniperBlinded,
    };
  } else if (missionId === MINER_MISSION_ID) {
    const minerBlastingCapSplashTakenCount = Math.max(0, Math.floor(Number(meta.minerBlastingCapSplashTakenCount) || 0));
    const minerEnteredRage = Boolean(meta.minerEnteredRage);
    const draftedSniper = playerUnits.some((unit) => unit.type === "sniper");
    const miner = enemyUnits.find((unit) => unit.type === "miner") ?? null;
    objectives = [
      complete,
      { id: "noBlastingCapSplash", label: "Avoid Blasting Cap splash damage", earned: victory && minerBlastingCapSplashTakenCount === 0 },
      { id: "preRageKill", label: "Defeat the Miner before Diamond Harvester", earned: victory && !minerEnteredRage },
    ];
    bonusObjectives = [
      { id: "sniperDuelist", label: "Bonus: bring the Sniper to the duel", earned: victory && draftedSniper },
    ];
    extra = {
      minerDefeated: Boolean(miner && miner.hp <= 0),
      minerBlastingCapSplashTakenCount,
      minerEnteredRage,
      draftedSniper,
    };
  } else if (missionId === BROTHERS_MISSION_ID) {
    // Win / never let one Flamethrower cone catch both your units / kill both before RAGE.
    // Bonus: lose no units. flamethrowerBothHitCount counts single casts (the active ART or
    // the Flamespitter free cone) that damaged two of the player's units at once.
    const flamethrowerBothHitCount = Math.max(0, Math.floor(Number(meta.flamethrowerBothHitCount) || 0));
    const brothersEnteredRage = Boolean(meta.brothersEnteredRage);
    const bigBrother = enemyUnits.find((unit) => unit.type === "big-brother") ?? null;
    const littleBrother = enemyUnits.find((unit) => unit.type === "little-brother") ?? null;
    objectives = [
      complete,
      { id: "noDoubleFlame", label: "Never let Flamethrower catch both your units at once", earned: victory && flamethrowerBothHitCount === 0 },
      { id: "preRageKill", label: "Defeat both brothers before either RAGES", earned: victory && !brothersEnteredRage },
    ];
    bonusObjectives = [
      { id: "survive", label: "Bonus: lose no units", earned: allSurvived },
    ];
    extra = {
      bigBrotherDefeated: Boolean(bigBrother && bigBrother.hp <= 0),
      littleBrotherDefeated: Boolean(littleBrother && littleBrother.hp <= 0),
      flamethrowerBothHitCount,
      brothersEnteredRage,
    };
  } else {
    const clodChargeHitCount = Math.max(0, Math.floor(Number(meta.clodChargeHitCount) || 0));
    const chargeDefended = Boolean(meta.chargeDefended);
    const clod = enemyUnits.find((unit) => unit.type === "clod") ?? null;
    objectives = [
      complete,
      survive,
      { id: "spacing", label: "Have Clod only hit one unit with Thunderous Charge", earned: victory && clodChargeHitCount <= 1 },
    ];
    bonusObjectives = [
      { id: "brace", label: "Bonus: defend against Thunderous Charge", earned: victory && chargeDefended },
    ];
    extra = {
      clodDefeated: Boolean(clod && clod.hp <= 0),
      clodChargeHitCount,
      chargeDefended,
    };
  }

  const earnedObjectiveStars = objectives.filter((objective) => objective.earned).length;
  const earnedBonusStars = bonusObjectives.filter((objective) => objective.earned).length;
  const stars = Math.min(3, earnedObjectiveStars + earnedBonusStars);
  return {
    missionId,
    missionTitle: mission?.title ?? "Campaign Mission",
    victory,
    stars,
    grade: stars === 3 ? "S" : stars === 2 ? "A" : stars === 1 ? "B" : "C",
    objectives,
    bonusObjectives,
    earnedBonusStars,
    rewardUnits: victory && !mission?.rewardUnitChoicePack ? [...(mission?.rewardUnits ?? [])] : [],
    rewardUnitChoicePack: victory ? mission?.rewardUnitChoicePack ?? null : null,
    survivingPlayerUnits,
    totalPlayerUnits: playerUnits.length,
    playerHpRemaining: playerUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0),
    enemyHpRemaining: enemyUnits.reduce((sum, unit) => sum + Math.max(0, unit.hp), 0),
    ...extra,
  };
}

export function completeCampaignMission(storage = defaultStorage(), missionId, state, meta = {}) {
  const evaluation = evaluateCampaignMission(missionId, state, meta);
  const current = readCampaignProgress(storage);
  const mission = getCampaignMission(missionId);
  const valorReward = Math.max(0, Math.floor(Number(mission?.valorReward) || 0));
  const valorWasClaimed = readUnlockProgress(storage).campaignValorRewards.includes(missionId);
  if (!evaluation.victory) {
    return {
      ...evaluation,
      progress: current,
      newRewardUnits: [],
      newRewardSkins: [],
      valorReward,
      valorGranted: 0,
      valorClaimed: valorWasClaimed,
    };
  }

  const completedMissions = new Set(current.completedMissions);
  completedMissions.add(missionId);
  const previousStars = current.missionStars[missionId] ?? 0;
  const progress = writeCampaignProgress(storage, {
    ...current,
    completedMissions: [...completedMissions],
    missionStars: {
      ...current.missionStars,
      [missionId]: Math.max(previousStars, evaluation.stars),
    },
  });

  const valorGrant = grantCampaignMissionValor(storage, missionId, valorReward, { stars: evaluation.stars });
  const unlockProgress = valorGrant.progress;
  const existing = new Set(unlockProgress.unlockedUnits);
  const newRewardUnits = evaluation.rewardUnits.filter((type) => !existing.has(type));
  const existingSkins = new Set((unlockProgress.unlockedSkins ?? []).map((skin) => `${skin.type}:${skin.slug}`));
  const rewardSkins = Array.isArray(evaluation.rewardSkins) ? evaluation.rewardSkins : [];
  const newRewardSkins = rewardSkins.filter((skin) => !existingSkins.has(`${skin.type}:${skin.slug}`));
  writeUnlockProgress(storage, {
    ...unlockProgress,
    unlockedUnits: [...existing, ...evaluation.rewardUnits],
    campaignGrantedSkins: [
      ...(unlockProgress.campaignGrantedSkins ?? []),
      ...rewardSkins,
    ],
  });
  for (const type of newRewardUnits) {
    enqueueGameProgressClaim(storage, buildCampaignUnitRewardClaim({
      missionId,
      type,
      stars: evaluation.stars,
    }));
  }
  for (const skin of newRewardSkins) {
    enqueueGameProgressClaim(storage, buildCampaignSkinRewardClaim({
      missionId,
      skin,
      stars: evaluation.stars,
    }));
  }
  enqueueUnitUnlockAnnouncements(storage, newRewardUnits);
  enqueueSkinUnlockAnnouncements(storage, newRewardSkins);
  enqueueDraftBattleUnlockAnnouncement(storage);

  return {
    ...evaluation,
    progress,
    newRewardUnits,
    newRewardSkins,
    valorReward,
    valorGranted: valorGrant.valorGranted,
    valorClaimed: valorGrant.progress.campaignValorRewards.includes(missionId),
  };
}
