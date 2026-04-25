import {
  getDefaultPlatformStorage,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";
import {
  THOUGHT_FEED_STORAGE_KEY,
  THOUGHT_COMMENT_STORAGE_KEY,
  DEFAULT_THOUGHTS,
  DEFAULT_THOUGHT_COMMENTS,
} from "./thoughts-schema.mjs";
import {
  sanitizeSingleLine,
  sanitizeTextBlock,
  sanitizeCount,
  sanitizeReactionTotals,
  sanitizeThoughtReactionId,
  sanitizeThoughtShareId,
  normalizeThoughtShareActor,
  createFallbackThoughtId,
  createFallbackCommentId,
  countThoughtReactions,
  buildThoughtReactionPickerItems,
  normalizeThoughtPost,
  normalizeThoughtComment,
  formatThoughtDate,
  formatThoughtCommentLabel,
  formatThoughtReactionLabel,
  formatThoughtShareLabel,
} from "./thoughts-normalize.mjs";

// ---------- storage helpers ----------

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

export function parseNormalizedStoredFeed(storage = getDefaultPlatformStorage()) {
  return parseStoredFeed(readStorageText(storage, THOUGHT_FEED_STORAGE_KEY))
    .map((entry, index) => normalizeThoughtPost(entry, index));
}

export function parseNormalizedStoredComments(storage = getDefaultPlatformStorage()) {
  return parseStoredComments(readStorageText(storage, THOUGHT_COMMENT_STORAGE_KEY))
    .map((entry, index) => normalizeThoughtComment(entry, index));
}

export function mergeThoughtSources(primary = [], fallback = []) {
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

export function mergeThoughtComments(primary = [], fallback = []) {
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

export function writeThoughtFeed(storage, thoughtFeed = []) {
  const normalized = Array.isArray(thoughtFeed)
    ? thoughtFeed.map((entry, index) => normalizeThoughtPost(entry, index))
    : [];
  writeStorageText(storage, THOUGHT_FEED_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function writeThoughtComments(storage, comments = []) {
  const normalized = Array.isArray(comments)
    ? comments.map((entry, index) => normalizeThoughtComment(entry, index))
    : [];
  writeStorageText(storage, THOUGHT_COMMENT_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function writeMergedThoughtFeed(storage, additions = [], options = {}) {
  const removeIds = new Set((Array.isArray(options?.removeIds) ? options.removeIds : [])
    .map((value) => sanitizeSingleLine(value, 80))
    .filter(Boolean));
  const current = parseNormalizedStoredFeed(storage)
    .filter((entry) => !removeIds.has(entry.id));
  const merged = mergeThoughtSources(
    additions.map((entry, index) => normalizeThoughtPost(entry, index)),
    current,
  );
  writeThoughtFeed(storage, merged);
  return merged;
}

// ---------- sort ----------

function compareCreatedDesc(left, right) {
  const leftTime = Date.parse(left.createdAt || "") || 0;
  const rightTime = Date.parse(right.createdAt || "") || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return left.authorDisplayName.localeCompare(right.authorDisplayName);
}

function compareCreatedAsc(left, right) {
  const leftTime = Date.parse(left.createdAt || "") || 0;
  const rightTime = Date.parse(right.createdAt || "") || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.authorDisplayName.localeCompare(right.authorDisplayName);
}

// ---------- feed builders ----------

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
      const quotedThought = normalized.repostOfId ? thoughtById.get(normalized.repostOfId) : null;
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
    title: sanitizeSingleLine(options.placeholderTitle, 80) || "No posts yet",
    summary: sanitizeTextBlock(options.placeholderSummary, 500) || "No thoughts have been shared yet.",
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

// ---------- local CRUD ----------

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

  if (!normalized.subject && !normalized.text) return null;

  const current = parseNormalizedStoredFeed(storage)
    .filter((entry) => entry.id !== normalized.id);
  writeThoughtFeed(storage, [normalized, ...current]);
  return normalized;
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

  const mergedFeed = mergeThoughtSources(parseNormalizedStoredFeed(storage), DEFAULT_THOUGHTS);
  const sourceThought = mergedFeed.find((entry) => entry.id === normalizedThoughtId);
  if (!sourceThought) return null;

  const comment = normalizeThoughtComment({
    id: createFallbackCommentId(),
    thoughtId: normalizedThoughtId,
    authorPlayerId: actor.playerId,
    authorDisplayName: actor.authorDisplayName,
    text: normalizedText,
    createdAt: new Date().toISOString(),
    editedAt: "",
  });

  const nextComments = mergeThoughtComments([...parseNormalizedStoredComments(storage), comment], []);
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

export function shareThoughtPost(
  thoughtId,
  viewerActor,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const normalizedThoughtId = sanitizeThoughtShareId(thoughtId);
  const actor = normalizeThoughtShareActor(viewerActor);
  const caption = sanitizeTextBlock(options?.caption, 500);
  if (!normalizedThoughtId || !actor.playerId || !actor.authorDisplayName) return null;

  const merged = mergeThoughtSources(parseNormalizedStoredFeed(storage), DEFAULT_THOUGHTS);
  const sourceThought = merged.find((entry) => entry.id === normalizedThoughtId);
  if (!sourceThought) return null;

  const existingSharedThought = merged.find((entry) => (
    entry.authorPlayerId === actor.playerId && entry.repostOfId === sourceThought.id
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

export function reactToThoughtPost(
  thoughtId,
  viewerPlayerId,
  reactionId,
  storage = getDefaultPlatformStorage(),
) {
  const normalizedThoughtId = sanitizeSingleLine(thoughtId, 80);
  const normalizedViewerPlayerId = sanitizeSingleLine(viewerPlayerId, 80);
  const normalizedReactionId = sanitizeThoughtReactionId(reactionId);
  if (!normalizedThoughtId || !normalizedViewerPlayerId || !normalizedReactionId) return null;

  const merged = mergeThoughtSources(parseNormalizedStoredFeed(storage), DEFAULT_THOUGHTS);
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

  if (!matchedThought) return null;

  writeThoughtFeed(storage, updated);
  return matchedThought;
}
