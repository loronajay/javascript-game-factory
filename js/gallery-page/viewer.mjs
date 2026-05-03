import { createAuthApiClient } from "../platform/api/auth-api.mjs";

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
  let photos = [];
  let currentIndex = -1;
  let isOwner = false;
  let onDeleteFn = null;
  let galleryLinkHref = "";
  let onReactFn = null;
  let onCommentFn = null;
  let viewerPlayerId = "";
  let viewerAuthorDisplayName = "";
  let reactionPickerOpen = false;
  const socialStateMap = new Map();

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
    const photo = photos[currentIndex];
    if (!photo) return;

    const state = socialStateMap.get(photo.id);

    if (reactionChipsEl) {
      const totals = state?.reactionTotals || {};
      const viewerReaction = state?.viewerReaction || "";
      const activeIds = PHOTO_REACTION_IDS.filter(id => (totals[id] > 0) || id === viewerReaction);
      const chipsHtml = activeIds.map(id =>
        `<button
          class="photo-viewer__reaction-chip${id === viewerReaction ? " photo-viewer__reaction-chip--selected" : ""}"
          type="button" data-reaction-id="${id}" title="${id}"
        >${PHOTO_REACTION_GLYPHS[id]} <span>${totals[id] || 0}</span></button>`
      ).join("");
      reactionChipsEl.innerHTML = chipsHtml;
    }

    if (commentListEl) {
      const comments = state?.comments;
      if (!comments) {
        commentListEl.innerHTML = `<p class="photo-viewer__comments-loading">Loading comments...</p>`;
      } else if (comments.length === 0) {
        commentListEl.innerHTML = `<p class="photo-viewer__comments-empty">No comments yet.</p>`;
      } else {
        commentListEl.innerHTML = comments.map(c =>
          `<div class="photo-viewer__comment">
            <span class="photo-viewer__comment-author">${escapeHtml(c.authorDisplayName)}</span>
            <span class="photo-viewer__comment-text">${escapeHtml(c.text)}</span>
            <span class="photo-viewer__comment-time">${formatViewerDate(c.createdAt)}</span>
          </div>`
        ).join("");
        commentListEl.scrollTop = commentListEl.scrollHeight;
      }
    }

    if (commentFormEl) {
      commentFormEl.style.display = viewerPlayerId ? "" : "none";
    }
  }

  function setReactionPickerOpen(open) {
    reactionPickerOpen = open;
    if (!reactionPickerEl) return;
    if (open) {
      reactionPickerEl.classList.remove("photo-viewer__reaction-picker--hidden");
    } else {
      reactionPickerEl.classList.add("photo-viewer__reaction-picker--hidden");
    }
  }

  function paint() {
    const photo = photos[currentIndex];
    if (!photo) return;
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
        const hasSiblings = photos.length > 1;
        prevBtn.disabled = currentIndex <= 0;
        nextBtn.disabled = currentIndex >= photos.length - 1;
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
      if (currentIndex > 0) {
        currentIndex--;
        paint();
        updateUrl(photos[currentIndex]?.id);
      }
      return;
    }
    if (e.target.closest(".photo-viewer__nav--next")) {
      if (currentIndex < photos.length - 1) {
        currentIndex++;
        paint();
        updateUrl(photos[currentIndex]?.id);
      }
      return;
    }
    if (e.target.closest(".photo-viewer__delete")) {
      const photoId = e.target.closest(".photo-viewer__delete").dataset.photoId;
      if (photoId && onDeleteFn) onDeleteFn(photoId);
      return;
    }
    if (e.target.closest(".photo-viewer__react-btn")) {
      setReactionPickerOpen(!reactionPickerOpen);
      return;
    }
    const reactionOptionBtn = e.target.closest(".photo-viewer__reaction-option");
    if (reactionOptionBtn) {
      const reactionId = reactionOptionBtn.dataset.reactionId;
      const photo = photos[currentIndex];
      if (reactionId && photo && onReactFn) {
        setReactionPickerOpen(false);
        onReactFn(photo.id, reactionId);
      }
      return;
    }
    const reactionChipBtn = e.target.closest(".photo-viewer__reaction-chip");
    if (reactionChipBtn) {
      const reactionId = reactionChipBtn.dataset.reactionId;
      const photo = photos[currentIndex];
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
    const photo = photos[currentIndex];
    if (text && photo && onCommentFn) {
      onCommentFn(photo.id, text);
      if (commentInputEl) commentInputEl.value = "";
    }
  });

  doc.addEventListener("keydown", (e) => {
    if (overlay.classList.contains("photo-viewer--hidden")) return;
    if (e.key === "Escape") {
      if (reactionPickerOpen) {
        setReactionPickerOpen(false);
        return;
      }
      api.close();
    } else if (!lightweight) {
      if (e.key === "ArrowLeft" && currentIndex > 0) {
        currentIndex--;
        paint();
        updateUrl(photos[currentIndex]?.id);
      } else if (e.key === "ArrowRight" && currentIndex < photos.length - 1) {
        currentIndex++;
        paint();
        updateUrl(photos[currentIndex]?.id);
      }
    }
  });

  const api = {
    setPhotos(newPhotos, opts = {}) {
      photos = Array.isArray(newPhotos) ? newPhotos : [];
      isOwner = !!opts.isOwner;
      onDeleteFn = opts.onDelete || null;
      onReactFn = opts.onReact || null;
      onCommentFn = opts.onComment || null;
      viewerPlayerId = opts.viewerPlayerId || "";
      viewerAuthorDisplayName = opts.viewerAuthorDisplayName || "";
      galleryLinkHref = opts.galleryLinkHref || "";
      if (api.isOpen() && currentIndex >= 0) paint();
    },
    setSocialState(photoId, state) {
      socialStateMap.set(photoId, state);
      const currentPhoto = photos[currentIndex];
      if (api.isOpen() && currentPhoto?.id === photoId) paintSocial();
    },
    open(photoId) {
      const idx = photos.findIndex((p) => p.id === photoId);
      if (idx < 0) return;
      currentIndex = idx;
      paint();
      show();
      updateUrl(photos[currentIndex]?.id);
    },
    close() {
      hide();
      updateUrl(null);
      currentIndex = -1;
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

  let sessionCache = null;
  async function loadSessionOnce() {
    if (sessionCache !== null) return sessionCache;
    sessionCache = { playerId: "", displayName: "" };
    try {
      const session = await createAuthApiClient().getSession().catch(() => null);
      if (session?.playerId) {
        sessionCache = { playerId: session.playerId, displayName: session.displayName || session.profileName || "" };
      }
    } catch {}
    return sessionCache;
  }

  async function loadSocialState(ownerId, photoId) {
    const [comments, photoRecord] = await Promise.all([
      apiClient.listPhotoComments(photoId).catch(() => []),
      ownerId ? apiClient.getPlayerPhoto(ownerId, photoId).catch(() => null) : Promise.resolve(null),
    ]);
    fullViewer.setSocialState(photoId, {
      reactionTotals: photoRecord?.reactionTotals || {},
      viewerReaction: photoRecord?.viewerReaction || "",
      comments: Array.isArray(comments) ? comments : [],
    });
  }

  async function handleReact(photoId, reactionId) {
    const session = await loadSessionOnce();
    if (!session.playerId) return;
    const photo = await apiClient.reactToPhoto(photoId, session.playerId, reactionId).catch(() => null);
    if (!photo) return;
    const comments = await apiClient.listPhotoComments(photoId).catch(() => []);
    fullViewer.setSocialState(photoId, {
      reactionTotals: photo.reactionTotals || {},
      viewerReaction: photo.viewerReaction || "",
      comments: Array.isArray(comments) ? comments : [],
    });
  }

  async function handleComment(photoId, text) {
    const session = await loadSessionOnce();
    if (!session.playerId || !text?.trim()) return;
    const commentRecord = await apiClient
      .commentOnPhoto(photoId, session.playerId, session.displayName, text)
      .catch(() => null);
    if (!commentRecord) return;
    const comments = await apiClient.listPhotoComments(photoId).catch(() => []);
    const photo = commentRecord.photo;
    fullViewer.setSocialState(photoId, {
      reactionTotals: photo?.reactionTotals || {},
      viewerReaction: "",
      comments: Array.isArray(comments) ? comments : [],
    });
  }

  doc.addEventListener("click", (e) => {
    if (e.target.closest(".photo-viewer")) return;
    if (e.target.closest("button")) return;

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

        loadSessionOnce().then((session) => {
          fullViewer.setPhotos([photo], {
            galleryLinkHref,
            onReact: handleReact,
            onComment: handleComment,
            viewerPlayerId: session.playerId,
            viewerAuthorDisplayName: session.displayName,
          });
          fullViewer.open(photo.id);
          void loadSocialState(ownerId, photo.id);
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
