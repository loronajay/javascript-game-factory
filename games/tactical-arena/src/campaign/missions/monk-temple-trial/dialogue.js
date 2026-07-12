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

// --- Mission 7: Temple Trial dialogue -----------------------------------------
// The combat board stages the trick in the opening: one centered Monk greets the
// party, then line actions reveal the squad, move the Monk to the corner, and split
// the four bodies into their shuffled combat positions.

export function monkMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const realMonk = (state?.units ?? []).find((unit) => unit.trialRealMonk) ??
    (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === "monk");
  if (!speaker) return [];
  return [
    {
      speaker: "monk",
      text: "The temple is quiet. Too quiet. I sense a disturbance of my peace.",
      afterAction: "monkIntroRevealAndMove",
    },
    {
      speakerId: speaker.id,
      text: "That would be us.",
    },
    {
      speakerId: realMonk?.id,
      text: "! Then prove you are worthy to enter. Find the real Monk, or leave the temple path.",
      afterAction: "monkIntroSplitShuffle",
    },
    {
      speaker: "swordsman",
      text: "Four of him. Of course there are four of him.",
    },
    {
      speaker: "swordsman",
      text: "This is a test of combat knowledge as much as combat strength. Watch closely once the trial begins.",
    },
  ];
}
