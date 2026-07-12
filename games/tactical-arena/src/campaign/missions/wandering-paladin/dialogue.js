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

// --- Mission 6: Wandering Paladin dialogue ------------------------------------
// The map cutscene introduces the traveler; these in-battle beats react to the
// Paladin's kit as the duel unfolds.

export function paladinMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const paladin = findUnit(state, "p2-0-paladin");
  return [
    {
      speakerId: paladin?.id,
      text: "One champion against one Paladin. Win, and I join your march as gladly as I drew my blade.",
    },
    {
      speakerId: speaker.id,
      text: "Then let's find out if worthy travels both ways.",
    },
  ];
}

export function shouldShowPaladinLightseekerWarning(state, { warningShown = false, lightseekerDamageTakenCount = 0 } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return Math.max(0, Math.floor(Number(lightseekerDamageTakenCount) || 0)) > 0;
}

export function paladinLightseekerWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const paladin = findUnit(state, "p2-0-paladin");
  if (!speaker) return [];
  return [
    {
      speakerId: paladin?.id,
      text: "Lightseeker finds anyone standing where the light approves. Convenient, is it not?",
    },
    {
      speakerId: speaker.id,
      text: "Light spaces are not just decoration. Step off them or make him pay before he casts again.",
    },
  ];
}

export function shouldShowPaladinStatusTaunt(state, { warningShown = false, statusAttempted = false } = {}) {
  if (warningShown || !statusAttempted || state?.phase !== "playing") return false;
  const paladin = findUnit(state, "p2-0-paladin");
  return Boolean(paladin && paladin.hp > 0);
}

export function paladinStatusTauntScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const paladin = findUnit(state, "p2-0-paladin");
  if (!speaker) return [];
  return [
    {
      speakerId: paladin?.id,
      text: "Chosen protects me from little status tricks. Poison, silence, blind, slow, stun -- all very dramatic, all wasted.",
    },
    {
      speakerId: speaker.id,
      text: "Fine. No shortcuts. We beat him straight up.",
    },
  ];
}

export function shouldShowPaladinRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const paladin = findUnit(state, "p2-0-paladin");
  return Boolean(paladin && paladin.hp > 0 && paladin.hp <= 5);
}

export function paladinRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const paladin = findUnit(state, "p2-0-paladin");
  if (!speaker) return [];
  return [
    {
      speakerId: paladin?.id,
      text: "RAGE opens Heaven's Realm. Brace yourself -- I am about to bring the heat.",
    },
    {
      speakerId: speaker.id,
      text: "Now he hits light AND dark tiles -- Darkseeker reaches the whole board. There is no safe tile. Rush him down fast.",
    },
  ];
}

export function paladinDefeatScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const paladin = findUnit(state, "p2-0-paladin") ?? (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === "paladin");
  return [
    {
      speakerId: paladin?.id,
      speaker: "paladin",
      text: "Enough. You are worthy, and a vow is a vow. I will join you.",
    },
    ...(speaker ? [{
      speakerId: speaker.id,
      text: "Welcome to the party.",
    }] : []),
  ];
}
