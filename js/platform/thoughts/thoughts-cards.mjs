import {
  sanitizeSingleLine,
  sanitizeTextBlock,
  normalizeThoughtPost,
  countThoughtReactions,
  buildThoughtReactionPickerItems,
  formatThoughtDate,
  formatThoughtCommentLabel,
  formatThoughtReactionLabel,
  formatThoughtShareLabel,
} from "./thoughts-normalize.mjs";

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
        imageUrl: normalized.imageUrl || "",
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
          { id: "react", label: normalized.viewerReaction ? "Reacted" : "React", isActive: !!normalized.viewerReaction },
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
