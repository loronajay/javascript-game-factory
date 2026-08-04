export const TOURNAMENT_MATCH_TYPE = "draft1v1";

function normalizedBanSeat(value) {
  return Number(value) === 2 ? 2 : 1;
}

export function createTournamentLobbySettings({ banFirstSeat = 1 } = {}) {
  return {
    matchType: TOURNAMENT_MATCH_TYPE,
    tournament: true,
    banFirstSeat: normalizedBanSeat(banFirstSeat),
  };
}

export function isTournamentLobbySettings(settings) {
  return Boolean(
    settings
    && settings.tournament === true
    && settings.matchType === TOURNAMENT_MATCH_TYPE,
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
