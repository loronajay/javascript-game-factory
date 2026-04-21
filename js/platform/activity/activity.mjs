import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";

export const ACTIVITY_FEED_STORAGE_KEY = getPlatformStorageKey("activityFeed");
export const ACTIVITY_FEED_LIMIT = 40;

const ACTIVITY_TYPES = new Set([
  "game-result",
]);

const ACTIVITY_VISIBILITIES = new Set([
  "public",
  "friends",
  "private",
]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeTextBlock(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

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

function parseStoredFeed(raw) {
  if (typeof raw !== "string" || raw.length === 0) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compareActivityDesc(left, right) {
  const leftTime = Date.parse(left.createdAt || "") || 0;
  const rightTime = Date.parse(right.createdAt || "") || 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.summary.localeCompare(right.summary);
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
    createdAt: sanitizeSingleLine(item?.createdAt, 40) || new Date().toISOString(),
    metadata: sanitizeMetadataValue(item?.metadata) || {},
  };
}

export function loadActivityFeed(storage = getDefaultPlatformStorage()) {
  const raw = readStorageText(storage, ACTIVITY_FEED_STORAGE_KEY);
  return parseStoredFeed(raw)
    .map((entry, index) => normalizeActivityItem(entry, index))
    .sort(compareActivityDesc);
}

export function publishActivityItem(item, storage = getDefaultPlatformStorage()) {
  const normalized = normalizeActivityItem(item);
  const current = loadActivityFeed(storage).filter((entry) => entry.id !== normalized.id);
  const next = [normalized, ...current].slice(0, ACTIVITY_FEED_LIMIT);
  writeStorageText(storage, ACTIVITY_FEED_STORAGE_KEY, JSON.stringify(next));
  return normalized;
}

function normalizeIdentity(identity = {}) {
  return {
    playerId: sanitizeSingleLine(identity?.playerId, 80),
    displayName: sanitizeSingleLine(identity?.displayName, 60),
  };
}

function actorNameFromOptions(options = {}) {
  return sanitizeSingleLine(options?.actorDisplayName, 60) || "A pilot";
}

export function buildLoversLostRunActivity(runSummary, options = {}) {
  const summary = isPlainObject(runSummary) ? runSummary : {};
  const actorDisplayName = actorNameFromOptions(options);
  const outcome = sanitizeSingleLine(summary.outcome, 24).toLowerCase() || "game_over";
  let text = `${actorDisplayName} finished a Lovers Lost run.`;
  if (outcome === "reunion") {
    text = `${actorDisplayName} reunited both lovers in Lovers Lost with ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  } else if (outcome === "partial") {
    text = `${actorDisplayName} carried one lover to the finish in Lovers Lost for ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  } else if (summary.disconnectNote) {
    text = `${actorDisplayName} ended a Lovers Lost run after a disconnect with ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  } else {
    text = `${actorDisplayName} timed out in Lovers Lost with ${Math.max(0, Math.floor(Number(summary.totalScore) || 0))} points.`;
  }

  return normalizeActivityItem({
    type: "game-result",
    actorPlayerId: sanitizeSingleLine(options?.actorPlayerId, 80),
    actorDisplayName,
    gameSlug: "lovers-lost",
    summary: text,
    visibility: options?.visibility || "friends",
    createdAt: options?.createdAt,
    metadata: {
      outcome,
      totalScore: Math.max(0, Math.floor(Number(summary.totalScore) || 0)),
      elapsedFrames: Math.max(0, Math.floor(Number(summary.elapsedFrames) || 0)),
      boyFinished: !!summary.boyFinished,
      girlFinished: !!summary.girlFinished,
      disconnectNote: !!summary.disconnectNote,
      boyIdentity: normalizeIdentity(summary.boyIdentity),
      girlIdentity: normalizeIdentity(summary.girlIdentity),
    },
  });
}

export function buildBattleshitsMatchActivity(match, options = {}) {
  const source = isPlainObject(match) ? match : {};
  const myProfile = normalizeIdentity(source.myProfile);
  const opponentProfile = normalizeIdentity(source.opponentProfile);
  const actorDisplayName = myProfile.displayName || actorNameFromOptions(options);
  const result = sanitizeSingleLine(source.result, 24).toLowerCase() || "loss";
  const opponentName = opponentProfile.displayName || "an opponent";

  let text = `${actorDisplayName} finished a Battleshits match against ${opponentName}.`;
  if (result === "win") {
    text = `${actorDisplayName} won a Battleshits match against ${opponentName}.`;
  } else if (result === "forfeit_win") {
    text = `${actorDisplayName} won a Battleshits match by forfeit against ${opponentName}.`;
  } else {
    text = `${actorDisplayName} lost a Battleshits match to ${opponentName}.`;
  }

  return normalizeActivityItem({
    type: "game-result",
    actorPlayerId: myProfile.playerId || sanitizeSingleLine(options?.actorPlayerId, 80),
    actorDisplayName,
    gameSlug: "battleshits",
    summary: text,
    visibility: options?.visibility || "friends",
    createdAt: source.createdAt || options?.createdAt,
    metadata: {
      matchResult: result,
      opponentDisplayName: opponentProfile.displayName,
      matchmakingMode: sanitizeSingleLine(source.matchmakingMode, 40),
      roomCode: sanitizeSingleLine(source.roomCode, 20),
    },
  });
}

export function publishLoversLostRunActivity(runSummary, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const item = buildLoversLostRunActivity(runSummary, options);
  return publishActivityItem(item, storage);
}

export function publishBattleshitsMatchActivity(match, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const item = buildBattleshitsMatchActivity(match, options);
  return publishActivityItem(item, storage);
}
