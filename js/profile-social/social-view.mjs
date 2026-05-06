import { renderThoughtItem } from "./social-view-thoughts.mjs";
import { escapeCssUrl, escapeHtml } from "./social-view-shared.mjs";

export { escapeCssUrl, escapeHtml };

function buildGalleryItemCounts(photo) {
  const totals = photo?.reactionTotals;
  const reactionCount = totals && typeof totals === "object"
    ? Object.values(totals).reduce((sum, n) => sum + (Math.floor(Number(n)) || 0), 0)
    : 0;
  const commentCount = Math.max(0, Math.floor(Number(photo?.commentCount)) || 0);
  if (reactionCount === 0 && commentCount === 0) return "";
  const reactionBadge = reactionCount > 0 ? `<span class="gallery-item__count">❤️ ${reactionCount}</span>` : "";
  const commentBadge = commentCount > 0 ? `<span class="gallery-item__count">💬 ${commentCount}</span>` : "";
  return `<div class="gallery-item__counts">${reactionBadge}${commentBadge}</div>`;
}

// Shared feed/gallery renderer used by both /me and /player profile surfaces.
export function createProfileSocialViewRenderer({
  pageKey = "me",
  panelPrefix = pageKey,
  thoughtsFeedClass = `${pageKey}-thoughts-feed`,
  ownerGalleryEmptyText = "No photos yet.",
  viewerGalleryEmptyText = "No photos yet.",
} = {}) {
  function renderGalleryPanel(container, title, photos = [], options = {}) {
    if (!container) return;

    const isOwner = !!options?.isOwner;
    const previewCap = options?.previewCap ? Number(options.previewCap) : 0;
    const viewAllHref = options?.viewAllHref || "";
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
      ? visiblePhotos.map((photo) => `
          <div class="gallery-item" data-photo-id="${escapeHtml(photo.id)}">
            <div class="gallery-item__img-frame">
              <img class="gallery-item__img" src="${escapeHtml(photo.imageUrl)}" alt="${escapeHtml(photo.caption || "")}" loading="lazy">
              ${buildGalleryItemCounts(photo)}
            </div>
            ${photo.caption ? `<p class="gallery-item__caption">${escapeHtml(photo.caption)}</p>` : ""}
            ${isOwner && !isPreview ? `<button class="gallery-item__delete" type="button" data-delete-photo-id="${escapeHtml(photo.id)}" aria-label="Delete photo">Remove</button>` : ""}
          </div>
        `).join("")
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
        ${items.map((item) => renderThoughtItem({
          item,
          openReactionThoughtId: options?.openReactionThoughtId || "",
          sharePanelState: options?.sharePanelState || {},
          commentPanelState: options?.commentPanelState || {},
          pageKey,
        })).join("")}
      </div>
    `;
  }

  return {
    renderGalleryPanel,
    renderThoughtsPanel,
  };
}
