import { createBattleState, openAutomaticFirstActivation } from "../core/state.js";
import { nextRandom } from "../core/rng.js";
import { getUnitType, takesTurns } from "../core/unitCatalog.js";
import { pendingFirstActor } from "../core/commandValidation.js";
import { createRoster, FORMATS, playerColor } from "../core/roster.js";
import { normalizeSkinLoadout } from "../ui/skinModel.js";
import { getNicknamePref } from "../ui/nicknameModel.js";

export function teamColor(playerOrTeam, state = null) {
  if (state?.players) {
    const lead = state.players.find((slot) => slot.team === playerOrTeam || slot.id === playerOrTeam);
    if (lead?.color) return lead.color;
  }
  return playerColor(playerOrTeam);
}

export function teamOf(state, player) {
  return state.players?.find((slot) => slot.id === player)?.team ?? player;
}

export function teamLabel(state, team) {
  const custom = state.teamNames?.[team];
  if (custom) return custom;
  return state.format === FORMATS.TEAMS ? `Team ${team}` : `Player ${team}`;
}

// Summoned pieces (Ghouls) are excluded from all match stats — totals, HP, kills,
// and damage are about the players' real squads, not transient summons.
export function hpRemaining(state, player) {
  return state.units
    .filter((u) => u.player === player && takesTurns(u))
    .reduce((sum, u) => sum + Math.max(0, u.hp), 0);
}

// Map squad compositions onto the four-cell corner spawn blocks. The first two
// slots preserve the original 2v2 staging, and the extra pair fills the block.
export function buildRoster(
  squads,
  size,
  players = createRoster({ playerCount: Object.keys(squads ?? {}).length || 2 }),
  skins = null,
  nicknames = null,
  options = {},
) {
  const trustedSkinSeats = options.trustedSkinSeats == null
    ? null
    : new Set(Array.isArray(options.trustedSkinSeats) ? options.trustedSkinSeats.map(Number) : []);
  const slotsForCorner = (corner) => {
    const max = size - 1;
    const coords = [
      { cx: 0, cy: max },
      { cx: max, cy: 0 },
      { cx: 0, cy: 0 },
      { cx: max, cy: max },
    ][corner] ?? { cx: 0, cy: max };
    const inwardX = coords.cx === 0 ? 1 : -1;
    const inwardY = coords.cy === 0 ? 1 : -1;
    return [
      { x: coords.cx + inwardX, y: coords.cy },
      { x: coords.cx, y: coords.cy + inwardY },
      { x: coords.cx, y: coords.cy },
      { x: coords.cx + inwardX, y: coords.cy + inwardY }
    ];
  };
  const CORNER_CELL = 2; // positions[2] is the very corner cell ({cx,cy})
  const units = [];
  for (const slot of players) {
    const positions = slotsForCorner(slot.corner);
    const squad = (squads[slot.id] ?? []).slice(0, positions.length);
    const skinLoadout = trustedSkinSeats && !trustedSkinSeats.has(slot.id)
      ? squad.map(() => null)
      : normalizeSkinLoadout(squad, skins?.[slot.id]);
    // Nicknames are the device owner's personal labels for THEIR OWN units, so the
    // local-preference default (see nicknameModel.js) only rides onto player 1 — the
    // local human in every mode that omits an explicit map (hot-seat, single, campaign,
    // tempo, tutorial). Other seats (a CPU/opponent squad) default to no nickname so a
    // rival Swordsman keeps its base name instead of wearing your personal rename. An
    // explicit per-slot array still populates ANY seat directly — that's the path online
    // play uses so a peer's own chosen names ride over the wire.
    const nicknameLoadout =
      nicknames?.[slot.id] ??
      (slot.id === 1 ? squad.map((type) => getNicknamePref(type)) : squad.map(() => null));
    // Every unit keeps its natural index cell, EXCEPT the King ("always in the far
    // corner"): he swaps onto positions[2] with whoever held it. King-less squads are
    // untouched (no swap), so the original spawn layout is preserved exactly.
    const cells = squad.map((_, i) => positions[i]);
    const kingSlot = squad.findIndex((type) => getUnitType(type).actsFirst);
    if (kingSlot >= 0 && kingSlot !== CORNER_CELL && cells[CORNER_CELL]) {
      [cells[kingSlot], cells[CORNER_CELL]] = [cells[CORNER_CELL], cells[kingSlot]];
    }
    squad.forEach((type, i) => {
      units.push({
        id: `p${slot.id}-${i}-${type}`,
        player: slot.id,
        team: slot.team,
        type,
        skin: skinLoadout[i] ?? null,
        nickname: nicknameLoadout[i] ?? null,
        x: cells[i].x,
        y: cells[i].y
      });
    });
  }
  return units;
}

export function createMatchState({
  size = 13,
  squads,
  seed,
  playerCount = squads ? Object.keys(squads).length : 2,
  format = FORMATS.FFA,
  teamColors = null,
  teamNames = null,
  skins = null,
  nicknames = null,
  trustedSkinSeats = null
} = {}) {
  const normalizedFormat = format === FORMATS.TEAMS && Number(playerCount) === 4
    ? FORMATS.TEAMS
    : FORMATS.FFA;
  const players = createRoster({ playerCount, format: normalizedFormat, teamColors });
  const state = createBattleState({
    size,
    seed,
    players,
    playerCount,
    format: normalizedFormat,
    teamColors: normalizedFormat === FORMATS.TEAMS ? teamColors : null,
    teamNames,
    units: squads ? buildRoster(squads, size, players, skins, nicknames, { trustedSkinSeats }) : undefined,
  });
  const flip = nextRandom(state.rngState);
  const turnOrder = state.turnOrder ?? players.map((slot) => slot.id);
  const started = {
    ...state,
    currentPlayer: turnOrder[Math.floor(flip.value * turnOrder.length)] ?? 1,
    activation: null,
    rngState: flip.state,
  };
  openAutomaticFirstActivation(started);
  return started;
}

export function buildSummary(state, { matchStartedAt, initialHpByPlayer }) {
  const remaining = (player) => state.units
    .filter((u) => u.player === player && takesTurns(u))
    .reduce((sum, u) => sum + Math.max(0, u.hp), 0);

  const teamIds = [];
  for (const slot of state.players ?? [{ id: 1, team: 1 }, { id: 2, team: 2 }]) {
    if (!teamIds.includes(slot.team)) teamIds.push(slot.team);
  }
  const teams = teamIds.map((team) => {
    const memberIds = (state.players ?? []).filter((slot) => slot.team === team).map((slot) => slot.id);
    if (!memberIds.length) memberIds.push(team);
    const units = state.units.filter((u) => memberIds.includes(u.player) && takesTurns(u));
    const opponents = (state.players ?? [])
      .filter((slot) => slot.team !== team)
      .map((slot) => slot.id);
    const hpTotal = memberIds.reduce((sum, player) => sum + (initialHpByPlayer[player] ?? 0), 0);
    const hpLeft = memberIds.reduce((sum, player) => sum + remaining(player), 0);
    return {
      player: team,
      label: teamLabel(state, team),
      color: teamColor(team, state),
      isWinner: team === state.winner,
      unitsAlive: units.filter((u) => u.hp > 0).length,
      unitsTotal: units.length,
      hpRemaining: hpLeft,
      hpTotal,
      damageDealt: opponents.reduce((sum, player) => sum + Math.max(0, (initialHpByPlayer[player] ?? 0) - remaining(player)), 0),
      kills: state.units.filter((u) => opponents.includes(u.player) && takesTurns(u) && u.hp <= 0).length
    };
  }).sort((a, b) => Number(b.isWinner) - Number(a.isWinner));

  return {
    winner: state.winner,
    winnerLabel: state.winner ? teamLabel(state, state.winner) : null,
    winnerColor: state.winner ? teamColor(state.winner, state) : null,
    format: state.format,
    size: state.size,
    turns: state.turnNumber,
    durationMs: Date.now() - matchStartedAt,
    teams
  };
}

function firstActorGateMessage(state, player) {
  const actor = state ? pendingFirstActor(state, player ?? state.currentPlayer) : null;
  const definition = actor ? getUnitType(actor.type) : null;
  if (definition?.commandOnly) {
    return "Your King must issue his command before the rest of the squad may act.";
  }
  const name = actor ? (actor.nickname || definition.name) : "First actor";
  return `${name} must act before the rest of the squad may act.`;
}

export function readableError(errorCode, state = null, player = state?.currentPlayer) {
  if (errorCode === "KING_MUST_ACT_FIRST") return firstActorGateMessage(state, player);
  return ({
    ART_NOT_AVAILABLE: "ARTS must be chosen before moving or attacking, with enough MP.",
    INVALID_ART_PATH: "Footwork must use its full unique orthogonal path and finish on empty ground.",
    MOVE_OUT_OF_RANGE: "That tile is not reachable this activation.",
    CANCEL_NOT_AVAILABLE: "There is no movement to cancel.",
    TARGET_OUT_OF_RANGE: "That target is beyond attack range.",
    TARGET_OBSTRUCTED: "Another unit is blocking the line of fire.",
    PRIMARY_ALREADY_USED: "This unit has already taken its primary action.",
    FINISH_REQUIRES_ACTION: "Attack or defend before finishing this activation.",
    SUMMON_LIMIT: "This Necromancer already has two Ghouls on the field.",
    COMMANDER_CANNOT_ACT: "The King only commands — he never moves, attacks, or defends."
  })[errorCode] ?? "That action is not legal right now.";
}
