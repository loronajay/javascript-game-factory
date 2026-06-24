import { getUnitType } from "./unitCatalog.js";

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
    defending: false,
    spent: false
  };
}

export function createBattleState({ size = 8, units } = {}) {
  const roster = units ?? [
    { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0 },
    { id: "p2-swordsman", player: 2, type: "swordsman", x: size - 1, y: size - 1 }
  ];

  return {
    size,
    units: roster.map(createUnit),
    currentPlayer: 1,
    turnNumber: 1,
    activation: null,
    winner: null,
    phase: "playing"
  };
}

export function cloneState(state) {
  return {
    ...state,
    units: state.units.map((unit) => ({
      ...unit,
      position: { ...unit.position },
      statModifiers: { ...unit.statModifiers }
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
