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

// --- Mission 12: Has-Been Heroes dialogue -------------------------------------
// A friendly town brawl. The opening lets all four fat members chime in; each has a
// one-time RAGE popup (progression is NOT gated on it — the player is meant to avoid
// letting them rage); the completion beat plays before the results screen.

function fatSquadUnit(state, type) {
  return (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === type) ?? null;
}

export function hasbeenHeroesMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const line = (type, text) => {
    const unit = fatSquadUnit(state, type);
    return unit ? { speakerId: unit.id, text } : null;
  };
  return [
    line("fat-knight", "Fine, FINE, we do this the hard way. Nobody gets past ME."),
    line("fat-bowman", "Can we make it quick? I have a nap scheduled."),
    line("fat-cleric", "Beat them fast so we can find a tavern. I am running dangerously low on snacks."),
    line("fat-wizard", "*hic* I found my staff! It was in my other... my other hand. Okay. Magic time."),
    { speakerId: speaker.id, text: "Watch the big one's Fart — if he shoves you into a wall or a body, it hurts. Keep room behind you." },
  ].filter(Boolean);
}

export function shouldShowHasbeenFatRageWarning(state, type, { warned = false } = {}) {
  if (warned || state?.phase !== "playing") return false;
  const unit = fatSquadUnit(state, type);
  return Boolean(unit && unit.hp > 0 && unit.hp <= 5);
}

const HASBEEN_FAT_RAGE_LINES = Object.freeze({
  "fat-knight": "RAAAGH! Okay, NOW I'm awake! You woke the knight!",
  "fat-bowman": "Nap's cancelled. You are going to regret cancelling my nap.",
  "fat-cleric": "So... hungry... anger is a food group now, right? RIGHT?",
  "fat-wizard": "*hic* Everything's spinning and I am FURIOUS about it!",
});

export function hasbeenFatRageWarningScript(state, type) {
  const unit = fatSquadUnit(state, type);
  const text = HASBEEN_FAT_RAGE_LINES[type];
  if (!unit || !text) return [];
  return [{ speakerId: unit.id, text }];
}

export function hasbeenHeroesDefeatScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const line = (type, text) => {
    const unit = fatSquadUnit(state, type);
    return { speakerId: unit?.id, speaker: type, text };
  };
  return [
    line("fat-knight", "*panting* This... this isn't over. You haven't seen the last of us."),
    line("fat-cleric", "Soooo hungry... did we win? We didn't win, did we..."),
    line("fat-bowman", "I'm going back to my nap. Do NOT follow us."),
    line("fat-wizard", "*hic* Great job everyone. To the next castle. Or... a tavern. Tavern first."),
    ...(speaker ? [{ speakerId: speaker.id, text: "...I almost feel bad for them. Almost." }] : []),
  ];
}
