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
import { fatSquadUnit, firstLivingPlayerUnit, riotCopLine } from "../sharedDialogue.js";

// --- Mission 18: The Showdown dialogue ---------------------------------------
// A cold-pass rematch that finally turns the fat party from rivals into allies.
// The battle itself uses a normal 4v4 shell; these beats carry the story turn.

export function showdownMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const line = (type, text) => {
    const unit = fatSquadUnit(state, type);
    return unit ? { speakerId: unit.id, text } : { speaker: type, side: "right", player: 2, text };
  };
  return [
    line("fat-knight", "Nobody gets through this pass until we do. Not the king, not the void, and definitely not you."),
    line("fat-wizard", "*hic* If they reach the castle first, the truth gets buried and everything gets worse. We cannot let them ruin everything."),
    { speakerId: speaker.id, text: "We are trying to stop the void too. Stand down and explain yourselves." },
    line("fat-bowman", "Explain after. Arrows now. My fingers are too cold for a long speech."),
    line("fat-cleric", "I will heal everyone after we win. Or after we lose. Mostly I just want to stop freezing."),
    { speaker: "mystic", side: "left", text: "Then we settle it here. One squad, one pass." },
  ];
}

export function shouldShowShowdownFatRageWarning(state, type, { warned = false } = {}) {
  if (warned || state?.phase !== "playing") return false;
  const unit = fatSquadUnit(state, type);
  return Boolean(unit && unit.hp > 0 && unit.hp <= 5);
}

const SHOWDOWN_FAT_RAGE_LINES = Object.freeze({
  "fat-knight": "RAGE! Payback does not freeze. It waits, shivering, and then it hits you with a sword!",
  "fat-wizard": "RAGE! I am sorry in advance for whatever spell happens next!",
  "fat-cleric": "RAGE! The truth is I am cold, hungry, and very tired of losing!",
  "fat-bowman": "RAGE! My fingers are frozen, but my aim is still rude!",
});

export function showdownFatRageWarningScript(state, type) {
  const unit = fatSquadUnit(state, type);
  const text = SHOWDOWN_FAT_RAGE_LINES[type];
  if (!unit || !text) return [];
  return [{ speakerId: unit.id, text }];
}

export function showdownDefeatScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const line = (type, text) => {
    const unit = fatSquadUnit(state, type);
    return { speakerId: unit?.id, speaker: type, side: "right", player: 2, text };
  };
  return [
    line("fat-knight", "*panting* Fine. You got us."),
    line("fat-bowman", "Can we admit they are better than us and find literally any place with a roof?"),
    line("fat-cleric", "They are not wannabes. They are warm-blooded winners. I respect that."),
    line("fat-wizard", "*hic* Maybe we should tell them. The whole thing. The ugly version."),
    ...(speaker ? [{ speakerId: speaker.id, text: "Start talking." }] : []),
  ];
}
