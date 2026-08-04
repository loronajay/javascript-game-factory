import {
  createTournamentLobbySettings,
  isTournamentLobbySettings,
  tournamentBanFirstSeatForFixture,
} from "./tournamentMode.js";

export const TOURNAMENT_ASSIGNMENTS_SESSION_KEY = "tacticalArenaTournamentAssignmentsV1";
export const TOURNAMENT_PLAYER_ASSIGNMENT_SESSION_KEY = "tacticalArenaTournamentPlayerAssignmentV1";
export const TOURNAMENT_PLAYER_LINK_ACCESS_CODE = "TA-Bracket-Player-2026";

function cleanName(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 18).trim() : "";
}

function cleanLabel(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 42).trim() : "";
}

function cleanFixtureId(value) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40)
    : "";
}

function generatedFixtureId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `match-${uuid.replaceAll("-", "").slice(0, 12)}`;
  return `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeTournamentAssignment(value) {
  if (!value || typeof value !== "object") return null;
  const fixtureId = cleanFixtureId(value.fixtureId);
  const players = Array.isArray(value.players) ? value.players.map(cleanName).slice(0, 2) : [];
  if (!fixtureId || players.length !== 2 || !players[0] || !players[1]) return null;
  if (players[0].toLowerCase() === players[1].toLowerCase()) return null;
  return {
    fixtureId,
    label: cleanLabel(value.label) || fixtureId,
    players,
  };
}

export function createTournamentAssignment({ fixtureId = "", label = "", playerOne = "", playerTwo = "" } = {}) {
  return normalizeTournamentAssignment({
    fixtureId: cleanFixtureId(fixtureId) || generatedFixtureId(),
    label,
    players: [playerOne, playerTwo],
  });
}

export function assignmentForSeat(value, seat) {
  const fixture = normalizeTournamentAssignment(value);
  const normalizedSeat = Number(seat) === 2 ? 2 : 1;
  if (!fixture) return null;
  return {
    ...fixture,
    seat: normalizedSeat,
    player: fixture.players[normalizedSeat - 1],
    opponent: fixture.players[normalizedSeat === 1 ? 1 : 0],
  };
}

export function buildTournamentPlayerLink(baseUrl, fixture, seat, {
  accessCode = TOURNAMENT_PLAYER_LINK_ACCESS_CODE,
} = {}) {
  const assignment = assignmentForSeat(fixture, seat);
  if (!assignment) return "";
  const url = new URL(String(baseUrl));
  url.hash = new URLSearchParams({
    tournament: accessCode,
    fixture: assignment.fixtureId,
    label: assignment.label,
    p1: assignment.players[0],
    p2: assignment.players[1],
    seat: String(assignment.seat),
  }).toString();
  return url.toString();
}

export function parseTournamentPlayerAssignment(urlValue) {
  let url;
  try { url = new URL(String(urlValue)); } catch { return null; }
  const params = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const fixture = normalizeTournamentAssignment({
    fixtureId: params.get("fixture"),
    label: params.get("label"),
    players: [params.get("p1"), params.get("p2")],
  });
  return assignmentForSeat(fixture, params.get("seat"));
}

export function createTournamentMatchmakingOptions(value) {
  const assignment = assignmentForSeat(value, value?.seat);
  if (!assignment) return null;
  return {
    minPlayers: 2,
    maxPlayers: 2,
    settings: createTournamentLobbySettings({
      fixtureId: assignment.fixtureId,
      players: assignment.players,
      banFirstSeat: tournamentBanFirstSeatForFixture(assignment.fixtureId),
    }),
  };
}

export function doesTournamentSettingsMatchAssignment(value, settings) {
  const assignment = assignmentForSeat(value, value?.seat);
  const expected = createTournamentMatchmakingOptions(assignment)?.settings;
  return Boolean(
    assignment
    && expected
    && isTournamentLobbySettings(settings)
    && settings?.matchType === expected.matchType,
  );
}

export function saveTournamentAssignments(values, storage = globalThis.sessionStorage) {
  const fixtures = (Array.isArray(values) ? values : [])
    .map(normalizeTournamentAssignment)
    .filter(Boolean)
    .slice(0, 64);
  try { storage?.setItem?.(TOURNAMENT_ASSIGNMENTS_SESSION_KEY, JSON.stringify(fixtures)); } catch {}
  return fixtures;
}

export function readTournamentAssignments(storage = globalThis.sessionStorage) {
  try {
    return saveTournamentAssignments(JSON.parse(storage?.getItem?.(TOURNAMENT_ASSIGNMENTS_SESSION_KEY) || "[]"), storage);
  } catch {
    return [];
  }
}

export function saveTournamentPlayerAssignment(value, storage = globalThis.sessionStorage) {
  const assignment = assignmentForSeat(value, value?.seat);
  try {
    if (assignment) storage?.setItem?.(TOURNAMENT_PLAYER_ASSIGNMENT_SESSION_KEY, JSON.stringify(assignment));
    else storage?.removeItem?.(TOURNAMENT_PLAYER_ASSIGNMENT_SESSION_KEY);
  } catch {}
  return assignment;
}

export function readTournamentPlayerAssignment(storage = globalThis.sessionStorage) {
  try {
    const value = JSON.parse(storage?.getItem?.(TOURNAMENT_PLAYER_ASSIGNMENT_SESSION_KEY) || "null");
    return assignmentForSeat(value, value?.seat);
  } catch {
    return null;
  }
}

export function clearTournamentPlayerAssignment(storage = globalThis.sessionStorage) {
  try { storage?.removeItem?.(TOURNAMENT_PLAYER_ASSIGNMENT_SESSION_KEY); } catch {}
}
