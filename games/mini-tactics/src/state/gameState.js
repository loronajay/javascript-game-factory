import { DEFAULT_BOARD_SIZE, MAX_HP, PLAYER_COLORS } from "../config.js";
import { DEFAULT_COMPOSITION, normalizeComposition } from "../core/composition.js";

// The four board corners, indexed 0-3. A roster entry carries a corner index
// (assigned in core/roster.js); this table is the single place those indices
// resolve to coordinates. Index order is also the default free-for-all seat
// order, and 0/1 reproduce the original P1/P2 placement exactly.
//   0: (0,   max)   1: (max, 0)   2: (0,   0)   3: (max, max)
function cornerAnchors(size) {
  const max = size - 1;
  return [
    { cx: 0, cy: max },
    { cx: max, cy: 0 },
    { cx: 0, cy: 0 },
    { cx: max, cy: max }
  ];
}

// Default roster shape used when no explicit roster is supplied (the classic
// two-player duel). Kept here so createInitialUnits(size) stays a drop-in.
const DEFAULT_TWO_PLAYER_ROSTER = Object.freeze([
  Object.freeze({ id: 1, corner: 0 }),
  Object.freeze({ id: 2, corner: 1 })
]);

// Each squad spawns as a 2x2 block tucked into its corner. The four spawn tiles
// are filled in composition order (front-inner, inner-side, outer-side, corner);
// the default composition reproduces the classic tank/medic/warrior/ranger
// placement exactly. Driven by the roster so 1-4 squads place from one rule, and
// optionally by a `{ seat: composition }` map for custom squads.
export function createInitialUnits(
  size,
  roster = DEFAULT_TWO_PLAYER_ROSTER,
  compositions = null
) {
  const anchors = cornerAnchors(size);
  const units = [];

  for (const slot of roster) {
    units.push(
      ...createSquad(slot.id, anchors[slot.corner], compositions?.[slot.id])
    );
  }

  return units;
}

function createSquad(playerId, { cx, cy }, composition = DEFAULT_COMPOSITION) {
  // Step one tile inward (toward board center) on each axis. The inner column
  // is the front line; the outer column (the literal corner) is the back line.
  const inwardX = cx === 0 ? 1 : -1;
  const inwardY = cy === 0 ? 1 : -1;
  const innerCol = cx + inwardX;
  const innerRow = cy + inwardY;

  // Spawn tiles in composition-index order. Index 0/1 are the inner (front)
  // edge, 2/3 the outer (corner) edge — the same tiles the classic squad used,
  // so the default composition is byte-identical to the original placement.
  const positions = [
    { x: innerCol, y: innerRow },
    { x: innerCol, y: cy },
    { x: cx, y: innerRow },
    { x: cx, y: cy }
  ];

  const types = normalizeComposition(composition);

  // A type that appears once keeps its bare id (`p1-tank`) so the classic squad
  // and existing fixtures are unchanged; duplicated types get a 1-based ordinal
  // suffix (`p1-ranger-1`, `p1-ranger-2`) so ids stay unique and the HUD can
  // derive "Ranger 1 / Ranger 2" labels straight from the id.
  const totalByType = {};
  for (const type of types) totalByType[type] = (totalByType[type] ?? 0) + 1;
  const seenByType = {};

  return types.map((type, index) => {
    const ordinal = (seenByType[type] = (seenByType[type] ?? 0) + 1);
    const id =
      totalByType[type] > 1
        ? `p${playerId}-${type}-${ordinal}`
        : `p${playerId}-${type}`;
    const { x, y } = positions[index];
    return createUnit(id, playerId, type, x, y);
  });
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
    defending: false,
    guardTargetId: null
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

// Team identity is the single source of truth for friend/foe across every mode.
// In free-for-all (and the legacy two-player duel) each player is its own team,
// so when no roster is present we fall back to "player is its own team" — which
// keeps the old player=== comparisons behaving identically.
export function teamOf(state, player) {
  const roster = state.players;
  if (Array.isArray(roster)) {
    const entry = roster.find((slot) => slot.id === player);
    if (entry) return entry.team;
  }
  return player;
}

// Accepts unit objects or raw player ids on either side.
export function sameTeam(state, a, b) {
  const playerA = a !== null && typeof a === "object" ? a.player : a;
  const playerB = b !== null && typeof b === "object" ? b.player : b;
  return teamOf(state, playerA) === teamOf(state, playerB);
}

// The authoritative display color for a player, read from the roster so renderers
// never derive color from the slot number. Falls back to the static slot palette
// for roster-less states (the prototype createGameState path).
export function colorOf(state, player) {
  const roster = state.players;
  if (Array.isArray(roster)) {
    const entry = roster.find((slot) => slot.id === player);
    if (entry?.color) return entry.color;
  }
  return PLAYER_COLORS[player] ?? PLAYER_COLORS[1];
}
