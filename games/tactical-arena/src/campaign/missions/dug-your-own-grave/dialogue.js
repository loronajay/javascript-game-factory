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

// --- Mission 11: Dug Your Own Grave dialogue ----------------------------------
// The overworld beat handles the volunteer getting sealed in; the battle dialogue
// stays coy about the best unit choice and lets the board reveal the digging puzzle.

export function minerMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const miner = findUnit(state, "p2-0-miner");
  return [
    {
      speakerId: miner?.id,
      text: "You are stuck down here unless I show you the way out. Trouble is, I do not trust boots I did not invite.",
    },
    {
      speakerId: speaker.id,
      text: "Then we settle this quickly, and you can decide how much you like fresh air.",
    },
  ];
}

export function shouldShowMinerBlastingCapSplashWarning(state, { warningShown = false, minerBlastingCapSplashTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(minerBlastingCapSplashTakenCount) || 0)) > 0;
}

export function minerBlastingCapSplashWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const miner = findUnit(state, "p2-0-miner");
  if (!speaker) return [];
  return [
    {
      speakerId: miner?.id,
      text: "Blasting caps have a sense of humor in tight tunnels.",
    },
    {
      speakerId: speaker.id,
      text: "The echo hits almost as hard as the blast.",
    },
  ];
}

export function shouldShowMinerRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const miner = findUnit(state, "p2-0-miner");
  return Boolean(miner && miner.hp > 0 && miner.hp <= 5);
}

export function minerRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const miner = findUnit(state, "p2-0-miner");
  if (!speaker) return [];
  return [
    {
      speakerId: miner?.id,
      text: "Diamonds in the dark. Ore in the walls. I can hear every glittering vein singing.",
    },
    {
      speakerId: speaker.id,
      text: "He just found a second wind. End this before the mine starts answering him.",
    },
  ];
}

export function minerDefeatScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const miner = findUnit(state, "p2-0-miner") ?? (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === "miner");
  return [
    {
      speakerId: miner?.id,
      speaker: "miner",
      text: "All right. Pickaxe down. I will get you out of here.",
    },
    ...(speaker ? [{
      speakerId: speaker.id,
      text: "You know the way?",
    }] : []),
    {
      speakerId: miner?.id,
      speaker: "miner",
      text: "I dug half of it. Besides, I could use some air.",
    },
  ];
}
