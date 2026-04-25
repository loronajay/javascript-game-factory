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
  mergeThoughtSources,
  mergeThoughtComments,
  writeThoughtFeed,
  writeThoughtComments,
  writeMergedThoughtFeed,
  loadThoughtFeed,
  loadThoughtComments,
  deleteThoughtPost,
  publishThoughtPost,
  commentOnThoughtPost,
  shareThoughtPost,
  reactToThoughtPost,
} from "./thoughts-store.mjs";

export async function syncThoughtFeedFromApi(
  storage = getDefaultPlatformStorage(),
  apiClient = createPlatformApiClient(),
  viewerPlayerId = "",
) {
  const canLoad = apiClient && typeof apiClient.listThoughts === "function";
  if (!canLoad) return loadThoughtFeed(storage);

  const remoteFeed = await apiClient.listThoughts(viewerPlayerId).catch(() => null);
  if (!Array.isArray(remoteFeed)) return loadThoughtFeed(storage);

  const merged = mergeThoughtSources(
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
  if (!canLoad) return loadThoughtComments(normalizedThoughtId, storage);

  const remoteComments = await apiClient.listThoughtComments(normalizedThoughtId).catch(() => null);
  if (!Array.isArray(remoteComments)) return loadThoughtComments(normalizedThoughtId, storage);

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
  if (typeof apiClient?.saveThought !== "function") return saved;

  const remoteThought = await apiClient.saveThought(saved).catch(() => null);
  if (remoteThought) {
    const merged = mergeThoughtSources(
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

export async function commentOnThoughtPostWithApi(
  thoughtId,
  viewerActor,
  text,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const localCommentRecord = commentOnThoughtPost(thoughtId, viewerActor, text, storage);
  if (!localCommentRecord) return null;

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
        .filter((entry) => entry.id !== localCommentRecord.comment.id)
        .filter((entry) => entry.id !== resolvedRecord.comment.id);
      writeThoughtComments(storage, mergeThoughtComments(current, [resolvedRecord.comment]));
    }
  }

  const canRecordInteraction = resolvedRecord.thought.authorPlayerId
    && resolvedRecord.thought.authorPlayerId !== actor.playerId;
  if (!canRecordInteraction) {
    return { ...resolvedRecord, comments: loadThoughtComments(resolvedRecord.thought.id, storage) };
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

  return { ...resolvedRecord, comments: loadThoughtComments(resolvedRecord.thought.id, storage) };
}

export async function shareThoughtPostWithApi(
  thoughtId,
  viewerActor,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const localShare = shareThoughtPost(thoughtId, viewerActor, storage, options);
  if (!localShare) return null;

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
        { removeIds: [resolvedShare.removedSharedThoughtId].filter(Boolean) },
      );
    }
  }

  const canRecordInteraction = !!resolvedShare.sharedThought
    && resolvedShare.originalThought?.authorPlayerId
    && resolvedShare.originalThought.authorPlayerId !== actor.playerId;
  if (!canRecordInteraction) return resolvedShare;

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

export async function reactToThoughtPostWithApi(
  thoughtId,
  viewerPlayerId,
  reactionId,
  storage = getDefaultPlatformStorage(),
  options = {},
) {
  const localThought = reactToThoughtPost(thoughtId, viewerPlayerId, reactionId, storage);
  if (!localThought) return null;

  const apiClient = options?.apiClient || createPlatformApiClient(options);
  let resolvedThought = localThought;

  if (typeof apiClient?.reactToThought === "function") {
    const remoteThought = await apiClient
      .reactToThought(localThought.id, sanitizeSingleLine(viewerPlayerId, 80), sanitizeThoughtReactionId(reactionId))
      .catch(() => null);

    if (remoteThought) {
      resolvedThought = normalizeThoughtPost(remoteThought);
      const merged = mergeThoughtSources(
        [resolvedThought],
        parseNormalizedStoredFeed(storage).filter((entry) => entry.id !== resolvedThought.id),
      );
      writeThoughtFeed(storage, merged);
    }
  }

  const canRecordInteraction = resolvedThought.authorPlayerId
    && resolvedThought.authorPlayerId !== sanitizeSingleLine(viewerPlayerId, 80)
    && !!resolvedThought.viewerReaction;
  if (!canRecordInteraction) return resolvedThought;

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
