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
    spent: false
  };
}

export function createBattleState({ size = 10, units, seed } = {}) {
  const roster = units ?? [
    { id: "p1-swordsman", player: 1, type: "swordsman", x: 1, y: size - 1 },
    { id: "p1-archer", player: 1, type: "archer", x: 0, y: size - 2 },
    { id: "p2-swordsman", player: 2, type: "swordsman", x: size - 2, y: 0 },
    { id: "p2-archer", player: 2, type: "archer", x: size - 1, y: 1 }
  ];

  return {
    size,
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
    units: state.units.map((unit) => ({
      ...unit,
      position: { ...unit.position },
      statModifiers: { ...unit.statModifiers },
      statuses: unit.statuses.map((status) => ({ ...status }))
    })),
    activation: state.activation ? {
      ...state.activation,
      origin: { ...state.activation.origin }
    } : null
  };
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
