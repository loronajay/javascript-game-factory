import {
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
  VOID_CASTLE_MISSION_ID,
  FINAL_BATTLE_MISSION_ID,
  MIN_CAMPAIGN_SQUAD_SIZE,
  MAX_CAMPAIGN_SQUAD_SIZE,
} from "./campaignConstants.js";
import { getInitialMp, getUnitType } from "../core/unitCatalog.js";
import { openAutomaticFirstActivation } from "../core/state.js";
import { normalizeWeatherSpec } from "../core/weather.js";
import { DEFAULT_SQUAD, UNIT_TYPE_KEYS } from "../ui/squadModel.js";
import { isProgressUnitUnlocked } from "../progression/unlocks.js";
import { startCampaignDamageBoosts } from "../progression/inventory.js";
import { getNicknamePref } from "../ui/nicknameModel.js";
import { getSkinPref } from "../ui/skinModel.js";
import { getCampaignMission } from "./campaignModel.js";
import { defaultStorage } from "./campaignProgress.js";

// The layout table and the mission-trial transforms live in campaignLayouts.js and
// missions/<slug>/; re-exported here so the campaign barrel keeps its surface.
export { CAMPAIGN_LAYOUTS, campaignMissionHasAuthoredWeather } from "./campaignLayouts.js";
export { applyMonkTrialIntroBeat } from "./missions/monk-temple-trial/trial.js";
export {
  applyVoidCastleIntroBeat,
  applyVoidCastlePartyHeal,
  applyVoidCastleSplit,
} from "./missions/void-ridden-castle/trial.js";
import { CAMPAIGN_LAYOUTS, campaignMissionHasAuthoredWeather } from "./campaignLayouts.js";

// Types a given mission will not let the player field. Two sources, unioned: a mission whose
// board runs its own weather locks Mother Nature out (her whole kit is the weather), and a
// mission may declare its own `restrictedUnitTypes` — The Final Battle uses it to keep the
// King out, since every party member there has to survive a solo duel and a non-combatant
// commander has no way to fight one.
export function campaignRestrictedUnitTypes(storage = defaultStorage(), missionOrId = null) {
  const mission = typeof missionOrId === "string" ? getCampaignMission(missionOrId) : missionOrId;
  const restricted = new Set(mission?.restrictedUnitTypes ?? []);
  if (campaignMissionHasAuthoredWeather(missionOrId)) restricted.add("mother-nature");
  return [...restricted];
}

export function campaignRetiredUnitTypes(storage = defaultStorage(), missionOrId = null) {
  return campaignRestrictedUnitTypes(storage, missionOrId);
}

export function campaignSelectableUnitTypes(types = UNIT_TYPE_KEYS, storage = defaultStorage(), missionOrId = null) {
  const restricted = new Set(campaignRestrictedUnitTypes(storage, missionOrId));
  return (Array.isArray(types) ? types : UNIT_TYPE_KEYS)
    .filter((type) => UNIT_TYPE_KEYS.includes(type))
    .filter((type) => isProgressUnitUnlocked(type, storage))
    .filter((type) => !restricted.has(type));
}

export function campaignSquadSize(mission) {
  return Math.max(
    MIN_CAMPAIGN_SQUAD_SIZE,
    Math.min(MAX_CAMPAIGN_SQUAD_SIZE, Math.floor(Number(mission?.playerSlots) || MAX_CAMPAIGN_SQUAD_SIZE))
  );
}

export function normalizeCampaignSquad(selectedSquad = DEFAULT_SQUAD, missionOrSize = MAX_CAMPAIGN_SQUAD_SIZE) {
  const size = typeof missionOrSize === "number" ? missionOrSize : campaignSquadSize(missionOrSize);
  const targetSize = Math.max(MIN_CAMPAIGN_SQUAD_SIZE, Math.min(MAX_CAMPAIGN_SQUAD_SIZE, size));
  const out = [];
  for (const type of Array.isArray(selectedSquad) ? selectedSquad : []) {
    if (UNIT_TYPE_KEYS.includes(type) && !out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  for (const type of DEFAULT_SQUAD) {
    if (!out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  for (const type of UNIT_TYPE_KEYS) {
    if (!out.includes(type)) out.push(type);
    if (out.length >= targetSize) return out;
  }
  return out;
}

// Pins a mission's `lockedSlots` (e.g. {0:"archer"}) onto a chosen squad regardless of
// what the UI sent — the locked type is forced into its slot and pulled out of any other
// slot so it can't duplicate. A defensive belt to the menu's per-slot lock; the actual
// slot-index fill still happens in normalizeCampaignSquad afterward.
export function applyLockedSlots(squad, mission) {
  const lockedSlots = mission?.lockedSlots;
  if (!lockedSlots) return squad;
  const out = [...(Array.isArray(squad) ? squad : [])];
  for (const [indexKey, type] of Object.entries(lockedSlots)) {
    const index = Number(indexKey);
    for (let i = 0; i < out.length; i += 1) {
      if (i !== index && out[i] === type) out[i] = null;
    }
    out[index] = type;
  }
  return out;
}

export function createCampaignMatchConfig(missionId = CLOD_MISSION_ID, selectedSquad = null, selectedSkins = null) {
  const mission = getCampaignMission(missionId);
  if (!mission || mission.comingSoon) throw new Error(`Campaign mission is not playable: ${missionId}`);
  // squadLocked missions test a specific unit's kit, not squad choice — the authored
  // defaultSquad always wins, even if a caller (or a stale UI selection) passes something
  // else in.
  const playerSquad = mission.squadLocked
    ? normalizeCampaignSquad(mission.defaultSquad ?? DEFAULT_SQUAD, mission)
    : normalizeCampaignSquad(
        applyLockedSlots(selectedSquad ?? mission.defaultSquad ?? DEFAULT_SQUAD, mission),
        mission,
      );
  return {
    mode: "campaign",
    campaignMissionId: mission.id,
    difficulty: "normal",
    size: mission.size ?? 11,
    playerCount: 2,
    squads: {
      1: playerSquad,
      2: [...mission.enemySquad],
    },
    // Skins are chosen by the player keyed by unit TYPE (see menuFlow.js), matched
    // back onto the normalized squad's slot order here for buildRoster.
    skins: {
      1: playerSquad.map((type) => (
        selectedSkins && Object.hasOwn(selectedSkins, type)
          ? selectedSkins[type] ?? null
          : getSkinPref(type)
      )),
      2: mission.enemySkins ? [...mission.enemySkins] : mission.enemySquad.map(() => null),
    },
    // The enemy squad is scripted, not a real local player — it must never inherit
    // the player's own local nickname preferences (buildRoster's default fallback
    // applies per-type, so an enemy Swordsman would otherwise wear the same
    // nickname as the player's own Swordsman).
    nicknames: {
      1: playerSquad.map((type) => getNicknamePref(type)),
      2: mission.enemyNicknames ? [...mission.enemyNicknames] : mission.enemySquad.map(() => null),
    },
    teamNames: {
      1: "Player Vanguard",
      2: CAMPAIGN_ENEMY_TEAM_NAMES[mission.id] ?? "Ridge Guard",
    },
  };
}

// The enemy squad's display name per mission; unlisted missions read as the
// default "Ridge Guard".
const CAMPAIGN_ENEMY_TEAM_NAMES = Object.freeze({
  [NECROMANCER_MISSION_ID]: "Gatekeepers",
  [WITCH_DOCTOR_MISSION_ID]: "Swamp Coven",
  [FATHER_TIME_MISSION_ID]: "Timeless Court",
  [VIRUS_MISSION_ID]: "Viral Root",
  [PALADIN_MISSION_ID]: "Wandering Paladin",
  [MONK_MISSION_ID]: "Temple Monks",
  [BROTHERS_MISSION_ID]: "The Brothers",
  [GARGOYLE_MISSION_ID]: "Ashfall Guardian",
  [SNIPER_MISSION_ID]: "The High Guard",
  [WANDERING_PARTY_MISSION_ID]: "The Wanderers",
  [MINER_MISSION_ID]: "Buried Claim",
  [HASBEEN_HEROES_MISSION_ID]: "The Has-Beens",
  [RONIN_MISSION_ID]: "Island Protector",
  [WRONG_PLACE_MISSION_ID]: "Riot Detail",
  [OUT_OF_RETIREMENT_MISSION_ID]: "Retired Saints",
  [SPIRIT_WOODS_MISSION_ID]: "Wild Court",
  [SHOWDOWN_MISSION_ID]: "The Fat Party",
  [NOT_MY_KING_MISSION_ID]: "Void Crown",
  [VOIDWOOD_MISSION_ID]: "Voidwood Remnant",
  [VOID_CASTLE_MISSION_ID]: "The Void Court",
  [FINAL_BATTLE_MISSION_ID]: "The Void",
});

export function prepareCampaignMatchState(match, missionId = CLOD_MISSION_ID, options = {}) {
  const layout = CAMPAIGN_LAYOUTS[missionId];
  if (!layout) return match;
  const campaignBoost = startCampaignDamageBoosts(options.storage ?? defaultStorage(), { now: options.now });
  const tileObjects = {
    ...(match.tileObjects ?? {}),
    ...(layout.tileObjects?.() ?? {}),
  };
  const units = match.units.map((unit) => {
    const definition = getUnitType(unit.type);
    const maxHp = definition.stats.maxHp;
    return {
      ...unit,
      position: { ...(layout.positions[unit.id] ?? layout.fallback(unit)) },
      hp: layout.hpFor
        ? layout.hpFor(unit, maxHp)
        : layout.fullHp
        ? maxHp
        : Math.ceil(maxHp / 2),
      mp: getInitialMp(definition),
      spent: false,
      defending: false,
      ...(layout.skinFor ? { skin: layout.skinFor(unit) } : {}),
    };
  });
  const trial = layout.prepareTrial?.(match, units) ?? { units, rngState: match.rngState, missionRules: null };
  const prepared = {
    ...match,
    currentPlayer: layout.currentPlayer ?? 1,
    activation: null,
    ...(missionId === FATHER_TIME_MISSION_ID
      ? { aiProfile: { fatherTimeCarry: { sourceId: "p2-0-father-time", targetId: "p2-1-archer" } } }
      : missionId === VIRUS_MISSION_ID
      ? { aiProfile: { virusMisfortune: { sourceId: "p2-3-witch-doctor" } } }
      : missionId === MONK_MISSION_ID
      ? { aiProfile: { monkTrialArts: true } }
      : missionId === VOID_CASTLE_MISSION_ID
      // The whole phase-2 puzzle is carried by the ghosts, so the Summoners have to keep
      // calling them. Without this bias a Summoner will often just plink with a basic
      // attack and the player never gets a name to read.
      ? { aiProfile: { voidCastleSummonArts: true } }
      : {}),
    tileObjects,
    weather: normalizeWeatherSpec(layout.weather ?? match.weather),
    rngState: trial.rngState,
    ...(trial.missionRules || layout.missionRules || campaignBoost.damageBonus > 0
      ? {
          missionRules: {
            ...(layout.missionRules?.(match) ?? {}),
            ...(trial.missionRules ?? {}),
            ...(campaignBoost.damageBonus > 0
              ? { campaignDamageBoost: { player: 1, amount: campaignBoost.damageBonus } }
              : {}),
          },
        }
      : {}),
    units: [...trial.units, ...(layout.extraUnits?.(match) ?? [])],
  };
  openAutomaticFirstActivation(prepared);
  return prepared;
}
