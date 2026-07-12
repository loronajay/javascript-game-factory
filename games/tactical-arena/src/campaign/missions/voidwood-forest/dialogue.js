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

export function voidwoodMissionOpeningScript() {
  return [];
}

export function voidwoodEnemyFallScript(state, unitId) {
  const unit = findUnit(state, unitId);
  if (!unit || unit.player !== 2) return [];
  const textByType = {
    treant: "The roots... are not mine...",
    angel: "No. The void promised no one would find us here.",
    "witch-doctor": "The dance breaks. The dark goes hungry.",
    necromancer: "This forest is already buried. You are only digging after it.",
  };
  const text = textByType[unit.type];
  if (!text) return [];
  return [{ speakerId: unit.id, text }];
}

export function voidwoodDefeatScript() {
  return [
    { speaker: "treant", type: "treant", skin: null, side: "right", player: 2,
      text: "Where am I? Why does the forest feel so far away?" },
    { speaker: "treant", type: "treant", skin: null, side: "right", player: 2,
      text: "What happened to me?" },
  ];
}
