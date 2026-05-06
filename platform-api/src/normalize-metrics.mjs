import {
  isPlainObject,
  sanitizeCount,
  sanitizeGameSlug,
  sanitizePlayerId,
} from "./normalize-shared.mjs";

const PROFILE_OPEN_SOURCE_KEYS = Object.freeze([
  "direct",
  "resultsScreen",
  "chatLobby",
  "event",
  "activity",
  "thoughtFeed",
  "bulletin",
]);

function normalizeFriendPoints(value) {
  if (!isPlainObject(value)) return {};
  return Object.entries(value).reduce((normalized, [playerId, count]) => {
    const key = sanitizePlayerId(playerId);
    const points = sanitizeCount(count);
    if (!key || points <= 0) return normalized;
    normalized[key] = points;
    return normalized;
  }, {});
}

function buildProfileOpenSourceBreakdown(value = {}) {
  const source = isPlainObject(value) ? value : {};
  return PROFILE_OPEN_SOURCE_KEYS.reduce((normalized, key) => {
    normalized[key] = sanitizeCount(source[key]);
    return normalized;
  }, {});
}

export function buildDefaultProfileMetricsRecord(playerId = "") {
  return {
    playerId: sanitizePlayerId(playerId),
    profileViewCount: 0,
    thoughtPostCount: 0,
    activityItemCount: 0,
    receivedReactionCount: 0,
    receivedCommentCount: 0,
    receivedShareCount: 0,
    mostPlayedGameSlug: "",
    mostPlayedWithPlayerId: "",
    friendCount: 0,
    friendPoints: {},
    totalPlaySessionCount: 0,
    totalPlayTimeMinutes: 0,
    uniqueGamesPlayedCount: 0,
    eventParticipationCount: 0,
    topThreeFinishCount: 0,
    mutualFriendCount: 0,
    sharedGameCount: 0,
    sharedSessionCount: 0,
    sharedEventCount: 0,
    resultsScreenProfileOpenCount: 0,
    resultsScreenAddFriendClickCount: 0,
    chatProfileOpenCount: 0,
    friendRequestSentCount: 0,
    friendRequestAcceptedCount: 0,
    thoughtImpressionCount: 0,
    profileOpenSourceBreakdown: buildProfileOpenSourceBreakdown(),
  };
}

export function normalizeProfileMetricsRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  const defaults = buildDefaultProfileMetricsRecord(source.playerId);
  return {
    ...defaults,
    playerId: sanitizePlayerId(source.playerId),
    profileViewCount: sanitizeCount(source.profileViewCount),
    thoughtPostCount: sanitizeCount(source.thoughtPostCount),
    activityItemCount: sanitizeCount(source.activityItemCount),
    receivedReactionCount: sanitizeCount(source.receivedReactionCount),
    receivedCommentCount: sanitizeCount(source.receivedCommentCount),
    receivedShareCount: sanitizeCount(source.receivedShareCount),
    mostPlayedGameSlug: sanitizeGameSlug(source.mostPlayedGameSlug),
    mostPlayedWithPlayerId: sanitizePlayerId(source.mostPlayedWithPlayerId),
    friendCount: sanitizeCount(source.friendCount),
    friendPoints: normalizeFriendPoints(source.friendPoints),
    totalPlaySessionCount: sanitizeCount(source.totalPlaySessionCount),
    totalPlayTimeMinutes: sanitizeCount(source.totalPlayTimeMinutes),
    uniqueGamesPlayedCount: sanitizeCount(source.uniqueGamesPlayedCount),
    eventParticipationCount: sanitizeCount(source.eventParticipationCount),
    topThreeFinishCount: sanitizeCount(source.topThreeFinishCount),
    mutualFriendCount: sanitizeCount(source.mutualFriendCount),
    sharedGameCount: sanitizeCount(source.sharedGameCount),
    sharedSessionCount: sanitizeCount(source.sharedSessionCount),
    sharedEventCount: sanitizeCount(source.sharedEventCount),
    resultsScreenProfileOpenCount: sanitizeCount(source.resultsScreenProfileOpenCount),
    resultsScreenAddFriendClickCount: sanitizeCount(source.resultsScreenAddFriendClickCount),
    chatProfileOpenCount: sanitizeCount(source.chatProfileOpenCount),
    friendRequestSentCount: sanitizeCount(source.friendRequestSentCount),
    friendRequestAcceptedCount: sanitizeCount(source.friendRequestAcceptedCount),
    thoughtImpressionCount: sanitizeCount(source.thoughtImpressionCount),
    profileOpenSourceBreakdown: buildProfileOpenSourceBreakdown(source.profileOpenSourceBreakdown),
  };
}
