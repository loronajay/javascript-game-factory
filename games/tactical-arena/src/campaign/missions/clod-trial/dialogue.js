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

export function clodMissionOpeningScript(state) {
  const speaker = (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0);
  const clod = findUnit(state, "p2-0-clod");
  if (!speaker) return [];
  return [
    {
      speakerId: clod?.id,
      text: "This ridge belongs to Clod. Step closer, and the stones will remember you.",
    },
    {
      speakerId: speaker.id,
      text: "Big words for a pile of rocks. We came for the ridge, and we are not leaving empty-handed.",
    },
    {
      speaker: "swordsman",
      text: "Stay spread out. If Clod drops into RAGE, Thunderous Charge punishes anyone standing shoulder to shoulder.",
    },
  ];
}

export function shouldShowClodRageWarning(state, { warningShown = false, chargeUsed = false } = {}) {
  if (warningShown || chargeUsed || state?.phase !== "playing") return false;
  const clod = findUnit(state, "p2-0-clod");
  return Boolean(clod && clod.hp > 0 && clod.hp <= 5);
}

export function clodRageWarningScript(state) {
  const speaker = (state?.units ?? []).find((unit) => unit.player === 1 && unit.hp > 0);
  if (!speaker) return [];
  const clod = findUnit(state, "p2-0-clod");
  return [
    {
      speakerId: speaker.id,
      text: "Spread out. Clod is in RAGE now, and that charge is coming.",
    },
    {
      speakerId: clod?.id,
      text: "The ridge shakes under Clod's feet. Thunderous Charge is online.",
    },
  ];
}
