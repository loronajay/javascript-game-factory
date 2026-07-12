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

// --- Mission 5: Root of the Virus dialogue ------------------------------------
// A normal duel with a nasty status engine: the opening sells the opposing squad,
// then two small beats react to the first poison and the player's first status hit.

export function virusMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const witchDoctor = findUnit(state, "p2-3-witch-doctor");
  const virus = findUnit(state, "p2-0-virus");
  return [
    {
      speakerId: witchDoctor?.id,
      text: "The root is awake. Every little virus in this marsh knows the dance.",
    },
    {
      speakerId: virus?.id,
      text: "One cough, one curse, one careless huddle. That is all it takes.",
    },
    {
      speakerId: speaker.id,
      text: "Then we keep our spacing, watch the poison, and make the root taste its own medicine.",
    },
  ];
}

export function shouldShowVirusPoisonWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some((status) => status.type === "poison"));
}

export function virusPoisonWarningScript(state) {
  const poisoned = (state?.units ?? []).find((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some((status) => status.type === "poison"));
  const speaker = poisoned ?? firstLivingPlayerUnit(state);
  const virus = (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === "virus" && unit.hp > 0);
  if (!speaker) return [];
  return [
    {
      speakerId: virus?.id,
      text: "There it is. Let it bloom, and it will not stay lonely.",
    },
    {
      speakerId: speaker.id,
      text: "Poisoned. Break apart before Spread carries it through the line.",
    },
  ];
}

export function shouldShowVirusEnemyStatusTaunt(state, { warningShown = false, playerAfflictedEnemyStatus = false } = {}) {
  if (warningShown || !playerAfflictedEnemyStatus || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 2 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
}

export function virusEnemyStatusTauntScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const afflicted = (state?.units ?? []).find((unit) =>
    unit.player === 2 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
  if (!speaker) return [];
  return [
    {
      speakerId: speaker.id,
      text: "A taste of your own medicine.",
    },
    {
      speakerId: afflicted?.id,
      text: "The root does not like bitter flavors.",
    },
  ];
}
