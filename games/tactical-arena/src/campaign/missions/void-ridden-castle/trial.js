// Void Ridden Castle: the two-part Summoner battle. Phase 1 walls the Summoner
// behind Nemesis bodies; the refused finishing blow splits him into four full-
// strength copies (one real, per the shuffled ghost pools) and the Mystic heals
// the surviving party. Extracted from campaignMatch.js; the presentation
// controller applies the beat/split/heal transforms on dialogue beats.

import { VOID_CASTLE_SUMMONER_COUNT } from "../../campaignConstants.js";
import { createUnit } from "../../../core/state.js";
import { getInitialMp, getUnitType } from "../../../core/unitCatalog.js";
import { nextRandom } from "../../../core/rng.js";
import { positionKey } from "../../../rules/movement.js";
import { VOID_CASTLE_GHOST_FAKE_NAMES, VOID_CASTLE_GHOST_POOLS } from "./ghosts.js";

// --- Void Ridden Castle (13×13, two-part battle) -------------------------------------
// Phase 1: the Summoner walls himself into the far corner behind three Nemesis bodies.
// The battle opens with ONE Nemesis on the board; a dialogue beat splits him into three,
// which is purely presentational (all three exist from the start, two just introHidden).
export const VOID_CASTLE_SUMMONER_SKIN = "void-dweller";
export const VOID_CASTLE_NEMESIS_HP = 10;
export const VOID_CASTLE_SUMMONER_SPAWN = Object.freeze({ x: 12, y: 0 });
export const VOID_CASTLE_NEMESIS_SPAWNS = Object.freeze([
  Object.freeze({ x: 11, y: 1 }), // the one that greets you, and stays put when he splits
  Object.freeze({ x: 11, y: 0 }),
  Object.freeze({ x: 12, y: 1 }),
]);
// Phase 2 puts all four Summoners back in that same corner block, at full HP/MP.
const VOID_CASTLE_SUMMONER_SLOTS = Object.freeze([
  Object.freeze({ x: 12, y: 0 }),
  Object.freeze({ x: 11, y: 0 }),
  Object.freeze({ x: 11, y: 1 }),
  Object.freeze({ x: 12, y: 1 }),
]);

// Pool index 0 is the REAL Summoner (see missions/void-ridden-castle/ghosts.js). The
// shuffle decides which of the four corner slots he respawns into, so the player can
// never learn the answer from position. Rolled once at match prep off the authoritative
// RNG, not at split time, so the split itself stays a pure, replayable transform.
function shuffledVoidCastlePools(rngState) {
  let state = rngState;
  const pools = VOID_CASTLE_GHOST_POOLS.map((_, index) => index);
  for (let index = pools.length - 1; index > 0; index -= 1) {
    const roll = nextRandom(state);
    state = roll.state;
    const swap = Math.floor(roll.value * (index + 1));
    [pools[index], pools[swap]] = [pools[swap], pools[index]];
  }
  return { pools, rngState: state };
}

function voidCastleSummonerSoul(poolIndex) {
  const fakeNames = VOID_CASTLE_GHOST_FAKE_NAMES[poolIndex];
  return {
    ghostPool: [...VOID_CASTLE_GHOST_POOLS[poolIndex]],
    ...(fakeNames ? { ghostFakeArtNames: { ...fakeNames } } : {}),
    trialRealSummoner: poolIndex === 0,
    trialDecoySummoner: poolIndex !== 0,
  };
}

export function prepareVoidCastleTrial(match, units) {
  const shuffled = shuffledVoidCastlePools(match.rngState);
  const prepared = units.map((unit) => {
    if (unit.player !== 2) return unit;
    if (unit.type === "summoner") {
      // The phase-1 Summoner is the real one, so his ghosts already speak truthfully —
      // an attentive player can bank the real ART names before the split even happens.
      return { ...unit, ...voidCastleSummonerSoul(0) };
    }
    if (unit.type !== "nemesis") return unit;
    const index = Number(unit.id.match(/^p2-(\d+)-/)?.[1] ?? 0) - 1;
    return { ...unit, introHidden: index > 0 };
  });
  return {
    units: prepared,
    rngState: shuffled.rngState,
    missionRules: {
      voidCastleTrial: {
        phase: 1,
        poolBySlot: [...shuffled.pools],
        realSummonerId: null,
        pendingSplit: false,
        introComplete: false,
      },
    },
  };
}

// Reveals the two held-back Nemesis bodies. Called from the opening script's afterAction.
export function applyVoidCastleIntroBeat(state, beat) {
  if (!state?.missionRules?.voidCastleTrial) return state;
  if (beat !== "voidCastleNemesisSplit") return state;
  return {
    ...state,
    missionRules: {
      ...state.missionRules,
      voidCastleTrial: { ...state.missionRules.voidCastleTrial, introComplete: true },
    },
    units: state.units.map((unit) => (unit.introHidden ? { ...unit, introHidden: false } : unit)),
  };
}

// A landing tile for a respawning Summoner. The corner block is normally clear, but the
// player may have pushed into it, and a phase-1 ghost (the real Summoner can call a Sniper
// or a Miner) may have left a wall standing there. Expanding-ring search off the slot.
function findOpenTile(slot, taken, size) {
  for (let radius = 0; radius < size; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const position = { x: slot.x + dx, y: slot.y + dy };
        if (position.x < 0 || position.y < 0 || position.x >= size || position.y >= size) continue;
        if (taken.has(positionKey(position))) continue;
        return position;
      }
    }
  }
  return { ...slot };
}

// The turn: the Summoner refuses the finishing blow, splits into four, and every copy
// reappears at full strength in the corner he started in. The party is NOT moved — their
// hard-won positions carry into phase 2 (the Mystic's shout, applyVoidCastlePartyHeal,
// is what makes that fair). Pure transform; the dialogue layer calls it on a beat.
export function applyVoidCastleSplit(state) {
  const trial = state?.missionRules?.voidCastleTrial;
  if (!trial || trial.phase !== 1) return state;
  const size = state.size;
  const taken = new Set(state.units.filter((unit) => unit.hp > 0).map((unit) => positionKey(unit.position)));
  for (const [key, object] of Object.entries(state.tileObjects ?? {})) {
    if (object?.kind === "wall") taken.add(key);
  }
  const definition = getUnitType("summoner");
  const summoners = VOID_CASTLE_SUMMONER_SLOTS.slice(0, VOID_CASTLE_SUMMONER_COUNT).map((slot, index) => {
    const position = findOpenTile(slot, taken, size);
    taken.add(positionKey(position));
    const poolIndex = trial.poolBySlot[index];
    return {
      ...createUnit({
        id: `p2-void-summoner-${index}`,
        player: 2,
        team: 2,
        type: "summoner",
        x: position.x,
        y: position.y,
        hp: definition.stats.maxHp,
        mp: getInitialMp(definition),
        skin: VOID_CASTLE_SUMMONER_SKIN,
      }),
      spent: false,
      ...voidCastleSummonerSoul(poolIndex),
    };
  });
  const real = summoners.find((unit) => unit.trialRealSummoner) ?? summoners[0];
  return {
    ...state,
    phase: "playing",
    winner: null,
    activation: null,
    units: [...state.units, ...summoners],
    missionRules: {
      ...state.missionRules,
      voidCastleTrial: {
        ...trial,
        phase: 2,
        pendingSplit: false,
        realSummonerId: real.id,
      },
    },
  };
}

// The Mystic's shout. Restores every SURVIVING party member to full HP/MP — the fallen
// stay fallen. Without this, phase 2 would open on a worn-down party against four fresh
// Summoners, which is not a puzzle, just a wall.
export function applyVoidCastlePartyHeal(state) {
  return {
    ...state,
    units: state.units.map((unit) => {
      if (unit.player !== 1 || unit.hp <= 0) return unit;
      const definition = getUnitType(unit.type);
      return { ...unit, hp: definition.stats.maxHp, mp: getInitialMp(definition) };
    }),
  };
}
