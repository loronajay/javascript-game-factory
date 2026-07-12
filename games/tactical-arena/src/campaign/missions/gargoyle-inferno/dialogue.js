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

// --- Mission 8: Gargoyle's Inferno dialogue -----------------------------------
// The map cutscene gets the party into the ruin; the battle script reveals the
// guardian and the one-shot RAGE warning rides before Volcanic Rage's free Pyroclasm.

export function gargoyleMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const gargoyle = findUnit(state, "p2-0-gargoyle");
  return [
    {
      speakerId: gargoyle?.id,
      text: "You should never have entered my ruins. Stone remembers trespass, and flame remembers flesh.",
    },
    {
      speakerId: speaker.id,
      text: "Good. A talking statue in a tiny murder basement. That is about what I expected.",
    },
    {
      speakerId: gargoyle?.id,
      text: "You will be trapped in flame forever. My fire will crisp you up until even your shadow begs to leave.",
    },
    {
      speakerId: speaker.id,
      text: "Then I had better make this quick.",
    },
  ];
}

export function shouldShowGargoyleRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const gargoyle = findUnit(state, "p2-0-gargoyle");
  return Boolean(gargoyle && gargoyle.hp > 0 && gargoyle.hp <= 5);
}

export function gargoyleRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const gargoyle = findUnit(state, "p2-0-gargoyle");
  if (!speaker) return [];
  return [
    {
      speakerId: gargoyle?.id,
      text: "ARRRRGH! The inferno wakes with me!",
    },
    {
      speakerId: speaker.id,
      text: "Volcanic Rage. Pyroclasm is about to erupt for free -- move if you can, end it if you cannot.",
    },
  ];
}
