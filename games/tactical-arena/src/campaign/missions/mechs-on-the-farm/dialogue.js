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

// --- Mission 7.5: Mechs on the Farm dialogue ----------------------------------
// The mech brothers are mid-argument when the party arrives. The party's attempt to
// mediate makes both of them turn on the strangers instead, calling a temporary truce.
// Each brother gets its own one-time RAGE line; a make-up beat plays after the win,
// before the results screen (mirrors paladinDefeatScript / minerDefeatScript).

function brotherUnit(state, type) {
  return (state?.units ?? []).find((unit) => unit.player === 2 && unit.type === type) ?? null;
}

export function brothersMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const big = brotherUnit(state, "big-brother");
  const little = brotherUnit(state, "little-brother");
  return [
    { speakerId: big?.id, text: "You NEVER hold your lane, Little Brother. I said the west field was MINE. West. Field." },
    { speakerId: little?.id, text: "Because you hog the whole farm, Big Brother! Your dumb magnet yanks every shot I take off target!" },
    { speakerId: big?.id, text: "Oh, here we go. It is ALWAYS the magnet with you." },
    { speakerId: speaker.id, text: "Hey -- hey! Easy, both of you. Maybe just... take turns? Talk it out before you flatten the whole farm?" },
    { speakerId: little?.id, text: "...Who asked YOU?" },
    { speakerId: big?.id, text: "Stay out of it. This is a BROTHER thing. You would not get it." },
    { speakerId: little?.id, text: "Truce, Big Brother. Just till we scrap these nosy strangers." },
    { speakerId: big?.id, text: "Agreed. Strangers first. Then I win the argument." },
  ];
}

export function shouldShowBrothersRageWarning(state, type, { warned = false } = {}) {
  if (warned || state?.phase !== "playing") return false;
  const unit = brotherUnit(state, type);
  return Boolean(unit && unit.hp > 0 && unit.hp <= 5);
}

const BROTHERS_RAGE_LINES = Object.freeze({
  "big-brother": "ROGUE MECH ONLINE! No more holding back -- MY magnet, MY field, MY rules!",
  "little-brother": "Flamespitter's lit! Everybody's getting toasted -- and you two are first!",
});

export function brothersRageWarningScript(state, type) {
  const unit = brotherUnit(state, type);
  const text = BROTHERS_RAGE_LINES[type];
  if (!unit || !text) return [];
  return [{ speakerId: unit.id, text }];
}

export function brothersDefeatScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const big = brotherUnit(state, "big-brother");
  const little = brotherUnit(state, "little-brother");
  return [
    { speakerId: big?.id, speaker: "big-brother", text: "*sparks* ...ow. Okay. Okay, we lost. Little Brother, you still running?" },
    { speakerId: little?.id, speaker: "little-brother", text: "Barely. ...Big Brother, I'm sorry I yelled about the magnet. You held the west field good. Real good." },
    { speakerId: big?.id, speaker: "big-brother", text: "...And I hogged the whole farm. Split it down the middle? You take the fields, I take the barn." },
    { speakerId: little?.id, speaker: "little-brother", text: "Deal. DEAL! ...We really did wreck the place, huh." },
    ...(speaker ? [{ speakerId: speaker.id, text: "There it is. Come on -- help us mend these fences, and we could use two mechs who actually get along." }] : []),
  ];
}
