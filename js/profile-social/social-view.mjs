export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function escapeCssUrl(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

// Shared feed/gallery renderer used by both /me and /player profile surfaces.
export function createProfileSocialViewRenderer({
  pageKey = "me",
  panelPrefix = pageKey,
  thoughtsFeedClass = `${pageKey}-thoughts-feed`,
  ownerGalleryEmptyText = "No photos yet.",
  viewerGalleryEmptyText = "No photos yet.",
} = {}) {
  function buildShareReference(item) {
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

  function renderQuotedThought(reference, mode = "card") {
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

  function formatCommentDate(value) {
    const timestamp = Date.parse(value || "");
    if (!timestamp) return "Signal pending";
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(timestamp));
  }

  function renderCommentSheet(item, commentPanelState = {}) {
    if (item.isPlaceholder || item.id !== commentPanelState?.cardId) {
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

  function renderThoughtItem(item, openReactionThoughtId = "", sharePanelState = {}, commentPanelState = {}) {
    if (item.isPlaceholder) {
      return `<p class="thought-feed__empty">${escapeHtml(item.summary || "No posts yet.")}</p>`;
    }

    const actionItems = Array.isArray(item.actionItems) && item.actionItems.length > 0
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
    const commentSheetHtml = renderCommentSheet(item, commentPanelState);
    const quotedThoughtHtml = item.quotedThought ? renderQuotedThought(item.quotedThought) : "";

    return `
      <article class="thought-card">
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

  function renderGalleryPanel(container, title, photos = [], options = {}) {
    if (!container) return;

    const isOwner = !!options?.isOwner;
    const previewCap = options?.previewCap ? Number(options.previewCap) : 0;
    const viewAllHref = options?.viewAllHref || "";
    const previewLinkHref = options?.previewLinkHref || "";
    const isPreview = previewCap > 0;
    const visiblePhotos = isPreview ? photos.slice(0, previewCap) : photos;
    const uploadState = options?.uploadState || {};
    const isUploading = !!uploadState.isUploading;
    const uploadLabel = isUploading
      ? "Upload In Progress"
      : (uploadState.previewUrl ? "Choose Different Photo" : "Upload Photo");
    const submitLabel = isUploading ? "Uploading..." : "Save Photo";
    const uploadHtml = isOwner && !isPreview
      ? `
        <div class="gallery-upload">
          <input id="${pageKey}GalleryFileInput" type="file" accept="image/jpeg,image/png,image/webp" class="gallery-upload__input" aria-label="Upload a photo"${isUploading ? " disabled" : ""}>
          <label for="${pageKey}GalleryFileInput" class="gallery-upload__label"${isUploading ? ' aria-disabled="true"' : ""}>${uploadLabel}</label>
          <p id="${pageKey}GalleryUploadStatus" class="gallery-upload__status" aria-live="polite">${escapeHtml(uploadState.statusMessage || "")}</p>
        </div>
        ${uploadState.previewUrl
          ? `
            <form id="${pageKey}GalleryUploadForm" class="gallery-upload__composer">
              <div class="gallery-upload__preview">
                <img class="gallery-upload__preview-img" src="${escapeHtml(uploadState.previewUrl)}" alt="${escapeHtml(uploadState.fileName || "Selected photo preview")}">
                <p class="gallery-upload__preview-name">${escapeHtml(uploadState.fileName || "Selected photo")}</p>
              </div>
              <div class="gallery-upload__fields">
                <label class="gallery-upload__field" for="${pageKey}GalleryCaption">
                  <span class="gallery-upload__field-label">Caption</span>
                  <textarea
                    id="${pageKey}GalleryCaption"
                    class="gallery-upload__textarea"
                    rows="3"
                    maxlength="500"
                    placeholder="Add a caption for your gallery photo."
                    ${isUploading ? "disabled" : ""}
                  >${escapeHtml(uploadState.caption || "")}</textarea>
                </label>
                <label class="gallery-upload__field" for="${pageKey}GalleryVisibility">
                  <span class="gallery-upload__field-label">Visibility</span>
                  <select id="${pageKey}GalleryVisibility" class="gallery-upload__select"${isUploading ? " disabled" : ""}>
                    <option value="public"${uploadState.visibility === "public" ? " selected" : ""}>Public</option>
                    <option value="friends"${uploadState.visibility === "friends" ? " selected" : ""}>Friends</option>
                    <option value="private"${uploadState.visibility === "private" ? " selected" : ""}>Private</option>
                  </select>
                </label>
                <label class="gallery-upload__toggle" for="${pageKey}GalleryPostToFeed">
                  <input id="${pageKey}GalleryPostToFeed" type="checkbox"${uploadState.postToFeed ? " checked" : ""}${isUploading ? " disabled" : ""}>
                  <span class="gallery-upload__toggle-copy">Also post this photo to my feed</span>
                </label>
              </div>
              <div class="gallery-upload__actions">
                <button class="gallery-upload__button gallery-upload__button--primary" type="submit"${isUploading ? " disabled" : ""}>${submitLabel}</button>
                <button class="gallery-upload__button" type="button" data-cancel-gallery-upload="${pageKey}"${isUploading ? " disabled" : ""}>Cancel</button>
              </div>
            </form>
          `
          : ""}
      `
      : "";

    const emptyText = isOwner ? ownerGalleryEmptyText : viewerGalleryEmptyText;
    const gridHtml = visiblePhotos.length > 0
      ? visiblePhotos.map((photo) => {
          const useLink = isPreview && previewLinkHref;
          const tag = useLink ? "a" : "div";
          const hrefAttr = useLink
            ? ` href="${escapeHtml(previewLinkHref + "&photo=" + encodeURIComponent(photo.id))}"`
            : "";
          return `
            <${tag} class="gallery-item"${hrefAttr} data-photo-id="${escapeHtml(photo.id)}">
              <img class="gallery-item__img" src="${escapeHtml(photo.imageUrl)}" alt="${escapeHtml(photo.caption || "")}" loading="lazy">
              ${photo.caption ? `<p class="gallery-item__caption">${escapeHtml(photo.caption)}</p>` : ""}
              ${isOwner && !isPreview ? `<button class="gallery-item__delete" type="button" data-delete-photo-id="${escapeHtml(photo.id)}" aria-label="Delete photo">Remove</button>` : ""}
            </${tag}>
          `;
        }).join("")
      : `<p class="${panelPrefix}-panel__empty">${escapeHtml(emptyText)}</p>`;

    const viewAllHtml = viewAllHref
      ? `<a class="gallery-view-all" href="${escapeHtml(viewAllHref)}">View All Photos &rarr;</a>`
      : "";

    container.innerHTML = `
      <div class="${panelPrefix}-panel__header"><h2 class="${panelPrefix}-panel__title">${escapeHtml(title)}</h2></div>
      ${uploadHtml}
      <div class="gallery-grid">${gridHtml}</div>
      ${viewAllHtml}
    `;
  }

  function renderThoughtsPanel(container, title, items, composer = null, options = {}) {
    if (!container) return;

    const composerState = options?.composerState || {};
    const composerHtml = composer?.enabled
      ? `
        <form id="${pageKey}ThoughtComposer" class="thought-composer thought-composer--owner">
          <input
            id="${pageKey}ThoughtSubject"
            class="thought-composer__subject"
            name="subject"
            type="text"
            maxlength="80"
            placeholder="${escapeHtml(composer.subjectPlaceholder || "Optional headline")}"
            value="${escapeHtml(composerState.subject || "")}"
          >
          <textarea
            id="${pageKey}ThoughtBody"
            class="thought-composer__body"
            name="text"
            rows="4"
            maxlength="500"
            placeholder="${escapeHtml(composer.textPlaceholder || "Share a thought.")}"
          >${escapeHtml(composerState.text || "")}</textarea>
          ${composerState.previewUrl
            ? `
              <div class="thought-composer__photo-card">
                <div class="thought-composer__photo-preview">
                  <img
                    class="thought-composer__photo-preview-img"
                    src="${escapeHtml(composerState.previewUrl)}"
                    alt="${escapeHtml(composerState.fileName || "Selected photo preview")}"
                  >
                  <div class="thought-composer__photo-preview-copy">
                    <p class="thought-composer__photo-name">${escapeHtml(composerState.fileName || "Selected photo")}</p>
                    <button class="thought-composer__photo-clear" type="button" data-clear-thought-photo="${pageKey}">Remove Photo</button>
                  </div>
                </div>
                <div class="thought-composer__photo-fields">
                  <label class="thought-composer__field" for="${pageKey}ThoughtPhotoCaption">
                    <span class="thought-composer__field-label">Gallery Caption</span>
                    <textarea
                      id="${pageKey}ThoughtPhotoCaption"
                      class="thought-composer__field-input thought-composer__field-input--textarea"
                      rows="3"
                      maxlength="500"
                      placeholder="Optional gallery caption if you save this photo to your profile."
                    >${escapeHtml(composerState.caption || "")}</textarea>
                  </label>
                  <label class="thought-composer__field" for="${pageKey}ThoughtVisibility">
                    <span class="thought-composer__field-label">Visibility</span>
                    <select id="${pageKey}ThoughtVisibility" class="thought-composer__field-input">
                      <option value="public"${composerState.visibility === "public" ? " selected" : ""}>Public</option>
                      <option value="friends"${composerState.visibility === "friends" ? " selected" : ""}>Friends</option>
                      <option value="private"${composerState.visibility === "private" ? " selected" : ""}>Private</option>
                    </select>
                  </label>
                  <label class="thought-composer__toggle" for="${pageKey}ThoughtSaveToGallery">
                    <input id="${pageKey}ThoughtSaveToGallery" type="checkbox"${composerState.saveToGallery !== false ? " checked" : ""}>
                    <span class="thought-composer__toggle-copy">Also save this photo to my gallery</span>
                  </label>
                </div>
              </div>
            `
            : ""}
          <div class="thought-composer__actions">
            <button class="thought-composer__submit" type="submit">${escapeHtml(composer.submitLabel || "Post Thought")}</button>
            <label class="thought-composer__attach-label" for="${pageKey}ThoughtPhotoInput" title="Attach photo">
              <span class="thought-composer__attach-icon" aria-hidden="true">&#128247;</span>
              <span id="${pageKey}ThoughtPhotoName" class="thought-composer__attach-name">${escapeHtml(composerState.fileName || "")}</span>
            </label>
            <input id="${pageKey}ThoughtPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" class="thought-composer__photo-input">
            <p id="${pageKey}ThoughtComposerFlash" class="thought-composer__flash" aria-live="polite">${escapeHtml(composer.flashMessage || "")}</p>
          </div>
        </form>
      `
      : "";

    container.innerHTML = `
      <div class="${panelPrefix}-panel__header"><h2 class="${panelPrefix}-panel__title">${escapeHtml(title)}</h2></div>
      ${composerHtml}
      <div class="${thoughtsFeedClass} thoughts-feed">
        ${items.map((item) => renderThoughtItem(
          item,
          options?.openReactionThoughtId || "",
          options?.sharePanelState || {},
          options?.commentPanelState || {},
        )).join("")}
      </div>
    `;
  }

  return {
    renderGalleryPanel,
    renderThoughtsPanel,
  };
}
