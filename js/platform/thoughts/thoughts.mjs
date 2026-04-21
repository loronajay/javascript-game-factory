import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
} from "../storage/storage.mjs";

export const THOUGHT_FEED_STORAGE_KEY = getPlatformStorageKey("thoughtFeed");

const THOUGHT_VISIBILITIES = new Set([
  "public",
  "friends",
  "private",
]);

const DEFAULT_THOUGHTS = Object.freeze([
  {
    id: "thought-1",
    authorPlayerId: "player-jay",
    authorDisplayName: "Jay",
    subject: "Late Night Ladder",
    text: "Thinking about putting together a late-night ladder block once a few more cabinets are online.",
    visibility: "public",
    commentCount: 4,
    shareCount: 2,
    repostOfId: "",
    createdAt: "2026-04-21T08:30:00Z",
    editedAt: "",
  },
  {
    id: "thought-2",
    authorPlayerId: "player-maya",
    authorDisplayName: "Maya",
    subject: "",
    text: "Need one more clean goblin pass before I call this run settled.",
    visibility: "public",
    commentCount: 3,
    shareCount: 1,
    repostOfId: "",
    createdAt: "2026-04-21T12:00:00Z",
    editedAt: "",
  },
  {
    id: "thought-3",
    authorPlayerId: "player-ops",
    authorDisplayName: "Ops",
    subject: "Internal Draft",
    text: "This should stay off the public feed.",
    visibility: "friends",
    commentCount: 0,
    shareCount: 0,
    repostOfId: "",
    createdAt: "2026-04-22T09:00:00Z",
    editedAt: "",
  },
]);

function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sanitizeTextBlock(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

function sanitizeCount(value) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
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

function compareCreatedDesc(left, right) {
  const leftTime = Date.parse(left.createdAt || "") || 0;
  const rightTime = Date.parse(right.createdAt || "") || 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.authorDisplayName.localeCompare(right.authorDisplayName);
}

function mergeThoughtSources(primary = [], fallback = []) {
  const merged = [];
  const seen = new Set();

  for (const entry of [...primary, ...fallback]) {
    const normalized = normalizeThoughtPost(entry, merged.length);
    if (!normalized.id || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    merged.push(normalized);
  }

  return merged;
}

export function normalizeThoughtPost(post = {}, index = 0) {
  const id = sanitizeSingleLine(post?.id, 80) || `thought-${index + 1}`;
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
    repostOfId: sanitizeSingleLine(post?.repostOfId, 80),
    createdAt: sanitizeSingleLine(post?.createdAt, 40) || new Date().toISOString(),
    editedAt: sanitizeSingleLine(post?.editedAt, 40),
  };
}

export function buildPublicThoughtFeed(source = DEFAULT_THOUGHTS) {
  if (!Array.isArray(source)) return [];

  return source
    .map((entry, index) => normalizeThoughtPost(entry, index))
    .filter((entry) => entry.visibility === "public")
    .sort(compareCreatedDesc);
}

export function loadThoughtFeed(storage = getDefaultPlatformStorage()) {
  const stored = parseStoredFeed(readStorageText(storage, THOUGHT_FEED_STORAGE_KEY));
  return buildPublicThoughtFeed(mergeThoughtSources(stored, DEFAULT_THOUGHTS));
}
