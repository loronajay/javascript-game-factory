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
} from "../../campaignConstants.js";
import { findUnit } from "../../../core/state.js";
import { isNegativeStatus } from "../../../rules/statuses.js";
import { firstLivingPlayerUnit, riotCopLine } from "../sharedDialogue.js";

// --- Mission 3: Cursed Swamp dialogue ----------------------------------------
// These hints point at the level's actual lesson: body-blocked physical shots,
// fire lanes, Ghoul proximity, and the Witch Doctor's RAGE dance.

export function witchDoctorMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  return [
    {
      speakerId: witchDoctor?.id,
      text: "Careful where you step. The flame and I go way back, and the swamp remembers its friends.",
    },
    {
      speakerId: speaker.id,
      text: "Those things are standing shoulder to shoulder. A straight shot will not always find a straight line.",
    },
  ];
}

export function shouldShowWitchDoctorFireWarning(state, { warningShown = false, fireDamageTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(fireDamageTakenCount) || 0)) > 0;
}

export function witchDoctorFireWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "The swamp burns anyone careless, but he barely flinches. The fire is not hurting both sides equally.",
    },
    {
      speakerId: witchDoctor?.id,
      text: "Old friends do not bite.",
    },
  ];
}

export function shouldShowWitchDoctorBlockedShotWarning(state, { warningShown = false, blockedShotQueued = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Boolean(blockedShotQueued);
}

export function witchDoctorBlockedShotWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "An arrow does not turn corners. A wider spread might not care what is standing in the way.",
    },
  ];
}

export function shouldShowWitchDoctorGhoulWarning(state, { warningShown = false, ghoulBiteTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(ghoulBiteTakenCount) || 0)) > 0;
}

export function witchDoctorGhoulWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "They get meaner up close. Keep distance unless you are ready to pay for the tile.",
    },
  ];
}

export function shouldShowWitchDoctorRageWarning(state, { warningShown = false, blackDeathDanceUsed = false } = {}) {
  if (warningShown || blackDeathDanceUsed || state?.phase !== "playing") return false;
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  return Boolean(witchDoctor && witchDoctor.hp > 0 && witchDoctor.hp <= 5);
}

export function witchDoctorRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const witchDoctor = findUnit(state, "p2-0-witch-doctor");
  if (!speaker) return [];
  return [
    {
      speakerId: witchDoctor?.id,
      text: "Now the swamp dances with me. One more step and everything goes dark.",
    },
    {
      speakerId: speaker.id,
      text: "Black Death is coming if this drags on. Finish the duel before he gets another dance.",
    },
  ];
}
