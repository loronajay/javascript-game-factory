import {
  THOUGHT_REACTION_IDS,
  THOUGHT_REACTION_ID_SET,
  THOUGHT_REACTION_LABELS,
  THOUGHT_REACTION_GLYPHS,
  THOUGHT_VISIBILITIES,
} from "./thoughts-schema.mjs";
import type { ThoughtReactionId, ThoughtVisibility } from "./thoughts-schema.mjs";

export type ViewerReaction = ThoughtReactionId | "";

export interface ThoughtPost {
  id: string;
  authorPlayerId: string;
  authorDisplayName: string;
  subject: string;
  text: string;
  visibility: ThoughtVisibility;
  commentCount: number;
  shareCount: number;
  reactionTotals: Record<string, number>;
  viewerReaction: ViewerReaction;
  viewerSharedThoughtId: string;
  repostOfId: string;
  imageUrl: string;
  createdAt: string;
  editedAt: string;
}

export interface NormalizedThoughtComment {
  id: string;
  thoughtId: string;
  authorPlayerId: string;
  authorDisplayName: string;
  text: string;
  createdAt: string;
  editedAt: string;
}

export interface ThoughtShareActor {
  playerId: string;
  authorDisplayName: string;
}

export interface ThoughtReactionPickerItem {
  id: ThoughtReactionId;
  label: string;
  glyph: string;
  count: number;
  isSelected: boolean;
}

export function sanitizeSingleLine(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizeTextBlock(value: unknown, maxLength = Number.POSITIVE_INFINITY): string {
  if (typeof value !== "string") return "";
  return value.replace(/\r\n?/g, "\n").trim().slice(0, maxLength);
}

export function sanitizeCount(value: unknown): number {
  const number = Math.floor(Number(value) || 0);
  return Math.max(0, number);
}

export function sanitizeReactionTotals(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};

  return Object.entries(value).reduce((totals: Record<string, number>, [key, count]) => {
    const normalizedKey = sanitizeSingleLine(key, 24).toLowerCase();
    if (!THOUGHT_REACTION_ID_SET.has(normalizedKey as ThoughtReactionId)) return totals;

    const normalizedCount = sanitizeCount(count);
    if (normalizedCount <= 0) return totals;
    totals[normalizedKey] = normalizedCount;
    return totals;
  }, {});
}

export function sanitizeThoughtReactionId(value: unknown): ViewerReaction {
  const normalized = sanitizeSingleLine(value, 24).toLowerCase();
  return THOUGHT_REACTION_ID_SET.has(normalized as ThoughtReactionId) ? (normalized as ThoughtReactionId) : "";
}

export function sanitizeThoughtShareId(value: unknown): string {
  return sanitizeSingleLine(value, 80);
}

export function sanitizeThoughtCommentId(value: unknown): string {
  return sanitizeSingleLine(value, 80);
}

export function normalizeThoughtShareActor(rawActor: unknown = {}): ThoughtShareActor {
  const actor = rawActor as Record<string, unknown> | null | undefined;
  if (!actor || typeof actor !== "object") {
    return { playerId: "", authorDisplayName: "" };
  }

  return {
    playerId: sanitizeSingleLine(actor.playerId, 80),
    authorDisplayName: sanitizeSingleLine(actor.profileName || actor.authorDisplayName, 60),
  };
}

export function createFallbackThoughtId(): string {
  return `thought-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createFallbackCommentId(): string {
  return `comment-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function countThoughtReactions(reactionTotals: Record<string, unknown> = {}): number {
  return Object.values(reactionTotals).reduce<number>((total, count) => total + sanitizeCount(count), 0);
}

export function buildThoughtReactionPickerItems(
  reactionTotals: unknown = {},
  viewerReaction: unknown = "",
): ThoughtReactionPickerItem[] {
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

export function normalizeThoughtPost(rawPost: unknown = {}, index = 0): ThoughtPost {
  const post = rawPost as Record<string, any> | null | undefined;
  const id = sanitizeSingleLine(post?.id, 80) || `thought-${index + 1}`;
  const visibility = sanitizeSingleLine(post?.visibility, 24).toLowerCase();

  return {
    id,
    authorPlayerId: sanitizeSingleLine(post?.authorPlayerId, 80),
    authorDisplayName: sanitizeSingleLine(post?.authorDisplayName, 60) || "Arcade Pilot",
    subject: sanitizeSingleLine(post?.subject, 80),
    text: sanitizeTextBlock(post?.text, 500),
    visibility: THOUGHT_VISIBILITIES.has(visibility as ThoughtVisibility) ? (visibility as ThoughtVisibility) : "public",
    commentCount: sanitizeCount(post?.commentCount),
    shareCount: sanitizeCount(post?.shareCount),
    reactionTotals: sanitizeReactionTotals(post?.reactionTotals),
    viewerReaction: sanitizeThoughtReactionId(post?.viewerReaction),
    viewerSharedThoughtId: sanitizeThoughtShareId(post?.viewerSharedThoughtId),
    repostOfId: sanitizeSingleLine(post?.repostOfId, 80),
    imageUrl: sanitizeSingleLine(post?.imageUrl, 800),
    createdAt: sanitizeSingleLine(post?.createdAt, 40),
    editedAt: sanitizeSingleLine(post?.editedAt, 40),
  };
}

export function normalizeThoughtComment(rawComment: unknown = {}, index = 0): NormalizedThoughtComment {
  const comment = rawComment as Record<string, any> | null | undefined;
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

export function formatThoughtDate(value: unknown): string {
  const timestamp = Date.parse((value || "") as string);
  if (!timestamp) return "Signal pending";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function formatThoughtCommentLabel(count: number): string {
  return `${count} comment${count === 1 ? "" : "s"}`;
}

export function formatThoughtReactionLabel(count: number): string {
  return `${count} reaction${count === 1 ? "" : "s"}`;
}

export function formatThoughtShareLabel(count: number): string {
  return `${count} share${count === 1 ? "" : "s"}`;
}
