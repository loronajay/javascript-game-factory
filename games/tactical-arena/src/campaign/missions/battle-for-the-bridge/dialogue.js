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

// --- Mission 13: Battle for the Bridge dialogue ------------------------------
// The map cutscene stages the challenge and unit pick. In-battle beats cover the
// duel's opening, Ronin's blind, Final Draw, and the once-gated overworld recruitment.

export function roninMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const ronin = findUnit(state, "p2-0-ronin");
  if (!speaker) return [];
  return [
    {
      speakerId: ronin?.id,
      text: "The bridge is narrow. Draw cleanly, cross honorably, or fall.",
    },
    {
      speakerId: speaker.id,
      text: "One duel, one crossing. Let's end this.",
    },
  ];
}

export function shouldShowRoninBlindWarning(state, { warningShown = false, roninBlindApplied = false } = {}) {
  if (warningShown || !roninBlindApplied || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 1 && unit.hp > 0 && unit.statuses?.some((status) => status.type === "blind"));
}

export function roninBlindWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const ronin = findUnit(state, "p2-0-ronin");
  if (!speaker) return [];
  return [
    {
      speakerId: ronin?.id,
      text: "Flashing Steel steals the eyes before it takes the breath.",
    },
    {
      speakerId: speaker.id,
      text: "Blind. I can still hear where your blade lands.",
    },
  ];
}

export function shouldShowRoninRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const ronin = findUnit(state, "p2-0-ronin");
  return Boolean(ronin && ronin.hp > 0 && ronin.hp <= 5);
}

export function roninRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const ronin = findUnit(state, "p2-0-ronin");
  if (!speaker) return [];
  return [
    {
      speakerId: ronin?.id,
      text: "Final Draw. If this oath ends, it ends with my blade moving forward.",
    },
    {
      speakerId: speaker.id,
      text: "RAGE. He hits harder now, but every strike recoils on him. Do not let a suicide blow take us both.",
    },
  ];
}

export function roninDefeatScript() {
  return [
    {
      speaker: "ronin",
      side: "right",
      player: 2,
      text: "Hold. What are you after, crossing this island in such haste?",
    },
    {
      speaker: "swordsman",
      side: "left",
      text: "The king. The rumor says a sorcerer serves him and the void follows after. Too many wrongs are being done in his name, and we mean to find out why.",
    },
    {
      speaker: "mystic",
      side: "left",
      text: "We are not here to take your island. We are here to right what has been broken.",
    },
    {
      speaker: "ronin",
      side: "right",
      player: 2,
      text: "Then your cause is just. My oath has protected this bridge long enough. Accept my services, and my blade crosses with you.",
    },
  ];
}
