import {
  THOUGHT_REACTION_IDS,
  THOUGHT_REACTION_ID_SET,
  THOUGHT_REACTION_LABELS,
  THOUGHT_REACTION_GLYPHS,
  THOUGHT_VISIBILITIES,
} from "./thoughts-schema.mjs";

export function sanitizeSingleLine(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizeTextBlock(value, maxLength = Number.POSITIVE_INFINITY) {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

export function sanitizeCount(value) {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

export function sanitizeReactionTotals(value) {
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

export function sanitizeThoughtReactionId(value) {
  const normalized = sanitizeSingleLine(value, 24).toLowerCase();
  return THOUGHT_REACTION_ID_SET.has(normalized) ? normalized : "";
}

export function sanitizeThoughtShareId(value) {
  return sanitizeSingleLine(value, 80);
}

export function sanitizeThoughtCommentId(value) {
  return sanitizeSingleLine(value, 80);
}

export function normalizeThoughtShareActor(actor = {}) {
  if (!actor || typeof actor !== "object") {
    return { playerId: "", authorDisplayName: "" };
  }

  return {
    playerId: sanitizeSingleLine(actor.playerId, 80),
    authorDisplayName: sanitizeSingleLine(actor.profileName || actor.authorDisplayName, 60),
  };
}

export function createFallbackThoughtId() {
  return `thought-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createFallbackCommentId() {
  return `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function countThoughtReactions(reactionTotals = {}) {
  return Object.values(reactionTotals).reduce((total, count) => total + sanitizeCount(count), 0);
}

export function buildThoughtReactionPickerItems(reactionTotals = {}, viewerReaction = "") {
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
    createdAt: sanitizeSingleLine(post?.createdAt, 40),
    editedAt: sanitizeSingleLine(post?.editedAt, 40),
  };
}

export function normalizeThoughtComment(comment = {}, index = 0) {
  return {
    id: sanitizeThoughtCommentId(comment?.id) || `comment-${index + 1}`,
    thoughtId: sanitizeThoughtShareId(comment?.thoughtId),
    authorPlayerId: sanitizeSingleLine(comment?.authorPlayerId, 80),
    authorDisplayName: sanitizeSingleLine(comment?.authorDisplayName, 60) || "Arcade Pilot",
    text: sanitizeTextBlock(comment?.text, 500),
    createdAt: sanitizeSingleLine(comment?.createdAt, 40),
    editedAt: sanitizeSingleLine(comment?.editedAt, 40),
  };
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
