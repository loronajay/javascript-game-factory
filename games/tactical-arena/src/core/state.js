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

// Board-level placeable objects (the Sniper's Build Cover walls and Throw Cigar
// fire) live in their own keyed map alongside tile affinities — one object per
// tile. A wall blocks movement and line of sight and carries HP; fire is a hazard
// zone that burns occupants and counts down. Input is a list of
// `{ x, y, kind, hp?/turnsLeft? }`; output is keyed by tile.
function normalizeTileObjects(objects = []) {
  const map = {};
  for (const obj of objects) {
    if (!obj || !Number.isInteger(obj.x) || !Number.isInteger(obj.y)) continue;
    if (obj.kind === "wall") {
      map[tileKey(obj)] = { kind: "wall", hp: Number.isFinite(obj.hp) ? obj.hp : 1 };
    } else if (obj.kind === "fire") {
      map[tileKey(obj)] = { kind: "fire", turnsLeft: Number.isFinite(obj.turnsLeft) ? obj.turnsLeft : 3 };
    }
  }
  return map;
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

export function createBattleState({ size = 13, units, seed, tiles = [], tileObjects = [] } = {}) {
  const roster = units ?? defaultRoster(size);

  return {
    size,
    tileAffinities: normalizeTileAffinities(tiles),
    tileObjects: normalizeTileObjects(tileObjects),
    units: roster.map(createUnit),
    currentPlayer: 1,
    turnNumber: 1,
    activation: null,
    winner: null,
    phase: "playing",
    // Monotonic command counter (incremented by the reducer on every accepted
    // command). It is the transport sequence key for online lockstep — the lobby
    // owner broadcasts its state hash keyed by this revision — and is deliberately
    // EXCLUDED from the state hash itself (see core/state-hash.js).
    revision: 0,
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
    tileObjects: Object.fromEntries(
      Object.entries(state.tileObjects ?? {}).map(([key, obj]) => [key, { ...obj }])
    ),
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

export function getTileObject(state, position) {
  return state.tileObjects?.[tileKey(position)] ?? null;
}

export function isWallAt(state, position) {
  return getTileObject(state, position)?.kind === "wall";
}

export function isFireAt(state, position) {
  return getTileObject(state, position)?.kind === "fire";
}

export function areEnemies(a, b) {
  return a.player !== b.player;
}

export function livingUnits(state, player) {
  return state.units.filter((unit) => unit.hp > 0 && (player === undefined || unit.player === player));
}
