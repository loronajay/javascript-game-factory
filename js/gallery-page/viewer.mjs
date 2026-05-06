import {
  buildCommentListHtml,
  buildReactionChipsHtml,
} from "./viewer-social.mjs";
import { createPageGalleryViewerActions } from "./viewer-page-actions.mjs";
import { createPageGalleryViewerClickHandler } from "./viewer-page-controller.mjs";
import { createPhotoViewerState } from "./viewer-state.mjs";

const PHOTO_REACTION_IDS = ["like", "love", "laugh", "wow", "fire", "sad", "angry", "poop"];
const PHOTO_REACTION_GLYPHS = {
  like: "👍", love: "❤️", laugh: "😂", wow: "😮",
  fire: "🔥", sad: "😢", angry: "😡", poop: "💩",
};

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatViewerDate(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch {
    return "";
  }
}

function buildReactionPickerHtml() {
  return PHOTO_REACTION_IDS.map(id =>
    `<button class="photo-viewer__reaction-option" type="button" data-reaction-id="${id}" title="${id}">${PHOTO_REACTION_GLYPHS[id]}</button>`
  ).join("");
}

export function createPhotoViewer({ doc = globalThis.document, lightweight = false } = {}) {
  let onDeleteFn = null;
  let onReactFn = null;
  let onCommentFn = null;
  const viewerState = createPhotoViewerState();

  const overlay = doc.createElement("div");
  overlay.className = "photo-viewer photo-viewer--hidden";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-label", "Photo viewer");
  overlay.setAttribute("aria-hidden", "true");
  overlay.innerHTML = `
    <div class="photo-viewer__backdrop"></div>
    <div class="photo-viewer__dialog">
      <button class="photo-viewer__close" type="button" aria-label="Close photo viewer">&times;</button>
      <div class="photo-viewer__viewer-row">
        ${!lightweight ? `<button class="photo-viewer__nav photo-viewer__nav--prev" type="button" aria-label="Previous photo">&#8592;</button>` : ""}
        <div class="photo-viewer__image-wrap">
          <img class="photo-viewer__img" src="" alt="">
        </div>
        ${!lightweight ? `<button class="photo-viewer__nav photo-viewer__nav--next" type="button" aria-label="Next photo">&#8594;</button>` : ""}
      </div>
      <div class="photo-viewer__meta">
        <p class="photo-viewer__caption"></p>
        <p class="photo-viewer__timestamp"></p>
        <div class="photo-viewer__actions">
          ${lightweight
            ? `<a class="photo-viewer__gallery-link" href="#" target="_self">View Gallery &rarr;</a>`
            : `<button class="photo-viewer__delete" type="button">Remove Photo</button>`
          }
        </div>
      </div>
      ${!lightweight ? `
      <div class="photo-viewer__social">
        <div class="photo-viewer__reactions-row">
          <div class="photo-viewer__reaction-chips"></div>
          <button class="photo-viewer__react-btn" type="button" aria-label="React to photo">React</button>
          <div class="photo-viewer__reaction-picker photo-viewer__reaction-picker--hidden" aria-label="Choose a reaction">
            ${buildReactionPickerHtml()}
          </div>
        </div>
        <div class="photo-viewer__comments-section">
          <div class="photo-viewer__comment-list"></div>
          <form class="photo-viewer__comment-form" autocomplete="off">
            <textarea class="photo-viewer__comment-input" maxlength="500" placeholder="Add a comment..." rows="2"></textarea>
            <div class="photo-viewer__comment-form-row">
              <button class="photo-viewer__comment-submit" type="submit">Post</button>
            </div>
          </form>
        </div>
      </div>
      ` : ""}
    </div>
  `;
  doc.body.appendChild(overlay);

  const imgEl = overlay.querySelector(".photo-viewer__img");
  const captionEl = overlay.querySelector(".photo-viewer__caption");
  const timestampEl = overlay.querySelector(".photo-viewer__timestamp");
  const deleteBtn = overlay.querySelector(".photo-viewer__delete");
  const galleryLinkEl = overlay.querySelector(".photo-viewer__gallery-link");
  const prevBtn = overlay.querySelector(".photo-viewer__nav--prev");
  const nextBtn = overlay.querySelector(".photo-viewer__nav--next");
  const reactionChipsEl = !lightweight ? overlay.querySelector(".photo-viewer__reaction-chips") : null;
  const reactionPickerEl = !lightweight ? overlay.querySelector(".photo-viewer__reaction-picker") : null;
  const reactBtnEl = !lightweight ? overlay.querySelector(".photo-viewer__react-btn") : null;
  const commentListEl = !lightweight ? overlay.querySelector(".photo-viewer__comment-list") : null;
  const commentFormEl = !lightweight ? overlay.querySelector(".photo-viewer__comment-form") : null;
  const commentInputEl = !lightweight ? overlay.querySelector(".photo-viewer__comment-input") : null;

  function updateUrl(photoId) {
    if (lightweight || !globalThis.history?.replaceState) return;
    const url = new URL(globalThis.location.href);
    if (photoId) {
      url.searchParams.set("photo", photoId);
    } else {
      url.searchParams.delete("photo");
    }
    globalThis.history.replaceState(null, "", url.toString());
  }

  function paintSocial() {
    if (lightweight) return;
    const photo = viewerState.getCurrentPhoto();
    if (!photo) return;

    const state = viewerState.getCurrentSocialState();
    const { viewerPlayerId } = viewerState.getViewState();

    if (reactionChipsEl) {
      reactionChipsEl.innerHTML = buildReactionChipsHtml(state);
    }

    if (commentListEl) {
      const comments = state?.comments;
      commentListEl.innerHTML = buildCommentListHtml(comments);
      if (Array.isArray(comments) && comments.length > 0) {
        commentListEl.scrollTop = commentListEl.scrollHeight;
      }
    }

    if (commentFormEl) {
      commentFormEl.style.display = viewerPlayerId ? "" : "none";
    }
  }

  function setReactionPickerOpen(open) {
    viewerState.setReactionPickerOpen(open);
    if (!reactionPickerEl) return;
    if (open) {
      reactionPickerEl.classList.remove("photo-viewer__reaction-picker--hidden");
    } else {
      reactionPickerEl.classList.add("photo-viewer__reaction-picker--hidden");
    }
  }

  function paint() {
    const photo = viewerState.getCurrentPhoto();
    if (!photo) return;
    const { galleryLinkHref, isOwner } = viewerState.getViewState();
    imgEl.src = photo.imageUrl || "";
    imgEl.alt = photo.caption || "";
    captionEl.textContent = photo.caption || "";
    timestampEl.textContent = formatViewerDate(photo.createdAt || photo.created_at);

    if (lightweight) {
      if (galleryLinkEl) galleryLinkEl.href = galleryLinkHref || "#";
    } else {
      if (deleteBtn) {
        deleteBtn.dataset.photoId = photo.id;
        deleteBtn.style.display = isOwner ? "" : "none";
      }
      if (prevBtn && nextBtn) {
        const hasSiblings = viewerState.getViewState().photos.length > 1;
        prevBtn.disabled = !viewerState.canGoPrev();
        nextBtn.disabled = !viewerState.canGoNext();
        prevBtn.style.visibility = hasSiblings ? "" : "hidden";
        nextBtn.style.visibility = hasSiblings ? "" : "hidden";
      }
      setReactionPickerOpen(false);
      paintSocial();
    }
  }

  function show() {
    overlay.classList.remove("photo-viewer--hidden");
    overlay.removeAttribute("aria-hidden");
    doc.body.style.overflow = "hidden";
  }

  function hide() {
    overlay.classList.add("photo-viewer--hidden");
    overlay.setAttribute("aria-hidden", "true");
    doc.body.style.overflow = "";
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay || e.target.closest(".photo-viewer__backdrop")) {
      api.close();
      return;
    }
    if (e.target.closest(".photo-viewer__close")) {
      api.close();
      return;
    }
    if (lightweight) {
      if (e.target.closest(".photo-viewer__gallery-link")) {
        api.close();
      }
      return;
    }
    if (e.target.closest(".photo-viewer__nav--prev")) {
      if (viewerState.goPrev()) {
        paint();
        updateUrl(viewerState.getCurrentPhoto()?.id);
      }
      return;
    }
    if (e.target.closest(".photo-viewer__nav--next")) {
      if (viewerState.goNext()) {
        paint();
        updateUrl(viewerState.getCurrentPhoto()?.id);
      }
      return;
    }
    if (e.target.closest(".photo-viewer__delete")) {
      const photoId = e.target.closest(".photo-viewer__delete").dataset.photoId;
      if (photoId && onDeleteFn) onDeleteFn(photoId);
      return;
    }
    if (e.target.closest(".photo-viewer__react-btn")) {
      setReactionPickerOpen(viewerState.toggleReactionPicker());
      return;
    }
    const reactionOptionBtn = e.target.closest(".photo-viewer__reaction-option");
    if (reactionOptionBtn) {
      const reactionId = reactionOptionBtn.dataset.reactionId;
      const photo = viewerState.getCurrentPhoto();
      if (reactionId && photo && onReactFn) {
        setReactionPickerOpen(false);
        onReactFn(photo.id, reactionId);
      }
      return;
    }
    const reactionChipBtn = e.target.closest(".photo-viewer__reaction-chip");
    if (reactionChipBtn) {
      const reactionId = reactionChipBtn.dataset.reactionId;
      const photo = viewerState.getCurrentPhoto();
      if (reactionId && photo && onReactFn) {
        onReactFn(photo.id, reactionId);
      }
    }
  });

  overlay.addEventListener("submit", (e) => {
    const form = e.target.closest(".photo-viewer__comment-form");
    if (!form) return;
    e.preventDefault();
    const text = commentInputEl?.value?.trim() || "";
    const photo = viewerState.getCurrentPhoto();
    if (text && photo && onCommentFn) {
      onCommentFn(photo.id, text);
      if (commentInputEl) commentInputEl.value = "";
    }
  });

  doc.addEventListener("keydown", (e) => {
    if (overlay.classList.contains("photo-viewer--hidden")) return;
    if (e.key === "Escape") {
      if (viewerState.getViewState().reactionPickerOpen) {
        setReactionPickerOpen(false);
        return;
      }
      api.close();
    } else if (!lightweight) {
      if (e.key === "ArrowLeft" && viewerState.goPrev()) {
        paint();
        updateUrl(viewerState.getCurrentPhoto()?.id);
      } else if (e.key === "ArrowRight" && viewerState.goNext()) {
        paint();
        updateUrl(viewerState.getCurrentPhoto()?.id);
      }
    }
  });

  const api = {
    setPhotos(newPhotos, opts = {}) {
      viewerState.setPhotos(newPhotos, opts);
      onDeleteFn = opts.onDelete || null;
      onReactFn = opts.onReact || null;
      onCommentFn = opts.onComment || null;
      if (api.isOpen() && viewerState.getCurrentPhoto()) paint();
    },
    setSocialState(photoId, state) {
      viewerState.setSocialState(photoId, state);
      const currentPhoto = viewerState.getCurrentPhoto();
      if (api.isOpen() && currentPhoto?.id === photoId) paintSocial();
    },
    open(photoId) {
      if (!viewerState.open(photoId)) return;
      paint();
      show();
      updateUrl(viewerState.getCurrentPhoto()?.id);
    },
    close() {
      hide();
      updateUrl(null);
      viewerState.close();
      setReactionPickerOpen(false);
    },
    isOpen() {
      return !overlay.classList.contains("photo-viewer--hidden");
    },
  };
  return api;
}

export function initPageGalleryViewer({ doc = globalThis.document, galleryPageHref = "../gallery/index.html", apiClient = null } = {}) {
  const hasApi = !!apiClient;

  // Full viewer for gallery panel photos; lightweight viewer for thought card images or when no API
  const fullViewer = createPhotoViewer({ doc, lightweight: !hasApi });
  const thoughtViewer = hasApi ? createPhotoViewer({ doc, lightweight: true }) : fullViewer;
  const viewerActions = hasApi
    ? createPageGalleryViewerActions({ apiClient, fullViewer })
    : null;
  const handlePageClick = createPageGalleryViewerClickHandler({
    fullViewer,
    thoughtViewer,
    viewerActions,
    galleryPageHref,
    hasApi,
  });

  doc.addEventListener("click", (e) => {
    void handlePageClick(e);
    return;

    // Gallery panel thumbnail click (profile pages)
    const galleryItem = e.target.closest("[data-photo-id]");
    if (galleryItem) {
      const img = galleryItem.querySelector(".gallery-item__img");
      if (!img) return;

      const photo = {
        id: galleryItem.dataset.photoId,
        imageUrl: img.src,
        caption: img.alt || "",
      };

      const panel = galleryItem.closest(".gallery-panel, [id$='GalleryPanel']");
      const viewAllLink = panel?.querySelector(".gallery-view-all");
      const galleryLinkHref = viewAllLink?.href || "";

      if (hasApi) {
        let ownerId = "";
        try {
          const url = new URL(galleryLinkHref, globalThis.location?.href);
          ownerId = url.searchParams.get("id") || "";
        } catch {}

        viewerActions.loadSessionOnce().then((session) => {
          fullViewer.setPhotos([photo], {
            galleryLinkHref,
            onReact: viewerActions.handleReact,
            onComment: viewerActions.handleComment,
            viewerPlayerId: session.playerId,
            viewerAuthorDisplayName: session.displayName,
          });
          fullViewer.open(photo.id);
          void viewerActions.loadSocialState(ownerId, photo.id);
        });
      } else {
        fullViewer.setPhotos([photo], { galleryLinkHref });
        fullViewer.open(photo.id);
      }
      return;
    }

    // Thought card image click (any feed page) — lightweight, no real photo ID
    const thoughtImg = e.target.closest(".thought-card__image");
    if (thoughtImg) {
      const article = thoughtImg.closest("article[data-poster-id]");
      const posterId = article?.dataset.posterId || "";
      const galleryLinkHref = posterId
        ? `${galleryPageHref}?id=${encodeURIComponent(posterId)}`
        : "";

      const photo = {
        id: `thought-img-${Date.now()}`,
        imageUrl: thoughtImg.src,
        caption: thoughtImg.alt || "",
      };

      thoughtViewer.setPhotos([photo], { galleryLinkHref });
      thoughtViewer.open(photo.id);
    }
  });

  return fullViewer;
}
