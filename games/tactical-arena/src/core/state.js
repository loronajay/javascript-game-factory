import { getUnitType } from "./unitCatalog.js";
import { createRngState } from "./rng.js";

function createUnit(spec) {
  const definition = getUnitType(spec.type);
  return {
    id: spec.id,
    player: spec.player,
    type: spec.type,
    position: { x: spec.x, y: spec.y },
    hp: spec.hp ?? definition.stats.maxHp,
    mp: spec.mp ?? definition.stats.maxMp,
    statModifiers: { ...(spec.statModifiers ?? {}) },
    statuses: (spec.statuses ?? []).map((status) => ({ ...status })),
    defending: false,
    spent: false,
    mageChargeCount: 0
  };
}

function tileKey(position) {
  return `${position.x},${position.y}`;
}

function normalizeTileAffinities(tiles = []) {
  const affinities = {};
  for (const tile of tiles) {
    if (tile?.affinity !== "light" && tile?.affinity !== "dark") continue;
    affinities[tileKey(tile)] = tile.affinity;
  }
  return affinities;
}

const DEFAULT_ROSTER = [
  { id: "swordsman", type: "swordsman" },
  { id: "archer", type: "archer" },
  { id: "mystic", type: "mystic" },
  { id: "magician", type: "magician" }
];

function defaultRoster(size) {
  const slots = {
    1: [
      { x: 1, y: size - 1 },
      { x: 0, y: size - 2 },
      { x: 0, y: size - 1 },
      { x: 1, y: size - 2 }
    ],
    2: [
      { x: size - 2, y: 0 },
      { x: size - 1, y: 1 },
      { x: size - 1, y: 0 },
      { x: size - 2, y: 1 }
    ]
  };

  return [1, 2].flatMap((player) => DEFAULT_ROSTER.map(({ id, type }, i) => ({
    id: `p${player}-${id}`,
    player,
    type,
    x: slots[player][i].x,
    y: slots[player][i].y
  })));
}

export function createBattleState({ size = 13, units, seed, tiles = [] } = {}) {
  const roster = units ?? defaultRoster(size);

  return {
    size,
    tileAffinities: normalizeTileAffinities(tiles),
    units: roster.map(createUnit),
    currentPlayer: 1,
    turnNumber: 1,
    activation: null,
    winner: null,
    phase: "playing",
    // Authoritative roll seed lives in match state so every actor draws identical
    // rolls from the same seed + command stream. A fresh match varies; an online
    // or replay match is handed a fixed seed.
    rngState: createRngState(seed ?? (Date.now() & 0xffffffff))
  };
}

export function cloneState(state) {
  return {
    ...state,
    tileAffinities: { ...(state.tileAffinities ?? {}) },
    units: state.units.map((unit) => ({
      ...unit,
      position: { ...unit.position },
      statModifiers: { ...unit.statModifiers },
      statuses: unit.statuses.map((status) => ({ ...status }))
    })),
    activation: state.activation ? {
      ...state.activation,
      origin: { ...state.activation.origin },
      bonusActionGroups: [...(state.activation.bonusActionGroups ?? [])]
    } : null
  };
}

export function getTileAffinity(state, position) {
  return state.tileAffinities?.[tileKey(position)] ?? ((position.x + position.y) % 2 === 0 ? "light" : "dark");
}

export function findUnit(state, id) {
  return state.units.find((unit) => unit.id === id) ?? null;
}

export function unitAt(state, position, { includeDefeated = false } = {}) {
  return state.units.find((unit) =>
    (includeDefeated || unit.hp > 0) &&
    unit.position.x === position.x && unit.position.y === position.y
  ) ?? null;
}

export function areEnemies(a, b) {
  return a.player !== b.player;
}

export function livingUnits(state, player) {
  return state.units.filter((unit) => unit.hp > 0 && (player === undefined || unit.player === player));
}
