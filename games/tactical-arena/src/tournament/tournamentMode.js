export const TOURNAMENT_MATCH_TYPE = "draft1v1";
export const TOURNAMENT_RELAY_MATCH_TYPE_PREFIX = "ta-t:";

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

function hashFixture(text, seed) {
  let hash = seed >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function tournamentFixtureFingerprint(fixtureId) {
  const text = normalizedFixtureId(fixtureId);
  if (!text) return "";
  return `${hashFixture(text, 0x811c9dc5)}${hashFixture([...text].reverse().join(""), 0x9e3779b9)}`;
}

export function tournamentRelayMatchType(fixtureId, banFirstSeat = 1) {
  const fingerprint = tournamentFixtureFingerprint(fixtureId);
  return fingerprint
    ? `${TOURNAMENT_RELAY_MATCH_TYPE_PREFIX}${fingerprint}:${normalizedBanSeat(banFirstSeat)}`
    : TOURNAMENT_MATCH_TYPE;
}

export function parseTournamentRelayMatchType(value) {
  const escapedPrefix = TOURNAMENT_RELAY_MATCH_TYPE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escapedPrefix}([a-f0-9]{16}):([12])$`).exec(String(value || ""));
  return match ? { fixtureFingerprint: match[1], banFirstSeat: Number(match[2]) } : null;
}

export function createTournamentLobbySettings({ fixtureId = "", players = [], banFirstSeat = 1 } = {}) {
  return {
    // factory-network-server only preserves allowlisted settings. Encoding the
    // fixture fingerprint and ban seat into matchType keeps concurrent fixtures
    // isolated and recognizable after the relay sanitizes the payload.
    matchType: tournamentRelayMatchType(fixtureId, banFirstSeat),
    tournament: true,
    fixtureId: normalizedFixtureId(fixtureId),
    players: normalizedPlayers(players),
    banFirstSeat: normalizedBanSeat(banFirstSeat),
  };
}

export function isTournamentLobbySettings(settings) {
  if (parseTournamentRelayMatchType(settings?.matchType)) return true;
  return Boolean(
    settings?.tournament === true
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
  return parseTournamentRelayMatchType(settings?.matchType)?.banFirstSeat
    ?? normalizedBanSeat(settings?.banFirstSeat);
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
