import { getDefaultPlatformStorage } from "../storage/storage.mjs";
import { createPlatformApiClient } from "../api/platform-api.mjs";
import { recordDirectInteractionBetweenPlayers } from "../relationships/relationships.mjs";
import {
  sanitizeSingleLine,
  sanitizeTextBlock,
  sanitizeThoughtReactionId,
  sanitizeThoughtShareId,
  normalizeThoughtShareActor,
  normalizeThoughtPost,
  normalizeThoughtComment,
} from "./thoughts-normalize.mjs";
import {
  parseNormalizedStoredFeed,
  parseNormalizedStoredComments,
  writeThoughtFeed,
  writeThoughtComments,
  loadThoughtFeed,
  loadThoughtComments,
  deleteThoughtPost,
  publishThoughtPost,
  commentOnThoughtPost,
  shareThoughtPost,
  reactToThoughtPost,
} from "./thoughts-store.mjs";

function cacheThoughtPosts(storage, additions = [], options = {}) {
  const removeIds = new Set(
    (Array.isArray(options?.removeIds) ? options.removeIds : [])
      .map((v) => sanitizeSingleLine(v, 80))
      .filter(Boolean),
  );
  const incoming = additions.map((entry, index) => normalizeThoughtPost(entry, index));
  const incomingIds = new Set(incoming.map((e) => e.id));
  const current = parseNormalizedStoredFeed(storage)
    .filter((entry) => !removeIds.has(entry.id) && !incomingIds.has(entry.id));
  writeThoughtFeed(storage, [...incoming, ...current]);
}

export async function syncThoughtFeedFromApi(
  storage = getDefaultPlatformStorage(),
  apiClient = createPlatformApiClient(),
  viewerPlayerId = "",
) {
  const canLoad = apiClient && typeof apiClient.listThoughts === "function";
  if (!canLoad) return loadThoughtFeed(storage);

  const remoteFeed = await apiClient.listThoughts(viewerPlayerId).catch(() => null);
  if (!Array.isArray(remoteFeed)) return loadThoughtFeed(storage);

  // Auth: API response is canonical; write to local as cache (no merge with local user posts)
  writeThoughtFeed(storage, remoteFeed.map((entry, index) => normalizeThoughtPost(entry, index)));
  return loadThoughtFeed(storage);
}

export async function syncThoughtCommentsFromApi(
  thoughtId,
  storage = getDefaultPlatformStorage(),
  apiClient = createPlatformApiClient(),
) {
  const normalizedThoughtId = sanitizeThoughtShareId(thoughtId);
  const canLoad = normalizedThoughtId && apiClient && typeof apiClient.listThoughtComments === "function";
  if (!canLoad) return loadThoughtComments(normalizedThoughtId, storage);

  const remoteComments = await apiClient.listThoughtComments(normalizedThoughtId).catch(() => null);
  if (!Array.isArray(remoteComments)) return loadThoughtComments(normalizedThoughtId, storage);

  // Auth: API response replaces local comments for this thought
  const normalized = remoteComments.map((entry, index) => normalizeThoughtComment(entry, index));
  const otherComments = parseNormalizedStoredComments(storage)
    .filter((entry) => entry.thoughtId !== normalizedThoughtId);
  writeThoughtComments(storage, [...otherComments, ...normalized]);

  const realCount = normalized.length;
  const storedFeed = parseNormalizedStoredFeed(storage);
  const matchingThought = storedFeed.find((t) => t.id === normalizedThoughtId);
  if (matchingThought && matchingThought.commentCount !== realCount) {
    cacheThoughtPosts(storage, [normalizeThoughtPost({ ...matchingThought, commentCount: realCount })]);
  }

  return loadThoughtComments(normalizedThoughtId, storage);
}

export async function publishThoughtPostWithApi(
  post,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  const isAuth = typeof apiClient?.saveThought === "function";

  if (!isAuth) {
    // Guest: local only
    return publishThoughtPost(post, storage);
  }

  // Auth: API first; no local pre-write
  const candidate = normalizeThoughtPost({
    id: `thought-tmp-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    ...post,
    commentCount: 0,
    shareCount: 0,
    reactionTotals: {},
    repostOfId: "",
  });
  if (!candidate.subject && !candidate.text && !candidate.imageUrl) return null;

  const remoteThought = await apiClient.saveThought(candidate).catch(() => null);
  if (!remoteThought) return null;

  const saved = normalizeThoughtPost(remoteThought);
  cacheThoughtPosts(storage, [saved]);
  return saved;
}

export async function deleteThoughtPostWithApi(
  id,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  const isAuth = typeof apiClient?.deleteThought === "function";

  if (!isAuth) {
    // Guest: local only
    return deleteThoughtPost(id, storage);
  }

  // Auth: API first, then update local cache
  await apiClient.deleteThought(id).catch(() => null);
  deleteThoughtPost(id, storage);
  return true;
}

export async function commentOnThoughtPostWithApi(
  thoughtId,
  viewerActor,
  text,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const actor = normalizeThoughtShareActor(viewerActor);
  const normalizedText = sanitizeTextBlock(text, 500);
  const normalizedThoughtId = sanitizeThoughtShareId(thoughtId);
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  const isAuth = typeof apiClient?.commentOnThought === "function";

  if (!isAuth) {
    // Guest: local only
    return commentOnThoughtPost(thoughtId, viewerActor, text, storage);
  }

  // Auth: API first
  if (!normalizedThoughtId || !actor.playerId || !actor.authorDisplayName || !normalizedText) return null;

  const remoteCommentRecord = await apiClient
    .commentOnThought(normalizedThoughtId, actor.playerId, actor.authorDisplayName, normalizedText)
    .catch(() => null);

  if (!remoteCommentRecord?.thought || !remoteCommentRecord?.comment) return null;

  const resolvedRecord = {
    thought: normalizeThoughtPost(remoteCommentRecord.thought),
    comment: normalizeThoughtComment(remoteCommentRecord.comment),
  };

  // Update local cache from API response
  cacheThoughtPosts(storage, [resolvedRecord.thought]);
  const otherComments = parseNormalizedStoredComments(storage)
    .filter((entry) => entry.id !== resolvedRecord.comment.id);
  writeThoughtComments(storage, [...otherComments, resolvedRecord.comment]);

  const canRecordInteraction = resolvedRecord.thought.authorPlayerId
    && resolvedRecord.thought.authorPlayerId !== actor.playerId;
  if (!canRecordInteraction) {
    return { ...resolvedRecord, comments: loadThoughtComments(resolvedRecord.thought.id, storage) };
  }

  const occurredAt = new Date().toISOString();
  await recordDirectInteractionBetweenPlayers(actor.playerId, resolvedRecord.thought.authorPlayerId, {
    occurredAt,
    source: "thought_comment",
    thoughtId: resolvedRecord.thought.id,
    commentId: resolvedRecord.comment.id,
    storage,
    apiClient,
  }).catch(() => null);

  return { ...resolvedRecord, comments: loadThoughtComments(resolvedRecord.thought.id, storage) };
}

export async function shareThoughtPostWithApi(
  thoughtId,
  viewerActor,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const actor = normalizeThoughtShareActor(viewerActor);
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  const isAuth = typeof apiClient?.shareThought === "function";

  if (!isAuth) {
    // Guest: local only
    return shareThoughtPost(thoughtId, viewerActor, storage, options);
  }

  // Auth: API first
  if (!sanitizeThoughtShareId(thoughtId) || !actor.playerId || !actor.authorDisplayName) return null;

  const remoteShare = await apiClient
    .shareThought(
      thoughtId,
      actor.playerId,
      actor.authorDisplayName,
      { caption: sanitizeTextBlock(options?.caption, 500) },
    )
    .catch(() => null);

  if (!remoteShare?.originalThought) return null;

  const resolvedShare = {
    originalThought: normalizeThoughtPost(remoteShare.originalThought),
    sharedThought: remoteShare.sharedThought ? normalizeThoughtPost(remoteShare.sharedThought) : null,
    removedSharedThoughtId: sanitizeThoughtShareId(remoteShare.removedSharedThoughtId),
  };

  // Update local cache from API response
  cacheThoughtPosts(
    storage,
    [resolvedShare.originalThought, resolvedShare.sharedThought].filter(Boolean),
    { removeIds: [resolvedShare.removedSharedThoughtId].filter(Boolean) },
  );

  const canRecordInteraction = !!resolvedShare.sharedThought
    && resolvedShare.originalThought?.authorPlayerId
    && resolvedShare.originalThought.authorPlayerId !== actor.playerId;
  if (!canRecordInteraction) return resolvedShare;

  const occurredAt = new Date().toISOString();
  await recordDirectInteractionBetweenPlayers(actor.playerId, resolvedShare.originalThought.authorPlayerId, {
    occurredAt,
    source: "thought_share",
    thoughtId: resolvedShare.originalThought.id,
    sharedThoughtId: resolvedShare.sharedThought.id,
    storage,
    apiClient,
  }).catch(() => null);
  return resolvedShare;
}

export async function reactToThoughtPostWithApi(
  thoughtId,
  viewerPlayerId,
  reactionId,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  const isAuth = typeof apiClient?.reactToThought === "function";

  if (!isAuth) {
    // Guest: local only
    return reactToThoughtPost(thoughtId, viewerPlayerId, reactionId, storage);
  }

  // Auth: API first
  const normalizedThoughtId = sanitizeThoughtShareId(thoughtId);
  const normalizedViewerPlayerId = sanitizeSingleLine(viewerPlayerId, 80);
  const normalizedReactionId = sanitizeThoughtReactionId(reactionId);
  if (!normalizedThoughtId || !normalizedViewerPlayerId || !normalizedReactionId) return null;

  const remoteThought = await apiClient
    .reactToThought(normalizedThoughtId, normalizedViewerPlayerId, normalizedReactionId)
    .catch(() => null);

  if (!remoteThought) return null;

  const resolvedThought = normalizeThoughtPost(remoteThought);
  // Update local cache from API response
  cacheThoughtPosts(storage, [resolvedThought]);

  const canRecordInteraction = resolvedThought.authorPlayerId
    && resolvedThought.authorPlayerId !== normalizedViewerPlayerId
    && !!resolvedThought.viewerReaction;
  if (!canRecordInteraction) return resolvedThought;

  const occurredAt = new Date().toISOString();
  await recordDirectInteractionBetweenPlayers(viewerPlayerId, resolvedThought.authorPlayerId, {
    occurredAt,
    source: "thought_reaction",
    thoughtId: resolvedThought.id,
    reactionId: resolvedThought.viewerReaction,
    storage,
    apiClient,
  }).catch(() => null);
  return resolvedThought;
}
