import {
  normalizeThoughtComment,
  THOUGHT_REACTION_IDS,
  normalizeThoughtPost,
} from "../normalize.mjs";

export function sanitizeThoughtId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function ensureJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function sanitizeViewerPlayerId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

export function sanitizeViewerAuthorDisplayName(value) {
  return typeof value === "string" ? value.trim().slice(0, 60) : "";
}

export function sanitizeCommentText(value) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, 500) : "";
}

export function sanitizeReactionId(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().slice(0, 24) : "";
  return THOUGHT_REACTION_IDS.includes(normalized) ? normalized : "";
}

export function mapRowToThought(row = {}, options = {}) {
  return normalizeThoughtPost({
    id: row.id,
    authorPlayerId: row.author_player_id,
    authorDisplayName: row.author_display_name,
    subject: row.subject,
    text: row.text,
    visibility: row.visibility,
    commentCount: row.comment_count,
    shareCount: row.share_count,
    reactionTotals: options.reactionTotals ?? ensureJsonObject(row.reaction_totals),
    viewerReaction: options.viewerReaction ?? "",
    viewerSharedThoughtId: options.viewerSharedThoughtId ?? "",
    repostOfId: row.repost_of_id,
    imageUrl: row.image_url,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  });
}

export function mapRowToComment(row = {}) {
  return normalizeThoughtComment({
    id: row.id,
    thoughtId: row.thought_id,
    authorPlayerId: row.author_player_id,
    authorDisplayName: row.author_display_name,
    text: row.text,
    createdAt: row.created_at,
    editedAt: row.edited_at,
  });
}

export function buildThoughtParams(thought) {
  return [
    thought.id,
    thought.authorPlayerId,
    thought.authorDisplayName,
    thought.subject,
    thought.text,
    thought.visibility,
    thought.commentCount,
    thought.shareCount,
    JSON.stringify(thought.reactionTotals),
    thought.repostOfId,
    thought.imageUrl || "",
    thought.createdAt,
    thought.editedAt,
  ];
}

export function mapReactionTotalsByThoughtId(reactionRows = [], fallbackRows = []) {
  const totalsByThoughtId = new Map();

  for (const fallbackRow of fallbackRows) {
    if (!fallbackRow?.thought_id) continue;
    totalsByThoughtId.set(
      fallbackRow.thought_id,
      {
        ...ensureJsonObject(totalsByThoughtId.get(fallbackRow.thought_id)),
        ...normalizeThoughtPost({ reactionTotals: fallbackRow.reaction_totals }).reactionTotals,
      },
    );
  }

  for (const reactionRow of reactionRows) {
    const thoughtId = sanitizeThoughtId(reactionRow?.thought_id);
    const reactionId = sanitizeReactionId(reactionRow?.reaction_id);
    if (!thoughtId || !reactionId) continue;

    totalsByThoughtId.set(thoughtId, {
      ...ensureJsonObject(totalsByThoughtId.get(thoughtId)),
      [reactionId]: Math.max(0, Math.floor(Number(reactionRow?.reaction_count) || 0)),
    });
  }

  return totalsByThoughtId;
}

export function mapViewerReactionByThoughtId(rows = []) {
  const viewerReactionByThoughtId = new Map();

  for (const row of rows) {
    const thoughtId = sanitizeThoughtId(row?.thought_id);
    const reactionId = sanitizeReactionId(row?.reaction_id);
    if (!thoughtId) continue;
    viewerReactionByThoughtId.set(thoughtId, reactionId);
  }

  return viewerReactionByThoughtId;
}

export function mapViewerShareByOriginalThoughtId(rows = []) {
  const viewerShareByOriginalThoughtId = new Map();

  for (const row of rows) {
    const originalThoughtId = sanitizeThoughtId(row?.original_thought_id);
    const sharedThoughtId = sanitizeThoughtId(row?.shared_thought_id);
    if (!originalThoughtId || !sharedThoughtId) continue;
    viewerShareByOriginalThoughtId.set(originalThoughtId, sharedThoughtId);
  }

  return viewerShareByOriginalThoughtId;
}

function createSuffix(options = {}) {
  const now = typeof options.now === "function" ? options.now() : Date.now();
  const random = typeof options.random === "function" ? options.random() : Math.random();
  return `${Number(now).toString(36)}-${String(random.toString(36).slice(2, 8))}`;
}

export function createSharedThoughtId(originalThoughtId, viewerPlayerId, options = {}) {
  return sanitizeThoughtId(
    `thought-share-${sanitizeThoughtId(viewerPlayerId).slice(0, 24)}-${sanitizeThoughtId(originalThoughtId).slice(0, 24)}-${createSuffix(options)}`,
  );
}

export function createCommentId(thoughtId, viewerPlayerId, options = {}) {
  return sanitizeThoughtId(
    `comment-${sanitizeThoughtId(viewerPlayerId).slice(0, 24)}-${sanitizeThoughtId(thoughtId).slice(0, 24)}-${createSuffix(options)}`,
  );
}

export function deriveNextViewerReaction(existingReactionId, requestedReactionId) {
  const normalizedExistingReactionId = sanitizeReactionId(existingReactionId);
  const normalizedRequestedReactionId = sanitizeReactionId(requestedReactionId);
  return normalizedExistingReactionId === normalizedRequestedReactionId ? "" : normalizedRequestedReactionId;
}

export function buildReactedThought(thoughtRow, reactionTotals, viewerReaction) {
  return mapRowToThought({
    ...thoughtRow,
    reaction_totals: ensureJsonObject(reactionTotals),
  }, {
    reactionTotals: ensureJsonObject(reactionTotals),
    viewerReaction: sanitizeReactionId(viewerReaction),
  });
}

export function createSharedThought(originalThoughtRow = {}, viewerPlayerId = "", viewerAuthorDisplayName = "", options = {}) {
  const normalizedThoughtId = sanitizeThoughtId(originalThoughtRow.id);
  const normalizedViewerPlayerId = sanitizeViewerPlayerId(viewerPlayerId);
  const normalizedViewerDisplayName = sanitizeViewerAuthorDisplayName(viewerAuthorDisplayName);
  const caption = sanitizeCommentText(options.caption);
  const createdAt = typeof options.createdAt === "string" && options.createdAt.trim()
    ? options.createdAt.trim()
    : new Date().toISOString();

  return normalizeThoughtPost({
    id: sanitizeThoughtId(options.id) || createSharedThoughtId(normalizedThoughtId, normalizedViewerPlayerId, options),
    authorPlayerId: normalizedViewerPlayerId,
    authorDisplayName: normalizedViewerDisplayName || normalizedViewerPlayerId,
    subject: "",
    text: caption,
    visibility: originalThoughtRow.visibility,
    commentCount: 0,
    shareCount: 0,
    reactionTotals: {},
    repostOfId: normalizedThoughtId,
    imageUrl: "",
    createdAt,
    editedAt: "",
  });
}

export function buildShareResult(originalThoughtRow = {}, shareCount = 0, options = {}) {
  const viewerSharedThoughtId = sanitizeThoughtId(options.viewerSharedThoughtId);
  const sharedThought = options.sharedThought ? normalizeThoughtPost(options.sharedThought) : null;
  const removedSharedThoughtId = sanitizeThoughtId(options.removedSharedThoughtId);

  return {
    originalThought: normalizeThoughtPost({
      ...mapRowToThought({
        ...originalThoughtRow,
        share_count: shareCount,
      }, {
        viewerSharedThoughtId,
      }),
      viewerSharedThoughtId,
    }),
    sharedThought,
    removedSharedThoughtId,
  };
}

export function buildCommentRecord(thoughtId, viewerPlayerId, viewerAuthorDisplayName, text, options = {}) {
  const normalizedThoughtId = sanitizeThoughtId(thoughtId);
  const normalizedViewerPlayerId = sanitizeViewerPlayerId(viewerPlayerId);
  const normalizedViewerDisplayName = sanitizeViewerAuthorDisplayName(viewerAuthorDisplayName);
  const normalizedText = sanitizeCommentText(text);
  const createdAt = typeof options.createdAt === "string" && options.createdAt.trim()
    ? options.createdAt.trim()
    : new Date().toISOString();

  return normalizeThoughtComment({
    id: sanitizeThoughtId(options.id) || createCommentId(normalizedThoughtId, normalizedViewerPlayerId, options),
    thoughtId: normalizedThoughtId,
    authorPlayerId: normalizedViewerPlayerId,
    authorDisplayName: normalizedViewerDisplayName,
    text: normalizedText,
    createdAt,
    editedAt: "",
  });
}

export function buildCommentResult(thoughtRow = {}, commentCount = 0, comment = {}) {
  return {
    thought: mapRowToThought({
      ...thoughtRow,
      comment_count: Math.max(0, Number(commentCount) || 0),
    }),
    comment: mapRowToComment({
      id: comment.id,
      thought_id: comment.thoughtId,
      author_player_id: comment.authorPlayerId,
      author_display_name: comment.authorDisplayName,
      text: comment.text,
      created_at: comment.createdAt,
      edited_at: comment.editedAt,
    }),
  };
}
