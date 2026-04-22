import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
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
    reactionTotals: {
      like: 9,
      fire: 2,
    },
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
    reactionTotals: {
      like: 4,
      wow: 1,
    },
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
    reactionTotals: {},
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

function sanitizeReactionTotals(value) {
  if (!value || typeof value !== "object") return {};

  return Object.entries(value).reduce((totals, [key, count]) => {
    const normalizedKey = sanitizeSingleLine(key, 24).toLowerCase();
    if (!normalizedKey) return totals;

    totals[normalizedKey] = sanitizeCount(count);
    return totals;
  }, {});
}

function createFallbackThoughtId() {
  return `thought-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function countThoughtReactions(reactionTotals = {}) {
  return Object.values(reactionTotals).reduce((total, count) => total + sanitizeCount(count), 0);
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

export function formatThoughtDate(value) {
  const timestamp = Date.parse(value || "");
  if (!timestamp) return "Signal pending";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function formatThoughtCommentLabel(count) {
  return `${count} comment${count === 1 ? "" : "s"}`;
}

export function formatThoughtReactionLabel(count) {
  return `${count} reaction${count === 1 ? "" : "s"}`;
}

export function formatThoughtShareLabel(count) {
  return `${count} share${count === 1 ? "" : "s"}`;
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
    reactionTotals: sanitizeReactionTotals(post?.reactionTotals),
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

export function buildPlayerThoughtFeed(source = DEFAULT_THOUGHTS, playerId = "") {
  const normalizedPlayerId = sanitizeSingleLine(playerId, 80);
  if (!normalizedPlayerId) return [];

  return buildPublicThoughtFeed(source)
    .filter((entry) => entry.authorPlayerId === normalizedPlayerId);
}

export function buildThoughtCardItems(thoughtFeed = [], options = {}) {
  const items = Array.isArray(thoughtFeed) ? thoughtFeed : [];

  if (items.length > 0) {
    return items.map((item) => ({
      reactionCount: countThoughtReactions(item.reactionTotals),
      id: item.id,
      title: item.subject || item.authorDisplayName || "Arcade Signal",
      summary: item.text || "Fresh player signal incoming.",
      authorLabel: item.authorDisplayName || "Arcade Pilot",
      publishedLabel: formatThoughtDate(item.createdAt),
      reactionLabel: formatThoughtReactionLabel(countThoughtReactions(item.reactionTotals)),
      commentLabel: formatThoughtCommentLabel(item.commentCount),
      shareLabel: formatThoughtShareLabel(item.shareCount),
      actionItems: [
        { id: "comment", label: "Comments" },
        { id: "share", label: "Share" },
        { id: "react", label: "React" },
      ],
      isPlaceholder: false,
    }));
  }

  return [{
    id: sanitizeSingleLine(options.placeholderId, 80) || "thought-placeholder",
    title: sanitizeSingleLine(options.placeholderTitle, 80) || "Feed Warming Up",
    summary: sanitizeTextBlock(options.placeholderSummary, 500) || "Player status posts will appear here once more social surfaces come online.",
    authorLabel: sanitizeSingleLine(options.placeholderAuthorLabel, 60) || "Arcade Pilot",
    publishedLabel: sanitizeSingleLine(options.placeholderPublishedLabel, 40) || "Soon",
    reactionCount: 0,
    reactionLabel: sanitizeSingleLine(options.placeholderReactionLabel, 40) || "0 reactions",
    commentLabel: sanitizeSingleLine(options.placeholderCommentLabel, 40) || "0 comments",
    shareLabel: sanitizeSingleLine(options.placeholderShareLabel, 40) || "0 shares",
    actionItems: [
      { id: "comment", label: "Comments" },
      { id: "share", label: "Share" },
      { id: "react", label: "React" },
    ],
    isPlaceholder: true,
  }];
}

export function loadThoughtFeed(storage = getDefaultPlatformStorage()) {
  const stored = parseStoredFeed(readStorageText(storage, THOUGHT_FEED_STORAGE_KEY));
  return buildPublicThoughtFeed(mergeThoughtSources(stored, DEFAULT_THOUGHTS));
}

export function publishThoughtPost(post, storage = getDefaultPlatformStorage()) {
  const normalized = normalizeThoughtPost({
    id: createFallbackThoughtId(),
    ...post,
    commentCount: 0,
    shareCount: 0,
    reactionTotals: {},
    repostOfId: "",
  });

  if (!normalized.subject && !normalized.text) {
    return null;
  }

  const current = parseStoredFeed(readStorageText(storage, THOUGHT_FEED_STORAGE_KEY))
    .map((entry, index) => normalizeThoughtPost(entry, index))
    .filter((entry) => entry.id !== normalized.id);

  writeStorageText(storage, THOUGHT_FEED_STORAGE_KEY, JSON.stringify([normalized, ...current]));
  return normalized;
}
