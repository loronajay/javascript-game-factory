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

// --- Mission 19: Not My King dialogue ---------------------------------------
// The crown has been void-bound, so the enemy side speaks almost entirely through
// the King's silence until the battle breaks the possession.

export function notMyKingMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const king = findUnit(state, "p2-0-king");
  if (!speaker) return [];
  return [
    { speakerId: speaker.id,
      text: "Your Majesty, please. Return to your senses. The kingdom still needs you." },
    { speakerId: king?.id, speaker: "king", side: "right", player: 2,
      text: "..." },
  ];
}

function notMyKingEnemyUnit(state, type) {
  return (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === type) ?? null;
}

export function shouldShowNotMyKingEnemyRageWarning(state, type, { warned = false } = {}) {
  if (warned || state?.phase !== "playing") return false;
  if (!NOT_MY_KING_ENEMY_TYPES.includes(type)) return false;
  const unit = notMyKingEnemyUnit(state, type);
  return Boolean(unit && unit.hp > 0 && unit.hp <= 5);
}

export function notMyKingEnemyRageWarningScript(state) {
  const king = findUnit(state, "p2-0-king");
  return [{ speakerId: king?.id, speaker: "king", side: "right", player: 2, text: "..." }];
}

export function notMyKingDefeatScript() {
  return [
    { speaker: "king", type: "king", skin: null, side: "right", player: 2,
      text: "Where am I?" },
    { speaker: "king", type: "king", skin: null, side: "right", player: 2,
      text: "Why am I outside of the kingdom walls?" },
    { speaker: "treant", side: "left",
      text: "My king, you were taken by the void." },
    { speaker: "king", type: "king", skin: null, side: "right", player: 2,
      text: "Then I have much to tell you, and little time to waste." },
  ];
}
