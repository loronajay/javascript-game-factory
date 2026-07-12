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

export function spiritWoodsMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const motherNature = findUnit(state, "p2-0-mother-nature");
  if (!speaker) return [];
  return [
    { speakerId: motherNature?.id,
      text: "Why do you disturb my rest?" },
    { speakerId: speaker.id,
      text: "A snow storm blocks the passage northeast. We need your help to contain it so we can confront the king." },
    { speakerId: motherNature?.id,
      text: "You ask me to put a halt to my beautiful work for the affairs of man. That is a selfish request." },
    { speaker: "mystic",
      text: "The void has already consumed Treant's forest. Yours could be next." },
    { speakerId: motherNature?.id,
      text: "If you truly care for my forest, then fight for it." },
    { speakerId: speaker.id,
      text: "A duel for your help calming the storm. We accept." },
    { speakerId: motherNature?.id,
      text: "Then let the woods judge your resolve." },
  ];
}

export function shouldShowSpiritWoodsGreatFloodDialogue(state, { warningShown = false, greatFloodUsed = false } = {}) {
  if (warningShown || !greatFloodUsed || state?.phase !== "playing") return false;
  return Boolean(findUnit(state, "p2-0-mother-nature"));
}

export function spiritWoodsGreatFloodScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const motherNature = findUnit(state, "p2-0-mother-nature");
  if (!speaker) return [];
  return [
    { speakerId: motherNature?.id,
      text: "Great Flood. Let every root remember who commands the rain." },
    { speakerId: speaker.id,
      text: "She can drown the whole field at once. We cannot let her cast that again." },
  ];
}

export function shouldShowSpiritWoodsTreantPoisonTaunt(state, { warningShown = false, poisonAttempted = false } = {}) {
  if (warningShown || !poisonAttempted || state?.phase !== "playing") return false;
  const treant = findUnit(state, "p2-1-treant");
  return Boolean(treant && treant.hp > 0);
}

export function spiritWoodsTreantPoisonTauntScript(state) {
  const treant = findUnit(state, "p2-1-treant");
  return [
    { speakerId: treant?.id,
      text: "Poison does not take root in me. The forest has tasted worse and lived." },
  ];
}

export function shouldShowSpiritWoodsPaladinStatusTaunt(state, { warningShown = false, statusAttempted = false } = {}) {
  if (warningShown || !statusAttempted || state?.phase !== "playing") return false;
  const paladin = findUnit(state, "p2-3-paladin");
  return Boolean(paladin && paladin.hp > 0);
}

export function spiritWoodsPaladinStatusTauntScript(state) {
  const paladin = findUnit(state, "p2-3-paladin");
  return [
    { speakerId: paladin?.id,
      text: "Gaia's protector does not bend to little curses. Try steel, if you must try anything." },
  ];
}

export function shouldShowSpiritWoodsTreantFireTaunt(state, { warningShown = false, fireHit = false } = {}) {
  if (warningShown || !fireHit || state?.phase !== "playing") return false;
  return Boolean(findUnit(state, "p2-1-treant"));
}

export function spiritWoodsTreantFireTauntScript(state) {
  const treant = findUnit(state, "p2-1-treant");
  const motherNature = findUnit(state, "p2-0-mother-nature");
  return [
    { speakerId: treant?.id,
      text: "Fire bites deep into old bark." },
    { speakerId: motherNature?.id,
      text: "Careful, little sparks. The woods remember every flame." },
  ];
}
