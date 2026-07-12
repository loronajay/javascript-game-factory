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

// --- Mission 2: Necromancer's Gate dialogue -----------------------------------
// The hints let a player derive "physical + spacing + a cure" without naming the
// intended Mystic + Swordsman pairing outright.


export function necromancerMissionOpeningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const necromancer = findUnit(state, "p2-0-necromancer");
  const virus = findUnit(state, "p2-1-virus");
  return [
    {
      speakerId: necromancer?.id,
      text: "The gate drinks magic before it ever lands. Bring spells if you like — they will die quietly at my wall.",
    },
    {
      speakerId: virus?.id,
      text: "And keep your friends close together. Whatever I give one of you, I will happily share with the rest.",
    },
    {
      speakerId: speaker.id,
      text: "Something here punishes crowding, and a curse could hurt worse than any blade. Steel over sorcery — and whatever can lift a curse may matter more than raw damage this time.",
    },
  ];
}

export function shouldShowNecromancerStatusWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
}

export function necromancerStatusWarningScript(state) {
  const afflicted = (state?.units ?? []).find((unit) =>
    unit.player === 1 && unit.hp > 0 && (unit.statuses ?? []).some(isNegativeStatus));
  const speaker = afflicted ?? firstLivingPlayerUnit(state);
  const virus = findUnit(state, "p2-1-virus");
  if (!speaker) return [];
  return [
    {
      speakerId: virus?.id,
      text: "It takes hold. Stand shoulder to shoulder and it will leap to whoever is nearest.",
    },
    {
      speakerId: speaker.id,
      text: "Break apart so it can't jump, and cure it before it stacks. Left alone, this rot only gets worse.",
    },
  ];
}

export function shouldShowNecromancerSummonWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  return (state?.units ?? []).some((unit) =>
    unit.player === 2 && unit.hp > 0 && Boolean(unit.summonerId));
}

export function necromancerSummonWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  const ghoul = (state?.units ?? []).find((unit) => unit.player === 2 && unit.hp > 0 && Boolean(unit.summonerId));
  if (!speaker) return [];
  return [
    {
      speakerId: ghoul?.id,
      text: "A ghoul claws its way up from the stones.",
    },
    {
      speakerId: speaker.id,
      text: "The ghoul isn't the win — the caster is. But it'll gnaw at anyone who lingers beside it, so don't camp next to it.",
    },
  ];
}

export function shouldShowNecromancerRageWarning(state, { warningShown = false } = {}) {
  if (warningShown || state?.phase !== "playing") return false;
  const necromancer = findUnit(state, "p2-0-necromancer");
  return Boolean(necromancer && necromancer.hp > 0 && necromancer.hp <= 5);
}

export function necromancerRageWarningScript(state) {
  const speaker = firstLivingPlayerUnit(state);
  if (!speaker) return [];
  const necromancer = findUnit(state, "p2-0-necromancer");
  return [
    {
      speakerId: necromancer?.id,
      text: "Cornered, am I? Then the gate's shadow spreads — and my bomb reaches farther than it did.",
    },
    {
      speakerId: speaker.id,
      text: "Its aura just widened and Dark Bomb will catch more ground now. Don't dawdle in the dark — finish it.",
    },
  ];
}
