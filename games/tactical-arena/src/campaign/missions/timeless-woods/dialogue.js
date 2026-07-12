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

// --- Mission 4: Timeless Woods dialogue --------------------------------------
// Father Time's enemy plan is intentionally readable: make the Archer bigger with
// Age, then threaten Rewind once RAGE unlocks.

export function fatherTimeMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const fatherTime = findUnit(state, "p2-0-father-time");
  const archer = findUnit(state, "p2-1-archer");
  return [
    {
      speakerId: fatherTime?.id,
      text: "The woods remember every arrow ever loosed here. Mine has not been fired yet.",
    },
    {
      speakerId: archer?.id,
      text: "Give me a little time, old man, and I will make one shot count for all of them.",
    },
    {
      speakerId: speaker.id,
      text: "Watch the buffs. Age can stack +1 STR or +1 DEF on an ally, or drain one of ours, and it lasts until Father Time falls.",
    },
    {
      speaker: "swordsman",
      text: "If Father Time drops into RAGE, Rewind can revive a fallen ally nearby. Decide whether to break the Archer first or end the clock.",
    },
  ];
}

export function shouldShowFatherTimeRageWarning(state, { warningShown = false, rewindUsed = false } = {}) {
  if (warningShown || rewindUsed || state?.phase !== "playing") return false;
  const fatherTime = findUnit(state, "p2-0-father-time");
  return Boolean(fatherTime && fatherTime.hp > 0 && fatherTime.hp <= 5);
}

export function fatherTimeRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const fatherTime = findUnit(state, "p2-0-father-time");
  return [
    {
      speakerId: fatherTime?.id,
      text: "A broken hour is still an hour. RAGE opens the way backward.",
    },
    {
      speakerId: speaker.id,
      text: "Rewind is live now. If the Archer falls while Father Time survives, he can bring her back.",
    },
  ];
}
