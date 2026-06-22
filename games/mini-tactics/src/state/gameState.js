import { DEFAULT_BOARD_SIZE, MAX_HP } from "../config.js";

export function createInitialUnits(size) {
  const max = size - 1;

  return [
    createUnit("p1-warrior", 1, "warrior", 1, max - 1),
    createUnit("p1-tank", 1, "tank", 0, max),
    createUnit("p1-ranger", 1, "ranger", 2, max),
    createUnit("p1-medic", 1, "medic", 3, max),

    createUnit("p2-warrior", 2, "warrior", max - 1, 1),
    createUnit("p2-tank", 2, "tank", max, 0),
    createUnit("p2-ranger", 2, "ranger", max - 2, 0),
    createUnit("p2-medic", 2, "medic", max - 3, 0)
  ];
}

function createUnit(id, player, type, x, y) {
  return {
    id,
    player,
    type,
    x,
    y,
    hp: MAX_HP,
    maxHp: MAX_HP,
    spent: false,
    defending: false
  };
}

export function createGameState(size = DEFAULT_BOARD_SIZE) {
  return {
    size,
    currentPlayer: 1,
    units: createInitialUnits(size),
    selectedId: null,
    mode: null,
    activation: null,
    legalTiles: new Set(),
    locked: false,
    winner: null
  };
}

export function resetState(state, size) {
  Object.assign(state, createGameState(size));
}

export function getSelectedUnit(state) {
  return state.units.find((unit) => unit.id === state.selectedId) ?? null;
}

export function livingUnits(state, player = null) {
  return state.units.filter(
    (unit) => unit.hp > 0 && (player === null || unit.player === player)
  );
}

export function unitAt(state, x, y) {
  return state.units.find(
    (unit) => unit.hp > 0 && unit.x === x && unit.y === y
  ) ?? null;
}
