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

// --- Mission 14: Wrong Place, Wrong Time dialogue ----------------------------
// Four same-type enemies need stable character names, so both their live unit
// nicknames (battle) and explicit overworld `name` fields (map cutscenes) introduce
// John and the rest of the riot detail without changing the base unit name.

function riotCopUnit(state, index) {
  return findUnit(state, `p2-${index}-riot-cop`);
}

export function wrongPlaceMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  return [
    {
      speakerId: riotCopUnit(state, 0)?.id,
      name: "John",
      text: "We saw a guy in a wizard outfit fleeing the scene. You lot must be with the criminals.",
    },
    {
      speakerId: riotCopUnit(state, 1)?.id,
      name: "Mara",
      text: "Look at them. Sword, bow, robes, wand. Definitely involved.",
    },
    {
      speakerId: speaker.id,
      text: "We are not involved. We are chasing a lead about a sorcerer, but we did not burn anything down.",
    },
    {
      speakerId: riotCopUnit(state, 2)?.id,
      name: "Brock",
      text: "Shut it and prepare to be arrested.",
    },
  ];
}

export function wrongPlaceDefeatScript() {
  return [
    riotCopLine(0, "All right. Shields down. I am sorry -- I jumped to conclusions back there."),
    { speaker: "mystic", side: "left", text: "A small amount of conclusions. A whole sprint, perhaps." },
    riotCopLine(0, "Dispatch said it was some drunk guy in a wizard costume. Burned a building down trying to kill a mosquito, then fled the scene."),
    { speaker: "magician", side: "left", text: "A wizard in the wreckage... that sounds like the same trail we are following." },
    riotCopLine(0, "You are hunting the arsonist too? Then let me come along. John joins you, and I bring justice to the mosquito maniac."),
    { speaker: "swordsman", side: "left", text: "Fine. But if you arrest us again, you carry the bags." },
  ];
}
