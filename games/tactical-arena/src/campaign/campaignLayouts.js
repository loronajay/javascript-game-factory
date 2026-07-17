// The per-mission spawn/board recipe table. Each entry pins fixed enemy pieces by
// deterministic id, gives player-drafted units a slot-index fallback, and may add
// tile objects, weather, HP/skin overrides, mission rules, or a prepareTrial hook.
// A new mission only adds a table entry. Extracted from campaignMatch.js, which
// keeps the assembler (prepareCampaignMatchState) that consumes this table.

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
  NOT_MY_KING_ENEMY_TYPES,
} from "./campaignConstants.js";
import { positionKey } from "../rules/movement.js";
import { prepareMonkTrial } from "./missions/monk-temple-trial/trial.js";
import {
  VOID_CASTLE_NEMESIS_HP,
  VOID_CASTLE_NEMESIS_SPAWNS,
  VOID_CASTLE_SUMMONER_SKIN,
  VOID_CASTLE_SUMMONER_SPAWN,
  prepareVoidCastleTrial,
} from "./missions/void-ridden-castle/trial.js";
import {
  WITCH_DOCTOR_FIRE_POSITIONS,
  WITCH_DOCTOR_GHOUL_POSITIONS,
  WITCH_DOCTOR_SLOT,
  WITCH_DOCTOR_SPAWN,
  createCampaignGhoul,
} from "./missions/witch-doctor-swamp/layout.js";
import { prepareFinalBattle } from "./missions/the-final-battle/stages.js";

export function campaignMissionHasAuthoredWeather(missionOrId) {
  const missionId = typeof missionOrId === "string" ? missionOrId : missionOrId?.id ?? null;
  if (!missionId || missionId === SPIRIT_WOODS_MISSION_ID) return false;
  const layout = CAMPAIGN_LAYOUTS[missionId];
  if (!layout) return false;
  const rules = typeof layout.missionRules === "function" ? layout.missionRules() : layout.missionRules;
  return Boolean(layout.weather || rules?.permanentWeather || rules?.weatherCycle);
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
export const CAMPAIGN_LAYOUTS = Object.freeze({
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
  // Gargoyle's Inferno (9x9): a clean corner duel under normal weather with a mission
  // rule that adds one temporary fire tile at every turn rollover while the Gargoyle lives.
  [GARGOYLE_MISSION_ID]: {
    positions: {
      "p2-0-gargoyle": { x: 8, y: 0 },
    },
    fallback: (unit) =>
      unit.player === 1
        ? { x: 0, y: 8 }
        : { x: 8, y: 0 },
    fullHp: true,
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
  // Void Ridden Castle (13×13): the throne room. The Summoner sits in the far corner with
  // three Nemesis bodies walled in front of him; the player's chosen squad takes the usual
  // corner block. Everything two-part about this mission lives in prepareVoidCastleTrial +
  // the voidCastleTrial rule read by resolveVictory.
  [VOID_CASTLE_MISSION_ID]: {
    positions: {
      "p2-0-summoner": { ...VOID_CASTLE_SUMMONER_SPAWN },
      "p2-1-nemesis": { ...VOID_CASTLE_NEMESIS_SPAWNS[0] },
      "p2-2-nemesis": { ...VOID_CASTLE_NEMESIS_SPAWNS[1] },
      "p2-3-nemesis": { ...VOID_CASTLE_NEMESIS_SPAWNS[2] },
    },
    fallback: (unit) => ({ ...unit.position }),
    hpFor: (unit, maxHp) => (
      unit.player === 2 && unit.type === "nemesis" ? VOID_CASTLE_NEMESIS_HP : maxHp
    ),
    // Only the Summoner has a void-dweller skin; Nemesis is already a void entity in its
    // base art, so it fields as itself.
    skinFor: (unit) => (
      unit.player === 2 && unit.type === "summoner" ? VOID_CASTLE_SUMMONER_SKIN : unit.skin ?? null
    ),
    prepareTrial: prepareVoidCastleTrial,
  },
  // The Final Battle (11×11 → 5×5 → 11×11): the party takes its usual corner block; the only
  // thing the layout itself does is hand the board to prepareFinalBattle, which stands
  // Blacksword in the middle of it and installs the five-stage rule block. Every board after
  // this one is built by the stage machine, not from a table — see
  // missions/the-final-battle/stages.js.
  [FINAL_BATTLE_MISSION_ID]: {
    positions: {},
    fallback: (unit) => ({ ...unit.position }),
    fullHp: true,
    skinFor: (unit) => (
      unit.player === 2 && unit.type === "blacksword" ? "void-dweller" : unit.skin ?? null
    ),
    prepareTrial: prepareFinalBattle,
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
