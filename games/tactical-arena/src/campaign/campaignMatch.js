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
} from "./campaignConstants.js";
import { getInitialMp, getUnitType } from "../core/unitCatalog.js";
import { createUnit, findUnit } from "../core/state.js";
import { nextRandom } from "../core/rng.js";
import { ORTHOGONAL_DIRECTIONS, positionKey } from "../rules/movement.js";
import { normalizeWeatherSpec } from "../core/weather.js";
import { DEFAULT_SQUAD, UNIT_TYPE_KEYS } from "../ui/squadModel.js";
import { isProgressUnitUnlocked } from "../progression/unlocks.js";
import { getNicknamePref } from "../ui/nicknameModel.js";
import { getCampaignMission } from "./campaignModel.js";
import { defaultStorage } from "./campaignProgress.js";

export function campaignMissionHasAuthoredWeather(missionOrId) {
  const missionId = typeof missionOrId === "string" ? missionOrId : missionOrId?.id ?? null;
  if (!missionId || missionId === SPIRIT_WOODS_MISSION_ID) return false;
  const layout = CAMPAIGN_LAYOUTS[missionId];
  if (!layout) return false;
  const rules = typeof layout.missionRules === "function" ? layout.missionRules() : layout.missionRules;
  return Boolean(layout.weather || rules?.permanentWeather || rules?.weatherCycle);
}

export function campaignRestrictedUnitTypes(storage = defaultStorage(), missionOrId = null) {
  return campaignMissionHasAuthoredWeather(missionOrId) ? ["mother-nature"] : [];
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
      1: playerSquad.map((type) => selectedSkins?.[type] ?? null),
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
      2: mission.id === WANDERING_PARTY_MISSION_ID
        ? "The Wanderers"
        : mission.id === HASBEEN_HEROES_MISSION_ID
        ? "The Has-Beens"
        : mission.id === MINER_MISSION_ID
        ? "Buried Claim"
        : mission.id === RONIN_MISSION_ID
        ? "Island Protector"
        : mission.id === WRONG_PLACE_MISSION_ID
        ? "Riot Detail"
        : mission.id === OUT_OF_RETIREMENT_MISSION_ID
        ? "Retired Saints"
        : mission.id === SPIRIT_WOODS_MISSION_ID
        ? "Wild Court"
        : mission.id === NOT_MY_KING_MISSION_ID
        ? "Void Crown"
        : mission.id === SHOWDOWN_MISSION_ID
        ? "The Fat Party"
        : mission.id === VOIDWOOD_MISSION_ID
        ? "Voidwood Remnant"
        : mission.id === SNIPER_MISSION_ID
        ? "The High Guard"
        : mission.id === FATHER_TIME_MISSION_ID
        ? "Timeless Court"
        : mission.id === VIRUS_MISSION_ID
        ? "Viral Root"
        : mission.id === PALADIN_MISSION_ID
        ? "Wandering Paladin"
        : mission.id === MONK_MISSION_ID
        ? "Temple Monks"
        : mission.id === GARGOYLE_MISSION_ID
        ? "Ashfall Guardian"
        : mission.id === BROTHERS_MISSION_ID
        ? "The Brothers"
        : mission.id === WITCH_DOCTOR_MISSION_ID
        ? "Swamp Coven"
        : mission.id === NECROMANCER_MISSION_ID
          ? "Gatekeepers"
          : "Ridge Guard",
    },
  };
}

// The swamp lattice: a SPREAD 3×3 Ghoul grid, spacing 2 (x,y each in {2,4,6}) — close enough
// that every gap between Ghouls is covered by either a Ghoul's orthogonal fire or another
// Ghoul's diagonal Bite range (Chebyshev 1), so nothing inside the lattice's own footprint is
// free to walk except a Ghoul's own tile once it's dead. Spacing 2 (not the old spacing-4
// lattice) is what closes the "avenue" loophole those wider gaps used to leave open. The
// lattice's own top-right slot is left empty for the Witch Doctor rather than a ninth Ghoul.
const WITCH_DOCTOR_LATTICE_VALUES = Object.freeze([2, 4, 6]);
const WITCH_DOCTOR_SLOT = Object.freeze({ x: 6, y: 2 }); // top-right of the lattice
const WITCH_DOCTOR_SPAWN = Object.freeze({ x: 0, y: WITCH_DOCTOR_BOARD_SIZE - 1 });
const WITCH_DOCTOR_GHOUL_POSITIONS = Object.freeze(
  WITCH_DOCTOR_LATTICE_VALUES.flatMap((y) => WITCH_DOCTOR_LATTICE_VALUES.map((x) => ({ x, y })))
    .filter((p) => !(p.x === WITCH_DOCTOR_SLOT.x && p.y === WITCH_DOCTOR_SLOT.y))
    .map((p) => Object.freeze(p))
);
const WITCH_DOCTOR_GHOUL_POSITION_KEYS = new Set(WITCH_DOCTOR_GHOUL_POSITIONS.map(positionKey));
const MONK_TRIAL_POSITIONS = Object.freeze([
  Object.freeze({ x: 7, y: 0 }),
  Object.freeze({ x: 8, y: 1 }),
  Object.freeze({ x: 8, y: 0 }),
  Object.freeze({ x: 7, y: 1 }),
]);
const MONK_TRIAL_CENTER_POSITION = Object.freeze({ x: 4, y: 4 });
const MONK_TRIAL_ALERT_POSITION = Object.freeze({ x: 8, y: 0 });
const MONK_TRIAL_FAKE_ART_SETS = Object.freeze([
  Object.freeze({ "front-kick": "Lotus Uppercut", protect: "Mirror Palm" }),
  Object.freeze({ "front-kick": "Temple Sweep", protect: "Still Water Guard" }),
  Object.freeze({ "front-kick": "Cloudbreaker Kick", protect: "Incense Veil" }),
]);

// Fire has two unioned sources:
// 1. Each Ghoul's four ORTHOGONAL neighbours, clipped to the board and excluding any tile
//    that's itself a Ghoul position (spacing 2 means that never actually happens here, but
//    the guard stays cheap insurance against a future spacing change). This lattice fire only
//    reaches 1 tile past the outermost Ghouls, so on its own it leaves the true board edge
//    open — a gap the old spacing-4 layout let a player walk clean around.
// 2. A full 1-tile fire border along the true edges of the map itself (all four sides),
//    minus the player's spawn tile. This is what actually stops the edge-creep: the lattice
//    is positioned with exactly 1 tile of clearance from the board edge, so its own outward
//    fire sits immediately adjacent to this border with no safe ring left between them.
function ghoulOrthogonalFireKeys() {
  const keys = new Set();
  for (const ghoul of WITCH_DOCTOR_GHOUL_POSITIONS) {
    for (const dir of ORTHOGONAL_DIRECTIONS) {
      const p = { x: ghoul.x + dir.x, y: ghoul.y + dir.y };
      if (p.x < 0 || p.y < 0 || p.x >= WITCH_DOCTOR_BOARD_SIZE || p.y >= WITCH_DOCTOR_BOARD_SIZE) continue;
      if (WITCH_DOCTOR_GHOUL_POSITION_KEYS.has(positionKey(p))) continue;
      keys.add(positionKey(p));
    }
  }
  return keys;
}

function mapBorderFireKeys() {
  const keys = new Set();
  const max = WITCH_DOCTOR_BOARD_SIZE - 1;
  const spawnKey = positionKey(WITCH_DOCTOR_SPAWN);
  for (let x = 0; x <= max; x += 1) {
    for (const y of [0, max]) {
      const key = positionKey({ x, y });
      if (key !== spawnKey) keys.add(key);
    }
  }
  for (let y = 0; y <= max; y += 1) {
    for (const x of [0, max]) {
      const key = positionKey({ x, y });
      if (key !== spawnKey) keys.add(key);
    }
  }
  return keys;
}

const WITCH_DOCTOR_FIRE_POSITIONS = Object.freeze(
  [...new Set([...ghoulOrthogonalFireKeys(), ...mapBorderFireKeys()])].map((key) => {
    const [x, y] = key.split(",").map(Number);
    return Object.freeze({ x, y });
  })
);

function createCampaignGhoul(index, position, idPrefix = "p2-swamp-ghoul", skin = null) {
  return {
    ...createUnit({
      id: `${idPrefix}-${index}`,
      player: 2,
      team: 2,
      type: "ghoul",
      x: position.x,
      y: position.y,
      hp: 5,
      mp: 0,
      skin,
    }),
    spent: true,
    summonerId: null,
  };
}

function shuffledMonkTrialPositions(rngState) {
  let state = rngState;
  const positions = MONK_TRIAL_POSITIONS.map((position) => ({ ...position }));
  for (let index = positions.length - 1; index > 0; index -= 1) {
    const roll = nextRandom(state);
    state = roll.state;
    const swap = Math.floor(roll.value * (index + 1));
    [positions[index], positions[swap]] = [positions[swap], positions[index]];
  }
  return { positions, rngState: state };
}

function prepareMonkTrial(match, units) {
  const monks = units.filter((unit) => unit.player === 2 && unit.type === "monk");
  if (monks.length !== 4) return { units, rngState: match.rngState, missionRules: null };
  const realRoll = nextRandom(match.rngState);
  const realIndex = Math.min(monks.length - 1, Math.floor(realRoll.value * monks.length));
  const shuffled = shuffledMonkTrialPositions(realRoll.state);
  const realMonkId = monks[realIndex].id;
  let fakeIndex = 0;
  const positionByMonkId = new Map(monks.map((unit, index) => [unit.id, shuffled.positions[index]]));
  const finalPositions = Object.fromEntries(monks.map((unit) => {
    const position = positionByMonkId.get(unit.id) ?? unit.position;
    return [unit.id, { x: position.x, y: position.y }];
  }));
  const prepared = units.map((unit) => {
    if (unit.player === 1) return { ...unit, introHidden: true };
    if (unit.player !== 2 || unit.type !== "monk") return unit;
    const real = unit.id === realMonkId;
    const fakeArtNames = real ? null : MONK_TRIAL_FAKE_ART_SETS[fakeIndex++ % MONK_TRIAL_FAKE_ART_SETS.length];
    return {
      ...unit,
      position: real ? { ...MONK_TRIAL_CENTER_POSITION } : (positionByMonkId.get(unit.id) ?? unit.position),
      introHidden: !real,
      trialIntroAlert: false,
      trialRealMonk: real,
      trialFakeMonk: !real,
      ...(fakeArtNames ? { fakeArtNames: { ...fakeArtNames } } : {}),
    };
  });
  return {
    units: prepared,
    rngState: shuffled.rngState,
    missionRules: { monkTrial: { realMonkId, finalPositions, introComplete: false } },
  };
}

export function applyMonkTrialIntroBeat(state, beat) {
  if (!state?.missionRules?.monkTrial) return state;
  if (beat === "monkIntroRevealAndMove") {
    const realMonkId = state.missionRules.monkTrial.realMonkId;
    return {
      ...state,
      units: state.units.map((unit) => {
        if (unit.player === 1) return { ...unit, introHidden: false };
        if (unit.id === realMonkId) {
          return {
            ...unit,
            position: { ...MONK_TRIAL_ALERT_POSITION },
            introHidden: false,
            trialIntroAlert: true,
          };
        }
        return unit;
      }),
    };
  }
  if (beat === "monkIntroSplitShuffle" || beat === "monkIntroComplete") {
    const finalPositions = state.missionRules.monkTrial.finalPositions ?? {};
    return {
      ...state,
      missionRules: {
        ...state.missionRules,
        monkTrial: {
          ...state.missionRules.monkTrial,
          introComplete: true,
        },
      },
      units: state.units.map((unit) => {
        const finalPosition = finalPositions[unit.id];
        return {
          ...unit,
          ...(finalPosition ? { position: { ...finalPosition } } : {}),
          introHidden: false,
          trialIntroAlert: false,
        };
      }),
    };
  }
  return state;
}

// The High Ground plateau (13×13): destructible cover walls (hp 1) and permanent
// cliff-fire tiles spread across the whole board, not clustered into one lane — the
// plateau should read as a contested field with patterned cover and hazards in every quadrant.
// Walls block both physical and magic sightlines (isWallBetween) and are the
// "destroy a wall" objective's targets; the permanent fire never burns out, so
// "avoid fire damage" is a full-match route constraint. Neither set sits on or beside
// a spawn tile (see SNIPER_MISSION_ID's standard-formation layout below).
const SNIPER_WALL_POSITIONS = Object.freeze([
  Object.freeze({ x: 3, y: 10 }),
  Object.freeze({ x: 4, y: 9 }),
  Object.freeze({ x: 3, y: 8 }),
  Object.freeze({ x: 9, y: 3 }),
  Object.freeze({ x: 10, y: 3 }),
  Object.freeze({ x: 9, y: 4 }),
  Object.freeze({ x: 5, y: 6 }),
  Object.freeze({ x: 6, y: 6 }),
  Object.freeze({ x: 7, y: 6 }),
]);
const SNIPER_FIRE_POSITIONS = Object.freeze([
  Object.freeze({ x: 2, y: 7 }),
  Object.freeze({ x: 3, y: 7 }),
  Object.freeze({ x: 4, y: 7 }),
  Object.freeze({ x: 8, y: 5 }),
  Object.freeze({ x: 9, y: 5 }),
  Object.freeze({ x: 10, y: 5 }),
  Object.freeze({ x: 5, y: 10 }),
  Object.freeze({ x: 6, y: 10 }),
  Object.freeze({ x: 7, y: 10 }),
  Object.freeze({ x: 5, y: 2 }),
  Object.freeze({ x: 6, y: 2 }),
  Object.freeze({ x: 7, y: 2 }),
]);

const MINER_PLAYER_SPAWN = Object.freeze({ x: 0, y: 8 });
const MINER_ENEMY_SPAWN = Object.freeze({ x: 8, y: 0 });
const RONIN_PLAYER_SPAWN = Object.freeze({ x: 0, y: 4 });
const RONIN_ENEMY_SPAWN = Object.freeze({ x: 8, y: 4 });
const RONIN_WEATHER_CYCLE = Object.freeze(["blizzard", "heatwave", "spring", "thunderstorm"]);

function minerWallObjects() {
  const walls = {};
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 9; x += 1) {
      const spawn =
        (x === MINER_PLAYER_SPAWN.x && y === MINER_PLAYER_SPAWN.y) ||
        (x === MINER_ENEMY_SPAWN.x && y === MINER_ENEMY_SPAWN.y);
      if (!spawn) walls[positionKey({ x, y })] = { kind: "wall", hp: 1 };
    }
  }
  return walls;
}

// Each campaign mission owns a spawn layout: hardcoded coordinates for the fixed
// enemy pieces (their ids are deterministic), plus a slot-index fallback that places
// whatever units the player drafted (the squad is player-chosen, so player ids are not
// known ahead of time). Keyed by mission id so a new mission only adds a table entry.
const CAMPAIGN_LAYOUTS = Object.freeze({
  [CLOD_MISSION_ID]: {
    positions: {
      "p1-0-mystic": { x: 2, y: 6 },
      "p1-1-magician": { x: 2, y: 4 },
      "p2-0-clod": { x: 7, y: 5 },
      "p2-1-juggernaut": { x: 8, y: 7 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? (unit.id.includes("-0-") ? { x: 2, y: 6 } : { x: 2, y: 4 })
        : (unit.id.includes("-0-") ? { x: 7, y: 5 } : { x: 8, y: 7 }),
  },
  // Necromancer's Gate (13×13): the Necromancer holds the backline; the Virus sits
  // forward enough to threaten but stays focusable; the player's two units spawn in the
  // opposite corner, spread one tile apart with a clean approach outside turn-one Cough
  // range (Virus range 5, opening distance 6).
  [NECROMANCER_MISSION_ID]: {
    positions: {
      "p2-0-necromancer": { x: 10, y: 2 },
      "p2-1-virus": { x: 8, y: 5 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? (unit.id.includes("-0-") ? { x: 4, y: 9 } : { x: 2, y: 10 })
        : (unit.id.includes("-0-") ? { x: 10, y: 2 } : { x: 8, y: 5 }),
  },
  // Cursed Swamp (9x9): the Archer starts in the bottom-left corner, boxed in by the map-edge
  // fire border on two sides, and pushes toward the Witch Doctor standing in the spread
  // lattice's own vacated top-right slot (see WITCH_DOCTOR_GHOUL_POSITIONS + the fire-source
  // comment above it).
  [WITCH_DOCTOR_MISSION_ID]: {
    positions: {
      "p2-0-witch-doctor": { ...WITCH_DOCTOR_SLOT },
    },
    fallback: (unit) =>
      unit.player === 1
        ? { ...WITCH_DOCTOR_SPAWN }
        : { ...WITCH_DOCTOR_SLOT },
    extraUnits: () => WITCH_DOCTOR_GHOUL_POSITIONS.map((position, index) => createCampaignGhoul(index, position)),
    tileObjects: () => Object.fromEntries(
      WITCH_DOCTOR_FIRE_POSITIONS.map((position) => [positionKey(position), { kind: "fire", permanent: true }])
    ),
  },
  // Timeless Woods (11x11): normal corner placement. The default match builder already
  // creates the intended two-slot corner blocks, so this layout only gives the mission
  // deterministic half-HP starts and stable enemy ids for dialogue/objectives.
  [FATHER_TIME_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
  },
  // Root of the Virus (11x11): a normal corner-spawn 4v4 duel. Only HP prep differs
  // from earlier campaign lessons: this is the first official full-HP squad match.
  [VIRUS_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
  },
  // Wandering Paladin (5x5): a clean 1v1. The player's chosen champion starts in
  // the near corner; the Paladin waits in the opposite corner on a default light
  // tile so Lightseeker is immediately legible if the player also stands in light.
  [PALADIN_MISSION_ID]: {
    positions: {
      "p2-0-paladin": { x: 4, y: 0 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? { x: 0, y: 4 }
        : { x: 4, y: 0 },
    fullHp: true,
  },
  // Temple Trial (9x9): the player's full squad starts in the near corner. The
  // four enemy Monks are shuffled into the far corner after one is randomly marked
  // real; only the real Monk sustains the trial.
  [MONK_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    prepareTrial: prepareMonkTrial,
  },
  // Gargoyle's Inferno (9x9): a clean corner duel with a mission rule that adds one
  // temporary fire tile at every turn rollover while the Gargoyle lives.
  [GARGOYLE_MISSION_ID]: {
    positions: {
      "p2-0-gargoyle": { x: 8, y: 0 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? { x: 0, y: 8 }
        : { x: 8, y: 0 },
    fullHp: true,
    weather: "heatwave",
    missionRules: () => ({ randomFire: { sourceId: "p2-0-gargoyle", turnsLeft: 3 } }),
  },
  // The High Ground of the Sniper (13×13): a full-HP 2v2 on the STANDARD corner
  // formation — the Archer (pinned to slot one) and her chosen ally spawn in the
  // player's usual corner block, the enemy Sniper and Clod spawn in theirs, same as
  // every other default-formation mission. Cover walls + permanent cliff-fire are
  // patterned across the whole board (see SNIPER_WALL/FIRE_POSITIONS above).
  [SNIPER_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    tileObjects: () => ({
      ...Object.fromEntries(SNIPER_WALL_POSITIONS.map((position) => [positionKey(position), { kind: "wall", hp: 1 }])),
      ...Object.fromEntries(SNIPER_FIRE_POSITIONS.map((position) => [positionKey(position), { kind: "fire", permanent: true }])),
    }),
  },
  // Mechs on the Farm (9×9): a standard full-HP 2v2 on the default corner blocks — no
  // walls, fire, or trial. The brothers field as themselves in the opposite corner. The
  // deterministic ids (p2-0-big-brother / p2-1-little-brother) back the dialogue + grading.
  [BROTHERS_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
  },
  // The Wandering Party (13×13): a plain full-HP 4v4 on the default corner blocks. The
  // only twist is skinFor, which paints the enemy party in its "wandering" skins so the
  // travelers read as the costumed party the cutscenes describe (board sprites + any
  // dialogue portrait that reads a live unit's skin). skinFor bypasses the account
  // unlock gate on purpose — the player has not earned these skins yet, they are just
  // seeing the wanderers wear them.
  [WANDERING_PARTY_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    skinFor: (unit) => (unit.player === 2 ? "wandering" : unit.skin ?? null),
  },
  [MINER_MISSION_ID]: {
    positions: {
      "p2-0-miner": { ...MINER_ENEMY_SPAWN },
    },
    fallback: (unit) =>
      unit.player === 1
        ? { ...MINER_PLAYER_SPAWN }
        : { ...MINER_ENEMY_SPAWN },
    fullHp: true,
    tileObjects: minerWallObjects,
  },
  // Has-Been Heroes (13×13): a 4v4 on the default corner blocks — no walls, no fire, no
  // trial. The fat squad fields as itself in the opposite corner, worn down to 20 HP
  // apiece (per the mission's "worn-out"/"a little extra to prove" framing) while the
  // player's squad stays at full HP.
  [HASBEEN_HEROES_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    hpFor: (unit, maxHp) => (unit.player === 2 ? Math.min(20, maxHp) : maxHp),
  },
  [RONIN_MISSION_ID]: {
    positions: {
      "p2-0-ronin": { ...RONIN_ENEMY_SPAWN },
    },
    fallback: (unit) =>
      unit.player === 1
        ? { ...RONIN_PLAYER_SPAWN }
        : { ...RONIN_ENEMY_SPAWN },
    fullHp: true,
    weather: RONIN_WEATHER_CYCLE[0],
    missionRules: () => ({
      weatherCycle: {
        sequence: [...RONIN_WEATHER_CYCLE],
        intervalTurns: 2,
        sourceId: null,
      },
      roninDuel: {
        playerId: null,
        roninId: "p2-0-ronin",
      },
    }),
  },
  [WRONG_PLACE_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    hpFor: () => 5,
    skinFor: (unit) => (
      unit.player === 2 && unit.type === "riot-cop"
        ? [null, "swat-team", "firefighter", "street-patrol"][Number(unit.id.match(/^p2-(\d+)-/)?.[1]) || 0] ?? null
        : unit.skin ?? null
    ),
  },
  [OUT_OF_RETIREMENT_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    weather: "heatwave",
    skinFor: (unit) => (
      unit.player === 2 && (unit.type === "angel" || unit.type === "paladin")
        ? "summer-vibes"
        : unit.skin ?? null
    ),
  },
  [SPIRIT_WOODS_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    skinFor: (unit) => (
      unit.player === 2 && unit.type === "paladin"
        ? "gaia's-protector"
        : unit.skin ?? null
    ),
  },
  [SHOWDOWN_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    weather: "blizzard",
    missionRules: () => ({
      permanentWeather: { weather: "blizzard", sourceId: null },
    }),
  },
  [NOT_MY_KING_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    weather: "heatwave",
    currentPlayer: 2,
    skinFor: (unit) => (
      unit.player === 2 && NOT_MY_KING_ENEMY_TYPES.includes(unit.type)
        ? "void-dweller"
        : unit.skin ?? null
    ),
    missionRules: () => ({
      permanentWeather: { weather: "heatwave", sourceId: null },
    }),
  },
  [VOIDWOOD_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    skinFor: (unit) => (
      unit.player === 2
        ? ({
            treant: "voidroot",
            angel: "void-dweller",
            "witch-doctor": "void-dweller",
            necromancer: "void-dweller",
          }[unit.type] ?? unit.skin ?? null)
        : unit.skin ?? null
    ),
    extraUnits: () => WITCH_DOCTOR_GHOUL_POSITIONS.map((position, index) =>
      createCampaignGhoul(index, position, "p2-voidwood-ghoul", "void-dweller")),
  },
});

export function prepareCampaignMatchState(match, missionId = CLOD_MISSION_ID) {
  const layout = CAMPAIGN_LAYOUTS[missionId];
  if (!layout) return match;
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
  return {
    ...match,
    currentPlayer: layout.currentPlayer ?? 1,
    activation: null,
    ...(missionId === FATHER_TIME_MISSION_ID
      ? { aiProfile: { fatherTimeCarry: { sourceId: "p2-0-father-time", targetId: "p2-1-archer" } } }
      : missionId === VIRUS_MISSION_ID
      ? { aiProfile: { virusMisfortune: { sourceId: "p2-3-witch-doctor" } } }
      : missionId === MONK_MISSION_ID
      ? { aiProfile: { monkTrialArts: true } }
      : {}),
    tileObjects,
    weather: normalizeWeatherSpec(layout.weather ?? match.weather),
    rngState: trial.rngState,
    ...(trial.missionRules || layout.missionRules
      ? { missionRules: { ...(layout.missionRules?.(match) ?? {}), ...(trial.missionRules ?? {}) } }
      : {}),
    units: [...trial.units, ...(layout.extraUnits?.(match) ?? [])],
  };
}
