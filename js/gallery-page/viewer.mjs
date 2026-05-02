export function createPhotoViewer({ doc = globalThis.document, lightweight = false } = {}) {
  let photos = [];
  let currentIndex = -1;
  let isOwner = false;
  let onDeleteFn = null;
  let galleryLinkHref = "";

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

  function formatDate(ts) {
    if (!ts) return "";
    try {
      return new Date(ts).toLocaleDateString(undefined, {
        year: "numeric", month: "long", day: "numeric",
      });
    } catch {
      return "";
    }
  }

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

  function paint() {
    const photo = photos[currentIndex];
    if (!photo) return;
    imgEl.src = photo.imageUrl || "";
    imgEl.alt = photo.caption || "";
    captionEl.textContent = photo.caption || "";
    timestampEl.textContent = formatDate(photo.createdAt || photo.created_at);

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
        // browser follows the <a> href naturally after close cleanup
      }
      return;
    }
    if (!lightweight) {
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
      }
    }
  });

  doc.addEventListener("keydown", (e) => {
    if (overlay.classList.contains("photo-viewer--hidden")) return;
    if (e.key === "Escape") {
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
      galleryLinkHref = opts.galleryLinkHref || "";
      if (api.isOpen() && currentIndex >= 0) paint();
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
    },
    isOpen() {
      return !overlay.classList.contains("photo-viewer--hidden");
    },
  };
  return api;
}

export function initPageGalleryViewer({ doc = globalThis.document, galleryPageHref = "../gallery/index.html" } = {}) {
  const viewer = createPhotoViewer({ doc, lightweight: true });

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
      const galleryHref = viewAllLink?.href || "";
      const galleryLinkHref = galleryHref
        ? `${galleryHref}&photo=${encodeURIComponent(photo.id)}`
        : "";

      viewer.setPhotos([photo], { galleryLinkHref });
      viewer.open(photo.id);
      return;
    }

    // Thought card image click (any feed page)
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

      viewer.setPhotos([photo], { galleryLinkHref });
      viewer.open(photo.id);
    }
  });

  return viewer;
}
