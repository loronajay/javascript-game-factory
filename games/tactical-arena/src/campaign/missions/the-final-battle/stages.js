// The Final Battle (mission 22) — the stage machine.
//
// This is the campaign's first FIVE-stage battle, and the first one that swaps the board
// out from under the player. It generalizes the two-part seam Void Ridden Castle
// introduced (see applyVoidCastleSplit): a stage that "should" have ended the match sets
// `pendingStage`, resolveVictory completes normally so the turn loop never stalls, and
// main.js reverts the win and drives the next stage from a dialogue beat.
//
//   stage 0 — the confrontation. Blacksword stands at the middle of the board, the party
//             walks in. Nobody acts: the opening dialogue blacks the screen out and calls
//             straight into stage 1.
//   stage 1-4 — one MIRROR DUEL per party member, in squad-slot order, on a cramped 5×5.
//             Your unit against a copy of itself, both flattened to the same 10 HP so
//             neither body has an edge over its own reflection. Lose one and the run ends
//             — the copy takes your place in the world.
//   stage 5 — the last stand. All four come back whole; Blacksword fights you himself.
//
// Everything not standing on the current board lives on `missionRules.finalBattle.bench` as
// a plain snapshot, so `state.units` always means exactly "who is on this board right now"
// — no benched-but-alive unit for auras, line of sight, AI targeting, or victory to trip
// over. Pure transforms; the dialogue layer calls them on a beat.

import {
  FINAL_BATTLE_BOARD_SIZE,
  FINAL_BATTLE_BOSS_HP,
  FINAL_BATTLE_BOSS_ID,
  FINAL_BATTLE_BOSS_RAGE_THRESHOLD,
  FINAL_BATTLE_BOSS_STRENGTH,
  FINAL_BATTLE_DARK_TILE_STATUS_SOURCE,
  FINAL_BATTLE_DARK_TILE_STATUSES,
  FINAL_BATTLE_DUEL_BOARD_SIZE,
  FINAL_BATTLE_DUEL_HP,
  FINAL_BATTLE_VOID_REACH,
  FINAL_BATTLE_VOID_PRESSURE_DAMAGE,
} from "../../campaignConstants.js";
import { createUnit } from "../../../core/state.js";
import { getInitialMp, getUnitType } from "../../../core/unitCatalog.js";
import { syncFinalBattleDarkTileStatuses } from "../../../core/turnEngine.js";

export const FINAL_BATTLE_DUEL_COUNT = 4;
export const FINAL_BATTLE_STAGE_CONFRONTATION = 0;
export const FINAL_BATTLE_STAGE_LAST_STAND = FINAL_BATTLE_DUEL_COUNT + 1; // 5

// Stage 0 (the confrontation) is fought on the full board: Blacksword waits dead centre.
const BOSS_CONFRONTATION_POSITION = Object.freeze({ x: 5, y: 5 });
// Stage 5: he backs into the far corner and the party forms up in theirs.
const BOSS_LAST_STAND_POSITION = Object.freeze({ x: 10, y: 0 });
const PARTY_LAST_STAND_POSITIONS = Object.freeze([
  Object.freeze({ x: 0, y: 10 }),
  Object.freeze({ x: 1, y: 10 }),
  Object.freeze({ x: 0, y: 9 }),
  Object.freeze({ x: 1, y: 9 }),
]);
// The duel board: opposite corners of the 5×5, four tiles apart. Nowhere to hide.
const DUEL_CHAMPION_POSITION = Object.freeze({ x: 0, y: FINAL_BATTLE_DUEL_BOARD_SIZE - 1 });
const DUEL_MIRROR_POSITION = Object.freeze({ x: FINAL_BATTLE_DUEL_BOARD_SIZE - 1, y: 0 });

export function getFinalBattleRules(state) {
  return state?.missionRules?.finalBattle ?? null;
}

export function finalBattleDuelistType(state, stage) {
  const rules = getFinalBattleRules(state);
  return rules?.duelTypes?.[stage - 1] ?? null;
}

// The party member fighting the CURRENT duel, if a duel is what's on the board.
export function finalBattleDuelist(state) {
  const rules = getFinalBattleRules(state);
  if (!rules || rules.stage < 1 || rules.stage > FINAL_BATTLE_DUEL_COUNT) return null;
  return (state.units ?? []).find((unit) => unit.player === 1) ?? null;
}

export function finalBattleBoss(state) {
  return (state?.units ?? []).find((unit) => unit.id === FINAL_BATTLE_BOSS_ID) ?? null;
}

// Blacksword the BOSS. Not the unit the player is about to unlock: the 30 HP / 10 STR
// definition is left alone and this one body is handed a granted stat block (through the
// standard additive statModifiers seam, so every effective-stat reader folds it with no
// special case) plus Void Reach as an instance passive.
export function makeFinalBattleBoss(unit) {
  const base = getUnitType("blacksword").stats;
  return {
    ...unit,
    id: FINAL_BATTLE_BOSS_ID,
    hp: FINAL_BATTLE_BOSS_HP,
    mp: 0,
    rageThreshold: FINAL_BATTLE_BOSS_RAGE_THRESHOLD,
    statModifiers: {
      ...(unit.statModifiers ?? {}),
      maxHp: FINAL_BATTLE_BOSS_HP - base.maxHp,
      strength: FINAL_BATTLE_BOSS_STRENGTH - base.strength,
    },
    bonusPassives: [FINAL_BATTLE_VOID_REACH],
    artOverrides: {
      ...(unit.artOverrides ?? {}),
      "void-gravity": {
        hpCost: 5,
        description: "Spend 5 HP to shift every enemy within 3 tiles by 1 random orthogonal tile. Blocked and displacement-immune units stay put.",
      },
    },
  };
}

// Match prep: the confrontation. The party spawns in its usual corner block (createMatchState
// already put it there); Blacksword takes the middle of the board and waits.
export function prepareFinalBattle(match, units) {
  const duelTypes = units
    .filter((unit) => unit.player === 1)
    .map((unit) => unit.type);
  const prepared = units.map((unit) => {
    if (unit.player !== 2 || unit.type !== "blacksword") return unit;
    return {
      ...makeFinalBattleBoss(unit),
      position: { ...BOSS_CONFRONTATION_POSITION },
    };
  });
  return {
    units: prepared,
    rngState: match.rngState,
    missionRules: {
      finalBattle: {
        stage: FINAL_BATTLE_STAGE_CONFRONTATION,
        // resolveVictory (core) reads this instead of importing the campaign constant, so
        // the engine never has to know what mission 22 is.
        lastStage: FINAL_BATTLE_STAGE_LAST_STAND,
        duelTypes,
        bench: [],
        pendingStage: false,
        bossId: FINAL_BATTLE_BOSS_ID,
        voidPressureDamage: FINAL_BATTLE_VOID_PRESSURE_DAMAGE,
        darkTileStatusSource: FINAL_BATTLE_DARK_TILE_STATUS_SOURCE,
        darkTileStatuses: [...FINAL_BATTLE_DARK_TILE_STATUSES],
      },
    },
  };
}

// Everyone who is still in the mission: whoever is standing on the current board, UNIONED
// with whoever was already benched. Only the board changes between stages — the roster
// persists, so the bench has to be carried forward or a duel would quietly delete the three
// party members who were not in it. Fallen mirrors are dropped: a beaten copy does not come
// back, and a corpse from a 5×5 has no coordinates that mean anything on the next board.
function benchUnits(state) {
  const onBoard = state.units
    .filter((unit) => unit.player === 1 || unit.id === FINAL_BATTLE_BOSS_ID)
    .map((unit) => ({ ...unit }));
  const standing = new Set(onBoard.map((unit) => unit.id));
  const alreadyBenched = (getFinalBattleRules(state)?.bench ?? [])
    .filter((unit) => !standing.has(unit.id))
    .map((unit) => ({ ...unit }));
  return [...onBoard, ...alreadyBenched];
}

function restToFull(unit) {
  const definition = getUnitType(unit.type);
  return {
    ...unit,
    hp: definition.stats.maxHp,
    mp: getInitialMp(definition),
    statuses: [],
    spent: false,
    defending: false,
  };
}

// Clears everything a previous stage left lying around: the board changes size, so a wall
// or a fire tile keyed to the old coordinates would land somewhere arbitrary on the new one.
function clearBoard(state, size) {
  return {
    ...state,
    size,
    phase: "playing",
    winner: null,
    activation: null,
    currentPlayer: 1,
    tileObjects: {},
    weather: null,
  };
}

// The duel. One party member and its copy, alone on a 5×5, both at 10 HP. The copy wears the
// same skin and answers to the same name — that is the point of the scene, and it costs
// nothing but carrying two fields across.
function buildDuelStage(state, bench, stage) {
  const type = state.missionRules.finalBattle.duelTypes[stage - 1];
  const benched = bench.find((unit) => unit.player === 1 && unit.type === type);
  if (!benched) return state;
  const definition = getUnitType(benched.type);
  const champion = {
    ...benched,
    position: { ...DUEL_CHAMPION_POSITION },
    hp: FINAL_BATTLE_DUEL_HP,
    mp: getInitialMp(definition),
    statuses: [],
    statModifiers: {},
    spent: false,
    defending: false,
  };
  const mirror = {
    ...createUnit({
      id: `p2-mirror-${stage}-${benched.type}`,
      player: 2,
      team: 2,
      type: benched.type,
      x: DUEL_MIRROR_POSITION.x,
      y: DUEL_MIRROR_POSITION.y,
      hp: FINAL_BATTLE_DUEL_HP,
      mp: getInitialMp(definition),
      skin: benched.skin ?? null,
    }),
    nickname: benched.nickname ?? null,
    finalBattleMirror: true,
  };
  return {
    ...clearBoard(state, FINAL_BATTLE_DUEL_BOARD_SIZE),
    units: [champion, mirror],
    missionRules: {
      ...state.missionRules,
      finalBattle: {
        ...state.missionRules.finalBattle,
        stage,
        bench: bench.filter((unit) => unit.id !== champion.id),
        pendingStage: false,
      },
    },
  };
}

// The last stand. All four come back whole — they have each just fought their way back into
// the world, and a party worn down to nothing by four duels would make the boss a wall
// rather than a fight (the same reasoning behind the castle's Mystic shout).
function buildLastStand(state, bench) {
  // Rebuilt in SQUAD-SLOT order, not bench order — the bench is whatever order the units came
  // off the board in, and the party should form up the way the player arranged it.
  const party = state.missionRules.finalBattle.duelTypes
    .map((type) => bench.find((unit) => unit.player === 1 && unit.type === type))
    .filter(Boolean)
    .map((unit, index) => ({
      ...restToFull(unit),
      position: { ...(PARTY_LAST_STAND_POSITIONS[index] ?? PARTY_LAST_STAND_POSITIONS[0]) },
      statModifiers: {},
    }));
  const benchedBoss = bench.find((unit) => unit.id === FINAL_BATTLE_BOSS_ID);
  const boss = benchedBoss
    ? {
        ...makeFinalBattleBoss(benchedBoss),
        position: { ...BOSS_LAST_STAND_POSITION },
        statuses: [],
        spent: false,
        defending: false,
      }
    : null;
  const lastStand = {
    ...clearBoard(state, FINAL_BATTLE_BOARD_SIZE),
    units: boss ? [...party, boss] : party,
    missionRules: {
      ...state.missionRules,
      finalBattle: {
        ...state.missionRules.finalBattle,
        stage: FINAL_BATTLE_STAGE_LAST_STAND,
        bench: [],
        pendingStage: false,
      },
    },
  };
  syncFinalBattleDarkTileStatuses(lastStand);
  return lastStand;
}

// The one entry point the dialogue layer drives: tear the board down and build the next
// stage. Idempotent at the end of the run — once the last stand is up, there is nowhere
// left to advance to.
export function advanceFinalBattleStage(state) {
  const rules = getFinalBattleRules(state);
  if (!rules || rules.stage >= FINAL_BATTLE_STAGE_LAST_STAND) return state;
  const bench = benchUnits(state);
  const nextStage = rules.stage + 1;
  return nextStage <= FINAL_BATTLE_DUEL_COUNT
    ? buildDuelStage(state, bench, nextStage)
    : buildLastStand(state, bench);
}
