import {
  normalizeTimestampField,
  sanitizeCount,
  sanitizeSingleLine,
  sanitizeTextBlock,
} from "./normalize-shared.mjs";

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
