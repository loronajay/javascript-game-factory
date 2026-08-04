export const TOURNAMENT_MATCH_TYPE = "draft1v1";

function normalizedBanSeat(value) {
  return Number(value) === 2 ? 2 : 1;
}

function normalizedPlayers(value) {
  return Array.isArray(value)
    ? value.slice(0, 2).map((name) => typeof name === "string" ? name.trim().slice(0, 18) : "")
    : [];
}

function normalizedFixtureId(value) {
  return typeof value === "string" ? value.trim().slice(0, 40) : "";
}

export function createTournamentLobbySettings({ fixtureId = "", players = [], banFirstSeat = 1 } = {}) {
  return {
    matchType: TOURNAMENT_MATCH_TYPE,
    tournament: true,
    fixtureId: normalizedFixtureId(fixtureId),
    players: normalizedPlayers(players),
    banFirstSeat: normalizedBanSeat(banFirstSeat),
  };
}

export function isTournamentLobbySettings(settings) {
  return Boolean(
    settings
    && settings.tournament === true
    && settings.matchType === TOURNAMENT_MATCH_TYPE
    && normalizedFixtureId(settings.fixtureId)
    && normalizedPlayers(settings.players).length === 2
    && normalizedPlayers(settings.players).every(Boolean),
  );
}

export function isTournamentContext({ accessActive = false, settings, onlineMode } = {}) {
  if (!accessActive) return false;
  return settings
    ? isTournamentLobbySettings(settings)
    : onlineMode === "tournament";
}

export function tournamentBanFirstSeat(settings) {
  return normalizedBanSeat(settings?.banFirstSeat);
}

export function randomTournamentBanFirstSeat(random = Math.random) {
  return Number(random()) < 0.5 ? 1 : 2;
}

export function tournamentBanFirstSeatForFixture(fixtureId) {
  const text = normalizedFixtureId(fixtureId);
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = ((hash * 31) + text.charCodeAt(index)) >>> 0;
  return hash % 2 === 0 ? 1 : 2;
}

export function shouldAutoStartTournamentLobby({
  tournament = false,
  isOwner = false,
  full = false,
  draftComplete = false,
  allLocked = false,
  alreadyRequested = false,
} = {}) {
  return tournament && isOwner && full && draftComplete && allLocked && !alreadyRequested;
}
