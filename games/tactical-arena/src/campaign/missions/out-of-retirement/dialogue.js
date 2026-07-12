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

// --- Mission 15: Out of Retirement dialogue ----------------------------------

export function outOfRetirementMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const angel = findUnit(state, "p2-0-angel");
  const paladin = findUnit(state, "p2-1-paladin");
  return [
    {
      speakerId: angel?.id,
      text: "All right. Two on two, clean enough. Show me why I should leave a perfectly good beach.",
    },
    {
      speakerId: paladin?.id,
      text: "Please do. I was having the finest nap of my career, and my drink is getting warm.",
    },
    {
      speakerId: speaker.id,
      text: "Then we make this quick. Beat them straight, watch the light tiles, and no status tricks.",
    },
  ];
}

export function outOfRetirementStatusTauntScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const angel = findUnit(state, "p2-0-angel");
  if (!speaker) return [];
  return [
    {
      speakerId: angel?.id,
      text: "Retired, yes. Vulnerable to status effects, no. Holy Being and Chosen still work in sandals.",
    },
    {
      speakerId: speaker.id,
      text: "Right. No poison, no blind, no shortcuts. We win this honestly.",
    },
  ];
}

export function outOfRetirementLightseekerWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const paladin = findUnit(state, "p2-1-paladin");
  if (!speaker) return [];
  return [
    {
      speakerId: paladin?.id,
      text: "Lightseeker. Still bright enough to wake the whole beach.",
    },
    {
      speakerId: speaker.id,
      text: "Light tiles are dangerous while he has MP. Move off them or finish him.",
    },
  ];
}

export function shouldShowOutOfRetirementAngelRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const angel = findUnit(state, "p2-0-angel");
  return Boolean(angel && angel.hp > 0 && angel.hp <= 5);
}

export function outOfRetirementAngelRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const angel = findUnit(state, "p2-0-angel");
  if (!speaker) return [];
  return [
    {
      speakerId: angel?.id,
      text: "There it is. Heaven's Wrath. I may be retired, but I am not rusty.",
    },
    {
      speakerId: speaker.id,
      text: "Angel is raging. His strength and movement just spiked, and Heavenseeker can punish light tiles globally.",
    },
  ];
}

export function outOfRetirementDefeatScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const angel = findUnit(state, "p2-0-angel") ?? (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === "angel");
  return [
    {
      speakerId: angel?.id,
      speaker: "angel",
      text: "All right. I am awake. You have my help.",
    },
    ...(speaker ? [{
      speakerId: speaker.id,
      text: "You will come north with us?",
    }] : []),
    {
      speakerId: angel?.id,
      speaker: "angel",
      text: "Yes. Give me a moment to snap out of this and change into something more appropriate for the journey.",
    },
  ];
}
