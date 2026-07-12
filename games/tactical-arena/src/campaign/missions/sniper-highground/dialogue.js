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

// --- Mission 9: The High Ground of the Sniper dialogue ------------------------
// Standard duel banter: the enemy marksman lords the high cliffs, Clod holds the low
// road, and the Archer answers. The one mid-battle beat reminds the player the cliff
// fire is permanent so it reads as terrain to route around, not a passing hazard.

export function sniperMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const sniper = findUnit(state, "p2-0-sniper");
  const clod = findUnit(state, "p2-1-clod");
  return [
    {
      speakerId: sniper?.id,
      text: "I can see the whole plateau from up here. You picked a bad hill to climb.",
    },
    {
      speakerId: clod?.id,
      text: "Clod holds the low road. The sniper holds the high one. You hold nothing.",
    },
    {
      speakerId: speaker.id,
      text: "High ground cuts both ways. Break their cover, mind the flame, and I'll put a shaft through that scope.",
    },
  ];
}

export function shouldShowSniperFireWarning(state, { warningShown = false, fireDamageTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(fireDamageTakenCount) || 0)) > 0;
}

export function sniperFireWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "These fires don't burn out -- they're part of the cliffs. Route around them, not through them.",
    },
  ];
}
