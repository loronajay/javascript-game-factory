// Backend-local normalizers extracted from the shared frontend platform modules.
// No browser/storage/DOM imports — pure data functions only.

// ---------- Shared helpers ----------

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeTimestampField(value, maxLength = 40) {
  if (value instanceof Date) return value.toISOString().slice(0, maxLength);
  return sanitizeSingleLine(value, maxLength);
}

function sanitizeTextBlock(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function sanitizeCount(value) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

function sanitizePlayerId(value) {
  return sanitizeSingleLine(value, 80);
}

function sanitizeGameSlug(value) {
  return sanitizeSingleLine(value, 80);
}

function sanitizeTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return sanitizeSingleLine(value, 80);
}

// ---------- Activity ----------

export const ACTIVITY_FEED_LIMIT = 40;

const ACTIVITY_TYPES = new Set(["game-result"]);
const ACTIVITY_VISIBILITIES = new Set(["public", "friends", "private"]);

function createFallbackActivityId() {
  return `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStringList(value, maxLength = 120) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const item = sanitizeSingleLine(entry, maxLength);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

function sanitizeMetadataValue(value, depth = 0) {
  if (depth > 3) return null;
  if (typeof value === "string") return sanitizeSingleLine(value, 280);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return normalizeStringList(value, 120);
  if (!isPlainObject(value)) return null;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = sanitizeSingleLine(key, 80);
    if (!normalizedKey) continue;
    const normalizedValue = sanitizeMetadataValue(entry, depth + 1);
    if (normalizedValue == null) continue;
    next[normalizedKey] = normalizedValue;
  }
  return next;
}

export function normalizeActivityItem(item = {}, index = 0) {
  const id = sanitizeSingleLine(item?.id, 80) || createFallbackActivityId() || `activity-${index + 1}`;
  const type = sanitizeSingleLine(item?.type, 24).toLowerCase();
  const visibility = sanitizeSingleLine(item?.visibility, 24).toLowerCase();

  return {
    id,
    type: ACTIVITY_TYPES.has(type) ? type : "game-result",
    actorPlayerId: sanitizeSingleLine(item?.actorPlayerId, 80),
    actorDisplayName: sanitizeSingleLine(item?.actorDisplayName, 60),
    gameSlug: sanitizeSingleLine(item?.gameSlug, 80),
    summary: sanitizeTextBlock(item?.summary, 280),
    visibility: ACTIVITY_VISIBILITIES.has(visibility) ? visibility : "friends",
    createdAt: normalizeTimestampField(item?.createdAt) || new Date().toISOString(),
    metadata: sanitizeMetadataValue(item?.metadata) || {},
  };
}

// ---------- Metrics ----------

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

// ---------- Profiles ----------

const FRIEND_CODE_LENGTH = 8;
const PROFILE_TAGLINE_MAX_LENGTH = 80;
const PROFILE_BIO_MAX_LENGTH = 280;
const PROFILE_REAL_NAME_MAX_LENGTH = 48;
const PROFILE_LINK_LABEL_MAX_LENGTH = 24;
const PROFILE_BACKGROUND_URL_MAX_LENGTH = 280;
const FACTORY_PROFILE_NAME_MAX_LENGTH = 12;
const FACTORY_PROFILE_VERSION = 1;

const PROFILE_LINK_KINDS = new Set(["external", "social", "support", "portfolio"]);
const PROFILE_PRESENCES = new Set(["online", "away", "busy", "offline"]);

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function sanitizeProfileFriendCode(value) {
  return sanitizeSingleLine(value, FRIEND_CODE_LENGTH * 2)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, FRIEND_CODE_LENGTH);
}

export function buildDefaultFriendCode(playerId, attempt = 0) {
  const normalizedPlayerId = sanitizeSingleLine(playerId, 80);
  if (!normalizedPlayerId) return "";
  const source = `${normalizedPlayerId}#${Math.max(0, Math.floor(Number(attempt) || 0))}`;
  const left = hashString(`${source}:left`).toString(36).toUpperCase();
  const right = hashString(`${source}:right`).toString(36).toUpperCase();
  return `${left}${right}`.replace(/[^A-Z0-9]/g, "").padStart(FRIEND_CODE_LENGTH, "0").slice(0, FRIEND_CODE_LENGTH);
}

function sanitizeFactoryProfileName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, FACTORY_PROFILE_NAME_MAX_LENGTH);
}

function normalizeUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function normalizePresence(value) {
  const presence = sanitizeSingleLine(value, 24).toLowerCase();
  return PROFILE_PRESENCES.has(presence) ? presence : "offline";
}

function normalizePublicStringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const item = sanitizeSingleLine(entry, 120);
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

function normalizeLadderPlacement(entry) {
  if (!isPlainObject(entry)) return null;
  const gameSlug = sanitizeGameSlug(entry.gameSlug || entry.slug);
  const rank = Math.max(0, Math.floor(Number(entry.rank) || 0));
  const ratingLabel = sanitizeSingleLine(entry.ratingLabel, 32);
  const score = Math.max(0, Math.floor(Number(entry.score) || 0));
  if (!gameSlug || rank <= 0) return null;
  return { gameSlug, rank, ratingLabel: ratingLabel || (score > 0 ? `${score} ELO` : ""), score };
}

function normalizeLadderPlacements(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  value.forEach((entry) => {
    const placement = normalizeLadderPlacement(entry);
    if (!placement || seen.has(placement.gameSlug)) return;
    seen.add(placement.gameSlug);
    normalized.push(placement);
  });
  return normalized;
}

function normalizeFriendPreviewEntry(entry, options = {}) {
  if (!isPlainObject(entry)) return null;
  const profileName = sanitizeSingleLine(entry.profileName || entry.displayName, 60);
  const playerId = sanitizeSingleLine(entry.playerId, 80);
  const friendPoints = Math.max(0, Math.floor(Number(entry.friendPoints) || 0));
  const isMainSqueeze = !!options.isMainSqueeze || !!entry.isMainSqueeze;
  if (!profileName && !playerId) return null;
  return { playerId, profileName: profileName || "Arcade Pilot", presence: normalizePresence(entry.presence), friendPoints, isMainSqueeze };
}

function normalizeFriendsPreview(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  value.forEach((entry) => {
    const friend = normalizeFriendPreviewEntry(entry);
    const dedupeKey = friend ? (friend.playerId || friend.profileName) : "";
    if (!friend || seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    normalized.push(friend);
  });
  return normalized;
}

function defaultLinkLabelFromUrl(value) {
  try { return new URL(value).hostname.replace(/^www\./i, ""); } catch { return ""; }
}

function normalizeProfileLink(link, index = 0) {
  if (!isPlainObject(link)) return null;
  const url = normalizeUrl(link.url);
  if (!url) return null;
  const label = sanitizeSingleLine(link.label, PROFILE_LINK_LABEL_MAX_LENGTH) || defaultLinkLabelFromUrl(url);
  const kind = sanitizeSingleLine(link.kind, 24).toLowerCase();
  return {
    id: sanitizeSingleLine(link.id, 60) || `link-${index + 1}`,
    label: label.slice(0, PROFILE_LINK_LABEL_MAX_LENGTH),
    url,
    kind: PROFILE_LINK_KINDS.has(kind) ? kind : "external",
    createdAt: sanitizeSingleLine(link.createdAt, 40),
  };
}

function normalizeProfileLinks(links) {
  if (!Array.isArray(links)) return [];
  const seenUrls = new Set();
  const normalized = [];
  links.forEach((entry, index) => {
    const link = normalizeProfileLink(entry, index);
    if (!link || seenUrls.has(link.url)) return;
    seenUrls.add(link.url);
    normalized.push(link);
  });
  return normalized;
}

function normalizeProfileFields(profile = {}) {
  const source = isPlainObject(profile) ? profile : {};
  return {
    realName: sanitizeSingleLine(source.realName, PROFILE_REAL_NAME_MAX_LENGTH),
    bio: sanitizeTextBlock(source.bio, PROFILE_BIO_MAX_LENGTH),
    tagline: sanitizeSingleLine(source.tagline, PROFILE_TAGLINE_MAX_LENGTH),
    avatarAssetId: sanitizeSingleLine(source.avatarAssetId, 120),
    backgroundImageUrl: normalizeUrl(sanitizeSingleLine(source.backgroundImageUrl, PROFILE_BACKGROUND_URL_MAX_LENGTH)),
    friendCode: sanitizeProfileFriendCode(source.friendCode),
    presence: normalizePresence(source.presence),
    favoriteGameSlug: sanitizeGameSlug(source.favoriteGameSlug),
    ladderPlacements: normalizeLadderPlacements(source.ladderPlacements),
    friendsPreview: normalizeFriendsPreview(source.friendsPreview),
    mainSqueeze: normalizeFriendPreviewEntry(source.mainSqueeze, { isMainSqueeze: true }),
    badgeIds: normalizePublicStringList(source.badgeIds),
    links: normalizeProfileLinks(source.links),
  };
}

function normalizeSimpleStringList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  for (const entry of value) {
    const item = typeof entry === "string" ? entry.trim() : "";
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }
  return normalized;
}

export function normalizeFactoryProfile(profile = {}, options = {}) {
  const source = isPlainObject(profile) ? profile : {};
  const playerIdGenerator = typeof options?.playerIdGenerator === "function"
    ? options.playerIdGenerator
    : () => `player-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const seededProfileName = sanitizeFactoryProfileName(options.seedProfileName || "");
  const playerId = typeof source.playerId === "string" ? source.playerId.trim() : "";
  const resolvedPlayerId = playerId || playerIdGenerator();
  const profileName = sanitizeFactoryProfileName(source.profileName || "") || seededProfileName;
  const profileFields = normalizeProfileFields(source);

  return {
    version: FACTORY_PROFILE_VERSION,
    playerId: resolvedPlayerId,
    profileName,
    friendCode: profileFields.friendCode || buildDefaultFriendCode(resolvedPlayerId),
    realName: profileFields.realName,
    bio: profileFields.bio,
    tagline: profileFields.tagline,
    avatarAssetId: profileFields.avatarAssetId,
    backgroundImageUrl: profileFields.backgroundImageUrl,
    presence: profileFields.presence,
    favoriteGameSlug: profileFields.favoriteGameSlug,
    ladderPlacements: profileFields.ladderPlacements,
    friendsPreview: profileFields.friendsPreview,
    mainSqueeze: profileFields.mainSqueeze,
    badgeIds: profileFields.badgeIds,
    favorites: normalizeSimpleStringList(source.favorites),
    friends: normalizeSimpleStringList(source.friends),
    recentPartners: normalizeSimpleStringList(source.recentPartners),
    links: profileFields.links,
    preferences: isPlainObject(source.preferences) ? { ...source.preferences } : {},
  };
}

// ---------- Relationships ----------

export const FRIENDSHIP_CREATION_POINTS = 100;
export const SHARED_SESSION_POINTS = 10;
export const SHARED_EVENT_POINTS = 50;
export const DIRECT_INTERACTION_POINTS = 1;
export const DIRECT_INTERACTION_WINDOW_MS = 10 * 60 * 1000;
export const DIRECT_INTERACTION_WINDOW_LIMIT = 5;

const RELATIONSHIP_SLOT_MODES = new Set(["manual", "auto"]);
const FRIEND_RAIL_SLOT_COUNT = 4;

function normalizeRelationshipMode(value, fallback = "manual") {
  const normalized = sanitizeSingleLine(value, 24).toLowerCase();
  return RELATIONSHIP_SLOT_MODES.has(normalized) ? normalized : fallback;
}

function normalizePlayerIdList(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const normalized = [];
  value.forEach((entry) => {
    const id = sanitizePlayerId(entry);
    if (!id || seen.has(id)) return;
    seen.add(id);
    normalized.push(id);
  });
  return normalized;
}

function normalizeManualFriendSlotPlayerIds(value) {
  return Array.from({ length: FRIEND_RAIL_SLOT_COUNT }, (_, index) => sanitizePlayerId(value?.[index]));
}

function normalizePlayerCountMap(value) {
  if (!isPlainObject(value)) return {};
  return Object.entries(value).reduce((normalized, [id, count]) => {
    const key = sanitizePlayerId(id);
    const amount = sanitizeCount(count);
    if (!key || amount <= 0) return normalized;
    normalized[key] = amount;
    return normalized;
  }, {});
}

function normalizePlayerTimestampMap(value) {
  if (!isPlainObject(value)) return {};
  return Object.entries(value).reduce((normalized, [id, ts]) => {
    const key = sanitizePlayerId(id);
    const amount = sanitizeTimestamp(ts);
    if (!key || !amount) return normalized;
    normalized[key] = amount;
    return normalized;
  }, {});
}

export function buildDefaultProfileRelationshipsRecord(playerId = "") {
  return {
    playerId: sanitizePlayerId(playerId),
    mainSqueezeMode: "manual",
    mainSqueezePlayerId: "",
    friendRailMode: "auto",
    manualFriendSlotPlayerIds: Array(FRIEND_RAIL_SLOT_COUNT).fill(""),
    mostPlayedWithPlayerId: "",
    lastPlayedWithPlayerId: "",
    recentlyPlayedWithPlayerIds: [],
    friendPlayerIds: [],
    friendPointsByPlayerId: {},
    mutualFriendCountByPlayerId: {},
    sharedGameCountByPlayerId: {},
    sharedSessionCountByPlayerId: {},
    sharedEventCountByPlayerId: {},
    lastSharedSessionAtByPlayerId: {},
    lastSharedEventAtByPlayerId: {},
    lastInteractionAtByPlayerId: {},
  };
}

export function normalizeProfileRelationshipsRecord(record = {}) {
  const source = isPlainObject(record) ? record : {};
  const defaults = buildDefaultProfileRelationshipsRecord(source.playerId);
  return {
    ...defaults,
    playerId: sanitizePlayerId(source.playerId),
    mainSqueezeMode: normalizeRelationshipMode(source.mainSqueezeMode, defaults.mainSqueezeMode),
    mainSqueezePlayerId: sanitizePlayerId(source.mainSqueezePlayerId),
    friendRailMode: normalizeRelationshipMode(source.friendRailMode, defaults.friendRailMode),
    manualFriendSlotPlayerIds: normalizeManualFriendSlotPlayerIds(source.manualFriendSlotPlayerIds),
    mostPlayedWithPlayerId: sanitizePlayerId(source.mostPlayedWithPlayerId),
    lastPlayedWithPlayerId: sanitizePlayerId(source.lastPlayedWithPlayerId),
    recentlyPlayedWithPlayerIds: normalizePlayerIdList(source.recentlyPlayedWithPlayerIds),
    friendPlayerIds: normalizePlayerIdList(source.friendPlayerIds),
    friendPointsByPlayerId: normalizePlayerCountMap(source.friendPointsByPlayerId),
    mutualFriendCountByPlayerId: normalizePlayerCountMap(source.mutualFriendCountByPlayerId),
    sharedGameCountByPlayerId: normalizePlayerCountMap(source.sharedGameCountByPlayerId),
    sharedSessionCountByPlayerId: normalizePlayerCountMap(source.sharedSessionCountByPlayerId),
    sharedEventCountByPlayerId: normalizePlayerCountMap(source.sharedEventCountByPlayerId),
    lastSharedSessionAtByPlayerId: normalizePlayerTimestampMap(source.lastSharedSessionAtByPlayerId),
    lastSharedEventAtByPlayerId: normalizePlayerTimestampMap(source.lastSharedEventAtByPlayerId),
    lastInteractionAtByPlayerId: normalizePlayerTimestampMap(source.lastInteractionAtByPlayerId),
  };
}

// ---------- Thoughts ----------

export const THOUGHT_REACTION_IDS = Object.freeze([
  "like", "love", "laugh", "wow", "fire", "sad", "angry", "poop",
]);

const THOUGHT_REACTION_ID_SET = new Set(THOUGHT_REACTION_IDS);
const THOUGHT_VISIBILITIES = new Set(["public", "friends", "private"]);

function sanitizeReactionTotals(value) {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce((totals, [key, count]) => {
    const normalizedKey = sanitizeSingleLine(key, 24).toLowerCase();
    if (!THOUGHT_REACTION_ID_SET.has(normalizedKey)) return totals;
    const normalizedCount = sanitizeCount(count);
    if (normalizedCount <= 0) return totals;
    totals[normalizedKey] = normalizedCount;
    return totals;
  }, {});
}

function sanitizeThoughtReactionId(value) {
  const normalized = sanitizeSingleLine(value, 24).toLowerCase();
  return THOUGHT_REACTION_ID_SET.has(normalized) ? normalized : "";
}

function sanitizeThoughtShareId(value) {
  return sanitizeSingleLine(value, 80);
}

function sanitizeThoughtCommentId(value) {
  return sanitizeSingleLine(value, 80);
}

function createFallbackThoughtId() {
  return `thought-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createFallbackCommentId() {
  return `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeThoughtPost(post = {}, index = 0) {
  const id = sanitizeSingleLine(post?.id, 80) || createFallbackThoughtId() || `thought-${index + 1}`;
  const visibility = sanitizeSingleLine(post?.visibility, 24).toLowerCase();
  return {
    id,
    authorPlayerId: sanitizeSingleLine(post?.authorPlayerId, 80),
    authorDisplayName: sanitizeSingleLine(post?.authorDisplayName, 60) || "Arcade Pilot",
    subject: sanitizeSingleLine(post?.subject, 80),
    text: sanitizeTextBlock(post?.text, 500),
    visibility: THOUGHT_VISIBILITIES.has(visibility) ? visibility : "public",
    commentCount: sanitizeCount(post?.commentCount),
    shareCount: sanitizeCount(post?.shareCount),
    reactionTotals: sanitizeReactionTotals(post?.reactionTotals),
    viewerReaction: sanitizeThoughtReactionId(post?.viewerReaction),
    viewerSharedThoughtId: sanitizeThoughtShareId(post?.viewerSharedThoughtId),
    repostOfId: sanitizeSingleLine(post?.repostOfId, 80),
    imageUrl: sanitizeSingleLine(post?.imageUrl, 800),
    createdAt: normalizeTimestampField(post?.createdAt) || new Date().toISOString(),
    editedAt: sanitizeSingleLine(post?.editedAt, 40),
  };
}

export function normalizeThoughtComment(comment = {}, index = 0) {
  return {
    id: sanitizeThoughtCommentId(comment?.id) || createFallbackCommentId() || `comment-${index + 1}`,
    thoughtId: sanitizeThoughtShareId(comment?.thoughtId),
    authorPlayerId: sanitizeSingleLine(comment?.authorPlayerId, 80),
    authorDisplayName: sanitizeSingleLine(comment?.authorDisplayName, 60) || "Arcade Pilot",
    text: sanitizeTextBlock(comment?.text, 500),
    createdAt: normalizeTimestampField(comment?.createdAt) || new Date().toISOString(),
    editedAt: sanitizeSingleLine(comment?.editedAt, 40),
  };
}
