import { escapeHtml, formatCommentDate } from "./social-view-shared.mjs";

export function buildShareReference(item) {
  if (item?.quotedThought) return item.quotedThought;

  return item
    ? {
        title: item.title,
        summary: item.summary,
        authorLabel: item.authorLabel,
        publishedLabel: item.publishedLabel,
      }
    : null;
}

export function renderQuotedThought(reference, mode = "card") {
  if (!reference) return "";

  const className = mode === "share-sheet"
    ? "thought-card__quoted-thought thought-card__quoted-thought--sheet"
    : "thought-card__quoted-thought";

  return `
    <div class="${className}">
      <p class="thought-card__quoted-kicker">Shared Post</p>
      <div class="thought-card__quoted-meta">
        <span class="thought-card__quoted-author">${escapeHtml(reference.authorLabel || "Arcade Pilot")}</span>
        <span class="thought-card__quoted-date">${escapeHtml(reference.publishedLabel || "Signal pending")}</span>
      </div>
      <p class="thought-card__quoted-title">${escapeHtml(reference.title || "Arcade Signal")}</p>
      <p class="thought-card__quoted-summary">${escapeHtml(reference.summary || "Shared arcade signal.")}</p>
    </div>
  `;
}

export function renderCommentSheet({
  item,
  commentPanelState = {},
  pageKey = "me",
} = {}) {
  if (item?.isPlaceholder || item?.id !== commentPanelState?.cardId) {
    return "";
  }

  const comments = Array.isArray(commentPanelState.comments) ? commentPanelState.comments : [];
  const reference = buildShareReference(item);

  return `
    <div class="thought-card__comment-sheet">
      <div class="thought-card__comment-header">
        <p class="thought-card__comment-kicker">Comments</p>
        <button class="thought-card__comment-dismiss" type="button" data-close-comment-sheet="${escapeHtml(item.id)}">Close</button>
      </div>
      ${renderQuotedThought(reference, "share-sheet")}
      <div class="thought-card__comment-thread">
        ${comments.length > 0
          ? comments.map((comment) => `
            <article class="thought-card__comment">
              <div class="thought-card__comment-meta">
                <span class="thought-card__comment-author">${escapeHtml(comment.authorDisplayName || "Arcade Pilot")}</span>
                <span class="thought-card__comment-date">${escapeHtml(formatCommentDate(comment.createdAt))}</span>
              </div>
              <p class="thought-card__comment-body">${escapeHtml(comment.text || "")}</p>
            </article>
          `).join("")
          : `<p class="thought-card__comment-empty">No comments yet. Start the thread.</p>`}
      </div>
      <form class="thought-card__comment-form" data-comment-form="${escapeHtml(item.commentTargetId || item.id)}" data-comment-card-id="${escapeHtml(item.id)}">
        <label class="thought-card__share-label" for="${pageKey}-comment-body-${escapeHtml(item.id)}">Write a comment</label>
        <textarea
          id="${pageKey}-comment-body-${escapeHtml(item.id)}"
          class="thought-card__share-input"
          rows="3"
          maxlength="500"
          placeholder="Write your reply."
          data-comment-input="${escapeHtml(item.id)}"
        >${escapeHtml(commentPanelState.text || "")}</textarea>
        <div class="thought-card__share-actions">
          <button class="thought-card__share-button thought-card__share-button--primary" type="submit">Post Comment</button>
          <button class="thought-card__share-button" type="button" data-close-comment-sheet="${escapeHtml(item.id)}">Cancel</button>
        </div>
      </form>
    </div>
  `;
}

export function renderThoughtItem({
  item,
  openReactionThoughtId = "",
  sharePanelState = {},
  commentPanelState = {},
  pageKey = "me",
} = {}) {
  if (item?.isPlaceholder) {
    return `<p class="thought-feed__empty">${escapeHtml(item.summary || "No posts yet.")}</p>`;
  }

  const actionItems = Array.isArray(item?.actionItems) && item.actionItems.length > 0
    ? item.actionItems
    : [
        { label: "Comments" },
        { label: "Share" },
        { label: "React" },
      ];
  const isReactionPickerOpen = item.id === openReactionThoughtId;
  const isShareSheetOpen = item.id === sharePanelState?.cardId;
  const isShareCaptionOpen = isShareSheetOpen && sharePanelState?.mode === "caption";
  const isCommentSheetOpen = item.id === commentPanelState?.cardId;
  const shareReference = buildShareReference(item);

  const actionsHtml = actionItems.map((action) => {
    if (action.id === "comment") {
      return `
        <button
          class="${isCommentSheetOpen ? "thought-card__action thought-card__action--active" : "thought-card__action"}"
          type="button"
          data-comment-thought-id="${escapeHtml(item.commentTargetId || item.id)}"
          data-comment-card-id="${escapeHtml(item.id)}"
        >${escapeHtml(action.label)}</button>
      `;
    }

    if (action.id === "share") {
      return `
        <button
          class="${action.isActive ? "thought-card__action thought-card__action--active" : "thought-card__action"}"
          type="button"
          data-share-thought-id="${escapeHtml(item.shareTargetId || item.id)}"
          data-share-card-id="${escapeHtml(item.id)}"
        >${escapeHtml(action.label)}</button>
      `;
    }

    if (action.id === "react") {
      return `
        <button
          class="${action.isActive || isReactionPickerOpen ? "thought-card__action thought-card__action--active" : "thought-card__action"}"
          type="button"
          data-toggle-thought-reactions="${escapeHtml(item.id)}"
          aria-expanded="${isReactionPickerOpen ? "true" : "false"}"
        >${escapeHtml(action.label)}</button>
      `;
    }

    return `<span class="thought-card__action">${escapeHtml(action.label)}</span>`;
  }).join("");

  const deleteHtml = item.canDelete
    ? `<button class="thought-card__delete" type="button" data-delete-id="${escapeHtml(item.id)}" aria-label="Delete thought">Delete</button>`
    : "";
  const reactionPickerHtml = `
    <div class="${isReactionPickerOpen ? "thought-card__reaction-picker" : "thought-card__reaction-picker thought-card__reaction-picker--hidden"}">
      ${item.reactionPickerItems.map((reaction) => `
        <button
          class="${reaction.isSelected ? "thought-card__reaction-chip thought-card__reaction-chip--selected" : "thought-card__reaction-chip"}"
          type="button"
          data-react-thought-id="${escapeHtml(item.id)}"
          data-thought-reaction-id="${escapeHtml(reaction.id)}"
          aria-pressed="${reaction.isSelected ? "true" : "false"}"
          title="${escapeHtml(reaction.label)}"
        >
          <span class="thought-card__reaction-glyph" aria-hidden="true">${escapeHtml(reaction.glyph || reaction.label)}</span>
          <span class="thought-card__reaction-count">${escapeHtml(String(reaction.count || 0))}</span>
        </button>
      `).join("")}
    </div>
  `;
  const shareSheetHtml = !isShareSheetOpen
    ? ""
    : `
      <div class="thought-card__share-sheet">
        ${item.actionItems.find((action) => action.id === "share")?.isActive
          ? `
            <div class="thought-card__share-actions">
              <button class="thought-card__share-button thought-card__share-button--danger" type="button" data-share-now-thought-id="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">Remove Share</button>
              <button class="thought-card__share-button" type="button" data-close-share-sheet="${escapeHtml(item.id)}">Done</button>
            </div>
          `
          : `
            <div class="thought-card__share-actions">
              <button class="thought-card__share-button thought-card__share-button--primary" type="button" data-share-now-thought-id="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">Share Now</button>
              <button class="thought-card__share-button" type="button" data-open-share-caption="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">Write Caption</button>
            </div>
          `}
        ${isShareCaptionOpen
          ? `
            <form class="thought-card__share-composer" data-share-caption-form="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">
              <label class="thought-card__share-label" for="${pageKey}-share-caption-${escapeHtml(item.id)}">Add your caption</label>
              <textarea
                id="${pageKey}-share-caption-${escapeHtml(item.id)}"
                class="thought-card__share-input"
                rows="4"
                maxlength="500"
                placeholder="Say something about this post."
                data-share-caption-input="${escapeHtml(item.id)}"
              >${escapeHtml(sharePanelState?.caption || "")}</textarea>
              <div class="thought-card__share-actions">
                <button class="thought-card__share-button thought-card__share-button--primary" type="submit">Share With Caption</button>
                <button class="thought-card__share-button" type="button" data-close-share-sheet="${escapeHtml(item.id)}">Cancel</button>
              </div>
              ${renderQuotedThought(shareReference, "share-sheet")}
            </form>
          `
          : ""}
      </div>
    `;
  const commentSheetHtml = renderCommentSheet({ item, commentPanelState, pageKey });
  const quotedThoughtHtml = item.quotedThought ? renderQuotedThought(item.quotedThought) : "";

  return `
    <article class="thought-card"${item.posterPlayerId ? ` data-poster-id="${escapeHtml(item.posterPlayerId)}"` : ""}>
      <div class="thought-card__signal-line">
        <span class="thought-card__author">${escapeHtml(item.authorLabel)}</span>
        <span class="thought-card__date">${escapeHtml(item.publishedLabel)}</span>
        ${deleteHtml}
      </div>
      <div class="thought-card__topline">
        <div class="thought-card__title-block">
          <span class="thought-card__topic-kicker">Topic</span>
          <h2 class="thought-card__title">${escapeHtml(item.title)}</h2>
        </div>
        <div class="thought-card__reactions">
          <span>${escapeHtml(item.reactionLabel)}</span>
          <span>${escapeHtml(item.commentLabel)}</span>
          <span>${escapeHtml(item.shareLabel)}</span>
        </div>
      </div>
      ${item.imageUrl ? `<img class="thought-card__image" src="${escapeHtml(item.imageUrl)}" alt="" loading="lazy">` : ""}
      <p class="thought-card__summary">${escapeHtml(item.summary)}</p>
      <div class="thought-card__actions">
        ${actionsHtml}
      </div>
      ${commentSheetHtml}
      ${shareSheetHtml}
      ${reactionPickerHtml}
      ${quotedThoughtHtml}
    </article>
  `;
}
