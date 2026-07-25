import {
  getDefaultPlatformStorage,
  readStorageText,
  writeStorageText,
} from "../storage/storage.mjs";
import type { StorageLike } from "../storage/storage.mjs";
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
  normalizeThoughtPost,
  normalizeThoughtComment,
} from "./thoughts-normalize.mjs";
import type { ThoughtPost, NormalizedThoughtComment } from "./thoughts-normalize.mjs";

type MaybeStorage = StorageLike | null;
type DatedAuthored = { createdAt: string; authorDisplayName: string };

// ---------- storage helpers ----------

function parseStoredFeed(raw: string | null): unknown[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseStoredComments(raw: string | null): unknown[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function parseNormalizedStoredFeed(storage: MaybeStorage = getDefaultPlatformStorage()): ThoughtPost[] {
  return parseStoredFeed(readStorageText(storage, THOUGHT_FEED_STORAGE_KEY))
    .map((entry, index) => normalizeThoughtPost(entry, index));
}

export function parseNormalizedStoredComments(storage: MaybeStorage = getDefaultPlatformStorage()): NormalizedThoughtComment[] {
  return parseStoredComments(readStorageText(storage, THOUGHT_COMMENT_STORAGE_KEY))
    .map((entry, index) => normalizeThoughtComment(entry, index));
}

function mergeThoughtSources(primary: unknown[] = [], fallback: unknown[] = []): ThoughtPost[] {
  const merged: ThoughtPost[] = [];
  const seen = new Set<string>();

  for (const entry of [...primary, ...fallback]) {
    const normalized = normalizeThoughtPost(entry, merged.length);
    if (!normalized.id || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    merged.push(normalized);
  }

  return merged;
}

function mergeThoughtComments(primary: unknown[] = [], fallback: unknown[] = []): NormalizedThoughtComment[] {
  const merged: NormalizedThoughtComment[] = [];
  const seen = new Set<string>();

  for (const entry of [...primary, ...fallback]) {
    const normalized = normalizeThoughtComment(entry, merged.length);
    if (!normalized.id || !normalized.thoughtId || !normalized.text || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    merged.push(normalized);
  }

  return merged;
}

export function writeThoughtFeed(storage: MaybeStorage, thoughtFeed: unknown[] = []): ThoughtPost[] {
  const normalized = Array.isArray(thoughtFeed)
    ? thoughtFeed.map((entry, index) => normalizeThoughtPost(entry, index))
    : [];
  writeStorageText(storage, THOUGHT_FEED_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function writeThoughtComments(storage: MaybeStorage, comments: unknown[] = []): NormalizedThoughtComment[] {
  const normalized = Array.isArray(comments)
    ? comments.map((entry, index) => normalizeThoughtComment(entry, index))
    : [];
  writeStorageText(storage, THOUGHT_COMMENT_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

// ---------- sort ----------

function compareCreatedDesc(left: DatedAuthored, right: DatedAuthored): number {
  const leftTime = Date.parse(left.createdAt || "") || 0;
  const rightTime = Date.parse(right.createdAt || "") || 0;
  if (leftTime !== rightTime) return rightTime - leftTime;
  return left.authorDisplayName.localeCompare(right.authorDisplayName);
}

function compareCreatedAsc(left: DatedAuthored, right: DatedAuthored): number {
  const leftTime = Date.parse(left.createdAt || "") || 0;
  const rightTime = Date.parse(right.createdAt || "") || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.authorDisplayName.localeCompare(right.authorDisplayName);
}

// ---------- feed builders ----------

export function buildPublicThoughtFeed(source: unknown = DEFAULT_THOUGHTS): ThoughtPost[] {
  if (!Array.isArray(source)) return [];

  return source
    .map((entry, index) => normalizeThoughtPost(entry, index))
    .filter((entry) => entry.visibility === "public")
    .sort(compareCreatedDesc);
}

export function buildPlayerThoughtFeed(source: unknown = DEFAULT_THOUGHTS, playerId: unknown = ""): ThoughtPost[] {
  const normalizedPlayerId = sanitizeSingleLine(playerId, 80);
  if (!normalizedPlayerId) return [];

  return buildPublicThoughtFeed(source)
    .filter((entry) => entry.authorPlayerId === normalizedPlayerId);
}

// ---------- local CRUD ----------

export function loadThoughtFeed(storage: MaybeStorage = getDefaultPlatformStorage()): ThoughtPost[] {
  const stored = parseNormalizedStoredFeed(storage);
  return buildPublicThoughtFeed(mergeThoughtSources(stored, DEFAULT_THOUGHTS as unknown[]));
}

export function loadThoughtComments(thoughtId: unknown, storage: MaybeStorage = getDefaultPlatformStorage()): NormalizedThoughtComment[] {
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

export function deleteThoughtPost(id: unknown, storage: MaybeStorage = getDefaultPlatformStorage()): boolean {
  const normalizedId = sanitizeSingleLine(id, 80);
  if (!normalizedId) return false;

  const current = parseNormalizedStoredFeed(storage)
    .filter((entry) => entry.id !== normalizedId);
  writeThoughtFeed(storage, current);
  return true;
}

export function publishThoughtPost(post: Record<string, unknown> | null | undefined, storage: MaybeStorage = getDefaultPlatformStorage()): ThoughtPost | null {
  const normalized = normalizeThoughtPost({
    id: createFallbackThoughtId(),
    createdAt: new Date().toISOString(),
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
  thoughtId: unknown,
  viewerActor: unknown,
  text: unknown,
  storage: MaybeStorage = getDefaultPlatformStorage(),
) {
  const normalizedThoughtId = sanitizeThoughtShareId(thoughtId);
  const actor = normalizeThoughtShareActor(viewerActor);
  const normalizedText = sanitizeTextBlock(text, 500);
  if (!normalizedThoughtId || !actor.playerId || !actor.authorDisplayName || !normalizedText) {
    return null;
  }

  const mergedFeed = mergeThoughtSources(parseNormalizedStoredFeed(storage), DEFAULT_THOUGHTS as unknown[]);
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

// Local mirror of the server moderation rule: a comment can be removed by its author or by
// the author of the post it sits under. Returns null when the viewer may not remove it, so
// callers can leave the panel untouched instead of faking a success.
export function deleteThoughtCommentPost(
  thoughtId: unknown,
  commentId: unknown,
  viewerPlayerId: unknown,
  storage: MaybeStorage = getDefaultPlatformStorage(),
) {
  const normalizedThoughtId = sanitizeThoughtShareId(thoughtId);
  const normalizedCommentId = sanitizeSingleLine(commentId, 80);
  const normalizedViewerPlayerId = sanitizeSingleLine(viewerPlayerId, 80);
  if (!normalizedThoughtId || !normalizedCommentId || !normalizedViewerPlayerId) return null;

  // Read through the visible thread (stored, or the seeded defaults when nothing is stored
  // yet) so a removal also sticks for seed comments the viewer is allowed to moderate.
  const visibleComments = loadThoughtComments(normalizedThoughtId, storage);
  const target = visibleComments.find((entry) => entry.id === normalizedCommentId);
  if (!target) return null;

  const mergedFeed = mergeThoughtSources(parseNormalizedStoredFeed(storage), DEFAULT_THOUGHTS as unknown[]);
  const sourceThought = mergedFeed.find((entry) => entry.id === normalizedThoughtId);
  const isCommentAuthor = target.authorPlayerId === normalizedViewerPlayerId;
  const isThoughtAuthor = !!sourceThought && sourceThought.authorPlayerId === normalizedViewerPlayerId;
  if (!isCommentAuthor && !isThoughtAuthor) return null;

  const remainingComments = visibleComments.filter((entry) => entry.id !== normalizedCommentId);
  const otherThreads = parseNormalizedStoredComments(storage)
    .filter((entry) => entry.thoughtId !== normalizedThoughtId);
  writeThoughtComments(storage, [...otherThreads, ...remainingComments]);

  if (!sourceThought) {
    return { thought: null, commentId: normalizedCommentId, comments: remainingComments };
  }

  const updatedThought = normalizeThoughtPost({
    ...sourceThought,
    commentCount: remainingComments.length,
  });
  writeThoughtFeed(
    storage,
    mergedFeed.map((entry) => (entry.id === normalizedThoughtId ? updatedThought : entry)),
  );

  return {
    thought: updatedThought,
    commentId: normalizedCommentId,
    comments: remainingComments,
  };
}

export function shareThoughtPost(
  thoughtId: unknown,
  viewerActor: unknown,
  storage: MaybeStorage = getDefaultPlatformStorage(),
  options: { caption?: unknown } = {},
) {
  const normalizedThoughtId = sanitizeThoughtShareId(thoughtId);
  const actor = normalizeThoughtShareActor(viewerActor);
  const caption = sanitizeTextBlock(options?.caption, 500);
  if (!normalizedThoughtId || !actor.playerId || !actor.authorDisplayName) return null;

  const merged = mergeThoughtSources(parseNormalizedStoredFeed(storage), DEFAULT_THOUGHTS as unknown[]);
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
  let sharedThought: ThoughtPost | null = null;
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
  thoughtId: unknown,
  viewerPlayerId: unknown,
  reactionId: unknown,
  storage: MaybeStorage = getDefaultPlatformStorage(),
): ThoughtPost | null {
  const normalizedThoughtId = sanitizeSingleLine(thoughtId, 80);
  const normalizedViewerPlayerId = sanitizeSingleLine(viewerPlayerId, 80);
  const normalizedReactionId = sanitizeThoughtReactionId(reactionId);
  if (!normalizedThoughtId || !normalizedViewerPlayerId || !normalizedReactionId) return null;

  const merged = mergeThoughtSources(parseNormalizedStoredFeed(storage), DEFAULT_THOUGHTS as unknown[]);
  const updated: ThoughtPost[] = [];
  let matchedThought: ThoughtPost | null = null;

  for (const entry of merged) {
    if (entry.id !== normalizedThoughtId) {
      updated.push(entry);
      continue;
    }

    const nextThought = normalizeThoughtPost(entry);
    const nextTotals: Record<string, number> = { ...sanitizeReactionTotals(nextThought.reactionTotals) };
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
