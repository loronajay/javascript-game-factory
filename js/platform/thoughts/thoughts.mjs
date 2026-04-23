import {
  getDefaultPlatformStorage,
  getPlatformStorageKey,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";
import { createPlatformApiClient } from "../api/platform-api.mjs";
import { recordDirectInteractionBetweenPlayers } from "../relationships/relationships.mjs";

export const THOUGHT_FEED_STORAGE_KEY = getPlatformStorageKey("thoughtFeed");
export const THOUGHT_COMMENT_STORAGE_KEY = getPlatformStorageKey("thoughtComments");
export const THOUGHT_REACTION_IDS = Object.freeze([
  "like",
  "love",
  "laugh",
  "wow",
  "fire",
  "sad",
  "angry",
  "poop",
]);
const THOUGHT_REACTION_ID_SET = new Set(THOUGHT_REACTION_IDS);
const THOUGHT_REACTION_LABELS = Object.freeze({
  like: "Like",
  love: "Love",
  laugh: "Laugh",
  wow: "Wow",
  fire: "Fire",
  sad: "Sad",
  angry: "Angry",
  poop: "Poop",
});
const THOUGHT_REACTION_GLYPHS = Object.freeze({
  like: "👍",
  love: "❤️",
  laugh: "😂",
  wow: "😮",
  fire: "🔥",
  sad: "😢",
  angry: "😡",
  poop: "💩",
});

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

const DEFAULT_THOUGHT_COMMENTS = Object.freeze([
  {
    id: "comment-thought-1-1",
    thoughtId: "thought-1",
    authorPlayerId: "player-maya",
    authorDisplayName: "Maya",
    text: "If you lock this in, I can be there after 10.",
    createdAt: "2026-04-21T09:10:00Z",
    editedAt: "",
  },
  {
    id: "comment-thought-1-2",
    thoughtId: "thought-1",
    authorPlayerId: "player-jay",
    authorDisplayName: "Jay",
    text: "Late-night ladder block sounds perfect.",
    createdAt: "2026-04-21T09:18:00Z",
    editedAt: "",
  },
  {
    id: "comment-thought-2-1",
    thoughtId: "thought-2",
    authorPlayerId: "player-ops",
    authorDisplayName: "Ops",
    text: "That goblin pass is almost there. Keep it steady.",
    createdAt: "2026-04-21T12:18:00Z",
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

function normalizeThoughtShareActor(actor = {}) {
  if (!actor || typeof actor !== "object") {
    return {
      playerId: "",
      authorDisplayName: "",
    };
  }

  return {
    playerId: sanitizeSingleLine(actor.playerId, 80),
    authorDisplayName: sanitizeSingleLine(actor.profileName || actor.authorDisplayName, 60),
  };
}

function createFallbackCommentId() {
  return `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeThoughtComment(comment = {}, index = 0) {
  return {
    id: sanitizeThoughtCommentId(comment?.id) || `comment-${index + 1}`,
    thoughtId: sanitizeThoughtShareId(comment?.thoughtId),
    authorPlayerId: sanitizeSingleLine(comment?.authorPlayerId, 80),
    authorDisplayName: sanitizeSingleLine(comment?.authorDisplayName, 60) || "Arcade Pilot",
    text: sanitizeTextBlock(comment?.text, 500),
    createdAt: sanitizeSingleLine(comment?.createdAt, 40) || new Date().toISOString(),
    editedAt: sanitizeSingleLine(comment?.editedAt, 40),
  };
}

function buildThoughtReactionPickerItems(reactionTotals = {}, viewerReaction = "") {
  const normalizedTotals = sanitizeReactionTotals(reactionTotals);
  const normalizedViewerReaction = sanitizeThoughtReactionId(viewerReaction);

  return THOUGHT_REACTION_IDS.map((reactionId) => ({
    id: reactionId,
    label: THOUGHT_REACTION_LABELS[reactionId] || reactionId,
    glyph: THOUGHT_REACTION_GLYPHS[reactionId] || "",
    count: sanitizeCount(normalizedTotals[reactionId]),
    isSelected: reactionId === normalizedViewerReaction,
  }));
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

function parseStoredComments(raw) {
  if (typeof raw !== "string" || raw.length === 0) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseNormalizedStoredFeed(storage = getDefaultPlatformStorage()) {
  return parseStoredFeed(readStorageText(storage, THOUGHT_FEED_STORAGE_KEY))
    .map((entry, index) => normalizeThoughtPost(entry, index));
}

function parseNormalizedStoredComments(storage = getDefaultPlatformStorage()) {
  return parseStoredComments(readStorageText(storage, THOUGHT_COMMENT_STORAGE_KEY))
    .map((entry, index) => normalizeThoughtComment(entry, index));
}

function mergeStoredThoughtFeed(primary = [], fallback = []) {
  return mergeThoughtSources(primary, fallback);
}

function writeMergedThoughtFeed(storage, additions = [], options = {}) {
  const removeIds = new Set((Array.isArray(options?.removeIds) ? options.removeIds : [])
    .map((value) => sanitizeSingleLine(value, 80))
    .filter(Boolean));
  const current = parseNormalizedStoredFeed(storage)
    .filter((entry) => !removeIds.has(entry.id));
  const merged = mergeStoredThoughtFeed(
    additions.map((entry, index) => normalizeThoughtPost(entry, index)),
    current,
  );
  writeThoughtFeed(storage, merged);
  return merged;
}

function writeThoughtFeed(storage, thoughtFeed = []) {
  const normalized = Array.isArray(thoughtFeed)
    ? thoughtFeed.map((entry, index) => normalizeThoughtPost(entry, index))
    : [];
  writeStorageText(storage, THOUGHT_FEED_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function mergeThoughtComments(primary = [], fallback = []) {
  const merged = [];
  const seen = new Set();

  for (const entry of [...primary, ...fallback]) {
    const normalized = normalizeThoughtComment(entry, merged.length);
    if (!normalized.id || !normalized.thoughtId || !normalized.text || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    merged.push(normalized);
  }

  return merged;
}

function writeThoughtComments(storage, comments = []) {
  const normalized = Array.isArray(comments)
    ? comments.map((entry, index) => normalizeThoughtComment(entry, index))
    : [];
  writeStorageText(storage, THOUGHT_COMMENT_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function compareCreatedDesc(left, right) {
  const leftTime = Date.parse(left.createdAt || "") || 0;
  const rightTime = Date.parse(right.createdAt || "") || 0;
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return left.authorDisplayName.localeCompare(right.authorDisplayName);
}

function compareCreatedAsc(left, right) {
  const leftTime = Date.parse(left.createdAt || "") || 0;
  const rightTime = Date.parse(right.createdAt || "") || 0;
  if (leftTime !== rightTime) {
    return leftTime - rightTime;
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
    viewerReaction: sanitizeThoughtReactionId(post?.viewerReaction),
    viewerSharedThoughtId: sanitizeThoughtShareId(post?.viewerSharedThoughtId),
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
  const isOwner = !!options?.isOwner;
  const thoughtById = new Map(items.map((item, index) => {
    const normalized = normalizeThoughtPost(item, index);
    return [normalized.id, normalized];
  }));

  if (items.length > 0) {
    return items.map((item, index) => {
      const normalized = normalizeThoughtPost(item, index);
      const quotedThought = normalized.repostOfId
        ? thoughtById.get(normalized.repostOfId)
        : null;
      const hasCaption = !!normalized.text;

      return {
        reactionCount: countThoughtReactions(normalized.reactionTotals),
        id: normalized.id,
        title: normalized.subject || normalized.authorDisplayName || "Arcade Signal",
        summary: normalized.text || (normalized.repostOfId ? "Shared a thought from the arcade feed." : "Fresh player signal incoming."),
        authorLabel: normalized.authorDisplayName || "Arcade Pilot",
        publishedLabel: formatThoughtDate(normalized.createdAt),
        reactionLabel: formatThoughtReactionLabel(countThoughtReactions(normalized.reactionTotals)),
        commentLabel: formatThoughtCommentLabel(normalized.commentCount),
        shareLabel: formatThoughtShareLabel(normalized.shareCount),
        reactionPickerItems: buildThoughtReactionPickerItems(normalized.reactionTotals, normalized.viewerReaction),
        shareTargetId: normalized.repostOfId || normalized.id,
        commentTargetId: normalized.repostOfId || normalized.id,
        quotedThought: quotedThought
          ? {
              id: quotedThought.id,
              title: quotedThought.subject || quotedThought.authorDisplayName || "Arcade Signal",
              summary: quotedThought.text || "Shared arcade signal.",
              authorLabel: quotedThought.authorDisplayName || "Arcade Pilot",
              publishedLabel: formatThoughtDate(quotedThought.createdAt),
            }
          : null,
        hasCaption,
        actionItems: [
          { id: "comment", label: "Comments" },
          { id: "share", label: normalized.viewerSharedThoughtId ? "Shared" : "Share", isActive: !!normalized.viewerSharedThoughtId },
          { id: "react", label: "React" },
        ],
        canDelete: isOwner,
        isPlaceholder: false,
      };
    });
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
    reactionPickerItems: buildThoughtReactionPickerItems(),
    actionItems: [
      { id: "comment", label: "Comments" },
      { id: "share", label: "Share" },
      { id: "react", label: "React" },
    ],
    canDelete: false,
    isPlaceholder: true,
  }];
}

export function loadThoughtFeed(storage = getDefaultPlatformStorage()) {
  const stored = parseNormalizedStoredFeed(storage);
  return buildPublicThoughtFeed(mergeThoughtSources(stored, DEFAULT_THOUGHTS));
}

export function loadThoughtComments(thoughtId, storage = getDefaultPlatformStorage()) {
  const normalizedThoughtId = sanitizeThoughtShareId(thoughtId);
  if (!normalizedThoughtId) return [];

  const storedComments = parseNormalizedStoredComments(storage)
    .filter((entry) => entry.thoughtId === normalizedThoughtId);
  if (storedComments.length > 0) {
    return storedComments.sort(compareCreatedAsc);
  }

  return DEFAULT_THOUGHT_COMMENTS
    .map((entry, index) => normalizeThoughtComment(entry, index))
    .filter((entry) => entry.thoughtId === normalizedThoughtId)
    .sort(compareCreatedAsc);
}

export function deleteThoughtPost(id, storage = getDefaultPlatformStorage()) {
  const normalizedId = sanitizeSingleLine(id, 80);
  if (!normalizedId) return false;

  const current = parseNormalizedStoredFeed(storage)
    .filter((entry) => entry.id !== normalizedId);

  writeThoughtFeed(storage, current);
  return true;
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

  const current = parseNormalizedStoredFeed(storage)
    .filter((entry) => entry.id !== normalized.id);

  writeThoughtFeed(storage, [normalized, ...current]);
  return normalized;
}

export async function syncThoughtFeedFromApi(
  storage = getDefaultPlatformStorage(),
  apiClient = createPlatformApiClient(),
  viewerPlayerId = "",
) {
  const canLoad = apiClient && typeof apiClient.listThoughts === "function";
  if (!canLoad) {
    return loadThoughtFeed(storage);
  }

  const remoteFeed = await apiClient.listThoughts(viewerPlayerId).catch(() => null);
  if (!Array.isArray(remoteFeed)) {
    return loadThoughtFeed(storage);
  }

  const merged = mergeStoredThoughtFeed(
    remoteFeed.map((entry, index) => normalizeThoughtPost(entry, index)),
    parseNormalizedStoredFeed(storage),
  );
  writeThoughtFeed(storage, merged);
  return loadThoughtFeed(storage);
}

export async function syncThoughtCommentsFromApi(
  thoughtId,
  storage = getDefaultPlatformStorage(),
  apiClient = createPlatformApiClient(),
) {
  const normalizedThoughtId = sanitizeThoughtShareId(thoughtId);
  const canLoad = normalizedThoughtId && apiClient && typeof apiClient.listThoughtComments === "function";
  if (!canLoad) {
    return loadThoughtComments(normalizedThoughtId, storage);
  }

  const remoteComments = await apiClient.listThoughtComments(normalizedThoughtId).catch(() => null);
  if (!Array.isArray(remoteComments)) {
    return loadThoughtComments(normalizedThoughtId, storage);
  }

  const current = parseNormalizedStoredComments(storage)
    .filter((entry) => entry.thoughtId !== normalizedThoughtId);
  const merged = mergeThoughtComments(
    current,
    remoteComments.map((entry, index) => normalizeThoughtComment(entry, index)),
  );
  writeThoughtComments(storage, merged);
  return loadThoughtComments(normalizedThoughtId, storage);
}

export async function publishThoughtPostWithApi(
  post,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const saved = publishThoughtPost(post, storage);
  if (!saved) return null;

  const apiClient = options?.apiClient || createPlatformApiClient(options);
  if (typeof apiClient?.saveThought !== "function") {
    return saved;
  }

  const remoteThought = await apiClient.saveThought(saved).catch(() => null);
  if (remoteThought) {
    const merged = mergeStoredThoughtFeed(
      [normalizeThoughtPost(remoteThought)],
      parseNormalizedStoredFeed(storage).filter((entry) => entry.id !== remoteThought.id),
    );
    writeThoughtFeed(storage, merged);
  }

  return saved;
}

export async function deleteThoughtPostWithApi(
  id,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const deleted = deleteThoughtPost(id, storage);
  if (!deleted) return false;

  const apiClient = options?.apiClient || createPlatformApiClient(options);
  if (typeof apiClient?.deleteThought === "function") {
    await apiClient.deleteThought(id).catch(() => null);
  }

  return true;
}

export function commentOnThoughtPost(
  thoughtId,
  viewerActor,
  text,
  storage = getDefaultPlatformStorage(),
) {
  const normalizedThoughtId = sanitizeThoughtShareId(thoughtId);
  const actor = normalizeThoughtShareActor(viewerActor);
  const normalizedText = sanitizeTextBlock(text, 500);
  if (!normalizedThoughtId || !actor.playerId || !actor.authorDisplayName || !normalizedText) {
    return null;
  }

  const mergedFeed = mergeStoredThoughtFeed(parseNormalizedStoredFeed(storage), DEFAULT_THOUGHTS);
  const sourceThought = mergedFeed.find((entry) => entry.id === normalizedThoughtId);
  if (!sourceThought) {
    return null;
  }

  const comment = normalizeThoughtComment({
    id: createFallbackCommentId(),
    thoughtId: normalizedThoughtId,
    authorPlayerId: actor.playerId,
    authorDisplayName: actor.authorDisplayName,
    text: normalizedText,
    createdAt: new Date().toISOString(),
    editedAt: "",
  });

  const nextComments = mergeThoughtComments(
    [...parseNormalizedStoredComments(storage), comment],
    [],
  );
  writeThoughtComments(storage, nextComments);

  const updatedThought = normalizeThoughtPost({
    ...sourceThought,
    commentCount: sanitizeCount(sourceThought.commentCount) + 1,
  });
  const nextFeed = mergedFeed.map((entry) => (entry.id === normalizedThoughtId ? updatedThought : entry));
  writeThoughtFeed(storage, nextFeed);

  return {
    thought: updatedThought,
    comment,
    comments: loadThoughtComments(normalizedThoughtId, storage),
  };
}

export async function commentOnThoughtPostWithApi(
  thoughtId,
  viewerActor,
  text,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const localCommentRecord = commentOnThoughtPost(thoughtId, viewerActor, text, storage);
  if (!localCommentRecord) {
    return null;
  }

  const actor = normalizeThoughtShareActor(viewerActor);
  const normalizedText = sanitizeTextBlock(text, 500);
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  let resolvedRecord = localCommentRecord;

  if (typeof apiClient?.commentOnThought === "function") {
    const remoteCommentRecord = await apiClient
      .commentOnThought(
        localCommentRecord.thought.id,
        actor.playerId,
        actor.authorDisplayName,
        normalizedText,
      )
      .catch(() => null);

    if (remoteCommentRecord?.thought && remoteCommentRecord?.comment) {
      resolvedRecord = {
        thought: normalizeThoughtPost(remoteCommentRecord.thought),
        comment: normalizeThoughtComment(remoteCommentRecord.comment),
      };

      writeMergedThoughtFeed(storage, [resolvedRecord.thought]);
      const current = parseNormalizedStoredComments(storage)
        .filter((entry) => entry.id !== resolvedRecord.comment.id);
      writeThoughtComments(storage, mergeThoughtComments(current, [resolvedRecord.comment]));
    }
  }

  const canRecordInteraction = resolvedRecord.thought.authorPlayerId
    && resolvedRecord.thought.authorPlayerId !== actor.playerId;
  if (!canRecordInteraction) {
    return {
      ...resolvedRecord,
      comments: loadThoughtComments(resolvedRecord.thought.id, storage),
    };
  }

  const occurredAt = new Date().toISOString();
  if (typeof apiClient?.recordDirectInteractionBetweenPlayers === "function") {
    await apiClient.recordDirectInteractionBetweenPlayers(actor.playerId, resolvedRecord.thought.authorPlayerId, {
      occurredAt,
      source: "thought_comment",
      thoughtId: resolvedRecord.thought.id,
      commentId: resolvedRecord.comment.id,
    }).catch(() => null);
  } else {
    recordDirectInteractionBetweenPlayers(actor.playerId, resolvedRecord.thought.authorPlayerId, {
      occurredAt,
      source: "thought_comment",
      thoughtId: resolvedRecord.thought.id,
      commentId: resolvedRecord.comment.id,
      storage,
      apiClient,
    });
  }

  return {
    ...resolvedRecord,
    comments: loadThoughtComments(resolvedRecord.thought.id, storage),
  };
}

export function shareThoughtPost(
  thoughtId,
  viewerActor,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const normalizedThoughtId = sanitizeThoughtShareId(thoughtId);
  const actor = normalizeThoughtShareActor(viewerActor);
  const caption = sanitizeTextBlock(options?.caption, 500);
  if (!normalizedThoughtId || !actor.playerId || !actor.authorDisplayName) {
    return null;
  }

  const merged = mergeStoredThoughtFeed(parseNormalizedStoredFeed(storage), DEFAULT_THOUGHTS);
  const sourceThought = merged.find((entry) => entry.id === normalizedThoughtId);
  if (!sourceThought) {
    return null;
  }

  const existingSharedThought = merged.find((entry) => (
    entry.authorPlayerId === actor.playerId
      && entry.repostOfId === sourceThought.id
  ));
  const sharedThoughtId = existingSharedThought?.id || sanitizeThoughtShareId(
    `thought-share-${actor.playerId.slice(0, 24)}-${sourceThought.id.slice(0, 24)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const originalThought = normalizeThoughtPost({
    ...sourceThought,
    shareCount: existingSharedThought
      ? Math.max(0, sanitizeCount(sourceThought.shareCount) - 1)
      : sanitizeCount(sourceThought.shareCount) + 1,
    viewerSharedThoughtId: existingSharedThought ? "" : sharedThoughtId,
  });

  const nextFeed = merged.filter((entry) => entry.id !== sourceThought.id && entry.id !== existingSharedThought?.id);
  let sharedThought = null;
  if (!existingSharedThought) {
    sharedThought = normalizeThoughtPost({
      id: sharedThoughtId,
      authorPlayerId: actor.playerId,
      authorDisplayName: actor.authorDisplayName,
      subject: "",
      text: caption,
      visibility: sourceThought.visibility,
      commentCount: 0,
      shareCount: 0,
      reactionTotals: {},
      viewerSharedThoughtId: sharedThoughtId,
      repostOfId: sourceThought.id,
      createdAt: new Date().toISOString(),
      editedAt: "",
    });
    nextFeed.unshift(sharedThought);
  }

  nextFeed.unshift(originalThought);
  writeThoughtFeed(storage, nextFeed);

  return {
    originalThought,
    sharedThought,
    removedSharedThoughtId: existingSharedThought?.id || "",
  };
}

export async function shareThoughtPostWithApi(
  thoughtId,
  viewerActor,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const localShare = shareThoughtPost(thoughtId, viewerActor, storage, options);
  if (!localShare) {
    return null;
  }

  const actor = normalizeThoughtShareActor(viewerActor);
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  let resolvedShare = localShare;

  if (typeof apiClient?.shareThought === "function") {
    const remoteShare = await apiClient
      .shareThought(
        localShare.originalThought.repostOfId || localShare.originalThought.id,
        actor.playerId,
        actor.authorDisplayName,
        { caption: sanitizeTextBlock(options?.caption, 500) },
      )
      .catch(() => null);

    if (remoteShare?.originalThought) {
      resolvedShare = {
        originalThought: normalizeThoughtPost(remoteShare.originalThought),
        sharedThought: remoteShare.sharedThought ? normalizeThoughtPost(remoteShare.sharedThought) : null,
        removedSharedThoughtId: sanitizeThoughtShareId(remoteShare.removedSharedThoughtId),
      };

      writeMergedThoughtFeed(
        storage,
        [resolvedShare.originalThought, resolvedShare.sharedThought].filter(Boolean),
        {
          removeIds: [resolvedShare.removedSharedThoughtId].filter(Boolean),
        },
      );
    }
  }

  const canRecordInteraction = !!resolvedShare.sharedThought
    && resolvedShare.originalThought?.authorPlayerId
    && resolvedShare.originalThought.authorPlayerId !== actor.playerId;
  if (!canRecordInteraction) {
    return resolvedShare;
  }

  const occurredAt = new Date().toISOString();
  if (typeof apiClient?.recordDirectInteractionBetweenPlayers === "function") {
    await apiClient.recordDirectInteractionBetweenPlayers(actor.playerId, resolvedShare.originalThought.authorPlayerId, {
      occurredAt,
      source: "thought_share",
      thoughtId: resolvedShare.originalThought.id,
      sharedThoughtId: resolvedShare.sharedThought.id,
    }).catch(() => null);
    return resolvedShare;
  }

  recordDirectInteractionBetweenPlayers(actor.playerId, resolvedShare.originalThought.authorPlayerId, {
    occurredAt,
    source: "thought_share",
    thoughtId: resolvedShare.originalThought.id,
    sharedThoughtId: resolvedShare.sharedThought.id,
    storage,
    apiClient,
  });
  return resolvedShare;
}

export function reactToThoughtPost(
  thoughtId,
  viewerPlayerId,
  reactionId,
  storage = getDefaultPlatformStorage(),
) {
  const normalizedThoughtId = sanitizeSingleLine(thoughtId, 80);
  const normalizedViewerPlayerId = sanitizeSingleLine(viewerPlayerId, 80);
  const normalizedReactionId = sanitizeThoughtReactionId(reactionId);
  if (!normalizedThoughtId || !normalizedViewerPlayerId || !normalizedReactionId) {
    return null;
  }

  const merged = mergeStoredThoughtFeed(parseNormalizedStoredFeed(storage), DEFAULT_THOUGHTS);
  const updated = [];
  let matchedThought = null;

  for (const entry of merged) {
    if (entry.id !== normalizedThoughtId) {
      updated.push(entry);
      continue;
    }

    const nextThought = normalizeThoughtPost(entry);
    const nextTotals = { ...sanitizeReactionTotals(nextThought.reactionTotals) };
    const previousReactionId = sanitizeThoughtReactionId(nextThought.viewerReaction);

    if (previousReactionId) {
      const previousCount = sanitizeCount(nextTotals[previousReactionId]);
      if (previousCount <= 1) {
        delete nextTotals[previousReactionId];
      } else {
        nextTotals[previousReactionId] = previousCount - 1;
      }
    }

    const shouldClearReaction = previousReactionId === normalizedReactionId;
    if (!shouldClearReaction) {
      nextTotals[normalizedReactionId] = sanitizeCount(nextTotals[normalizedReactionId]) + 1;
    }

    matchedThought = normalizeThoughtPost({
      ...nextThought,
      reactionTotals: nextTotals,
      viewerReaction: shouldClearReaction ? "" : normalizedReactionId,
    });
    updated.push(matchedThought);
  }

  if (!matchedThought) {
    return null;
  }

  writeThoughtFeed(storage, updated);
  return matchedThought;
}

export async function reactToThoughtPostWithApi(
  thoughtId,
  viewerPlayerId,
  reactionId,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const localThought = reactToThoughtPost(thoughtId, viewerPlayerId, reactionId, storage);
  if (!localThought) {
    return null;
  }

  const apiClient = options?.apiClient || createPlatformApiClient(options);
  let resolvedThought = localThought;

  if (typeof apiClient?.reactToThought === "function") {
    const remoteThought = await apiClient
      .reactToThought(localThought.id, sanitizeSingleLine(viewerPlayerId, 80), sanitizeThoughtReactionId(reactionId))
      .catch(() => null);

    if (remoteThought) {
      resolvedThought = normalizeThoughtPost(remoteThought);
      const merged = mergeStoredThoughtFeed(
        [resolvedThought],
        parseNormalizedStoredFeed(storage).filter((entry) => entry.id !== resolvedThought.id),
      );
      writeThoughtFeed(storage, merged);
    }
  }

  const canRecordInteraction = resolvedThought.authorPlayerId
    && resolvedThought.authorPlayerId !== sanitizeSingleLine(viewerPlayerId, 80)
    && !!resolvedThought.viewerReaction;
  if (!canRecordInteraction) {
    return resolvedThought;
  }

  const occurredAt = new Date().toISOString();
  if (typeof apiClient?.recordDirectInteractionBetweenPlayers === "function") {
    await apiClient.recordDirectInteractionBetweenPlayers(viewerPlayerId, resolvedThought.authorPlayerId, {
      occurredAt,
      source: "thought_reaction",
      thoughtId: resolvedThought.id,
      reactionId: resolvedThought.viewerReaction,
    }).catch(() => null);
    return resolvedThought;
  }

  recordDirectInteractionBetweenPlayers(viewerPlayerId, resolvedThought.authorPlayerId, {
    occurredAt,
    source: "thought_reaction",
    thoughtId: resolvedThought.id,
    reactionId: resolvedThought.viewerReaction,
    storage,
    apiClient,
  });
  return resolvedThought;
}
