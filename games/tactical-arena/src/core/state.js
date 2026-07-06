import { getUnitType } from "./unitCatalog.js";
import { createRngState } from "./rng.js";
import { createRoster, FORMATS, playerColor } from "./roster.js";

function createUnit(spec) {
  const definition = getUnitType(spec.type);
  return {
    id: spec.id,
    player: spec.player,
    team: spec.team ?? spec.player,
    type: spec.type,
    position: { x: spec.x, y: spec.y },
    hp: spec.hp ?? definition.stats.maxHp,
    mp: spec.mp ?? definition.stats.maxMp,
    statModifiers: { ...(spec.statModifiers ?? {}) },
    statuses: (spec.statuses ?? []).map((status) => ({ ...status })),
    // Source-linked persistent stat modifiers (Father Time's Age). Each entry is
    // { sourceId, stats }; folded by getEffectiveStats only while the source lives.
    linkedStatMods: (spec.linkedStatMods ?? []).map((mod) => ({ ...mod, stats: { ...mod.stats } })),
    defending: false,
    spent: false,
    mageChargeCount: 0,
    // Witch Doctor "Dancing Man" stance (a key into the unit's `stances` data, or
    // null). Persists across turns; set by each dance ART. `rainCharged` is the
    // pending Rain-Stance on-attack haste, converted to a buff at the next activation.
    stance: spec.stance ?? null,
    rainCharged: spec.rainCharged ?? false,
    // King commander state: the currently/last issued command, the one before it (for
    // Strike's Pursue bonus), and the turnNumber it was issued on (a command only buffs
    // during that same turn). Meaningless for every non-commander unit (stays null/0).
    command: spec.command ?? null,
    previousCommand: spec.previousCommand ?? null,
    commandTurn: spec.commandTurn ?? 0,
    // Gargoyle Volcanic Rage: counts the immediate rage-entry eruption plus later
    // raging activations so a free Pyroclasm fires on cadence. Meaningless for every
    // other unit (stays 0).
    volcanicCounter: spec.volcanicCounter ?? 0
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

const CORNERS = Object.freeze([
  Object.freeze({ cx: 0, cy: 1 }),
  Object.freeze({ cx: 1, cy: 0 }),
  Object.freeze({ cx: 0, cy: 0 }),
  Object.freeze({ cx: 1, cy: 1 }),
]);

function spawnSlots(size, cornerIndex) {
  const max = size - 1;
  const corner = CORNERS[cornerIndex] ?? CORNERS[0];
  const cx = corner.cx === 0 ? 0 : max;
  const cy = corner.cy === 0 ? 0 : max;
  const inwardX = cx === 0 ? 1 : -1;
  const inwardY = cy === 0 ? 1 : -1;
  return [
    { x: cx + inwardX, y: cy },
    { x: cx, y: cy + inwardY },
    { x: cx, y: cy },
    { x: cx + inwardX, y: cy + inwardY }
  ];
}

function defaultRoster(size, players = createRoster()) {
  return players.flatMap((slot) => {
    const slots = spawnSlots(size, slot.corner);
    return DEFAULT_ROSTER.map(({ id, type }, i) => ({
      id: `p${slot.id}-${id}`,
      player: slot.id,
      team: slot.team,
      type,
      x: slots[i].x,
      y: slots[i].y
    }));
  });
}

export function createBattleState({
  size = 13,
  units,
  seed,
  tiles = [],
  tileObjects = [],
  players = null,
  playerCount = 2,
  format = FORMATS.FFA,
  teamColors = null,
  teamNames = null
} = {}) {
  const playerRoster = players ?? createRoster({ playerCount, format, teamColors });
  const roster = units ?? defaultRoster(size, playerRoster);

  return {
    size,
    format,
    teamNames: normalizeTeamNames(teamNames),
    players: playerRoster,
    turnOrder: playerRoster.map((slot) => slot.id),
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

const MAX_TEAM_NAME_LENGTH = 20;
function normalizeTeamNames(names) {
  if (!names || typeof names !== "object") return null;
  const cleaned = {};
  for (const [key, value] of Object.entries(names)) {
    const trimmed = String(value ?? "").trim().slice(0, MAX_TEAM_NAME_LENGTH);
    if (trimmed) cleaned[key] = trimmed;
  }
  return Object.keys(cleaned).length ? cleaned : null;
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
      statuses: unit.statuses.map((status) => ({ ...status })),
      // Deep-copy the source-linked modifier list (Age) — a shallow `...unit` spread
      // would share the array across clones and leak mutations between states.
      linkedStatMods: (unit.linkedStatMods ?? []).map((mod) => ({ ...mod, stats: { ...mod.stats } }))
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

export function teamOfUnit(unit) {
  return unit?.team ?? unit?.player;
}

export function areEnemies(a, b) {
  return teamOfUnit(a) !== teamOfUnit(b);
}

export function areAllies(a, b) {
  return teamOfUnit(a) === teamOfUnit(b);
}

export function livingUnits(state, player) {
  return state.units.filter((unit) => unit.hp > 0 && (player === undefined || unit.player === player));
}

export function livingTeamUnits(state, unitOrPlayer) {
  const team = typeof unitOrPlayer === "object"
    ? teamOfUnit(unitOrPlayer)
    : state.players?.find((slot) => slot.id === unitOrPlayer)?.team ?? unitOrPlayer;
  return state.units.filter((unit) => unit.hp > 0 && teamOfUnit(unit) === team);
}

export function colorOf(state, player) {
  return state?.players?.find((slot) => slot.id === player)?.color ?? playerColor(player);
}
