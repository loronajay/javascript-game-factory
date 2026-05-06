export async function openGalleryItemInViewer({
  galleryItem,
  fullViewer,
  viewerActions = null,
  hasApi = false,
  locationHref = globalThis.location?.href,
} = {}) {
  const img = galleryItem?.querySelector(".gallery-item__img");
  if (!img) return false;

  const photo = {
    id: galleryItem.dataset.photoId,
    imageUrl: img.src,
    caption: img.alt || "",
  };

  const panel = galleryItem.closest(".gallery-panel, [id$='GalleryPanel']");
  const viewAllLink = panel?.querySelector(".gallery-view-all");
  const galleryLinkHref = viewAllLink?.href || "";

  if (hasApi && viewerActions) {
    let ownerId = "";
    try {
      const url = new URL(galleryLinkHref, locationHref);
      ownerId = url.searchParams.get("id") || "";
    } catch {}

    const session = await viewerActions.loadSessionOnce();
    fullViewer.setPhotos([photo], {
      galleryLinkHref,
      onReact: viewerActions.handleReact,
      onComment: viewerActions.handleComment,
      viewerPlayerId: session.playerId,
      viewerAuthorDisplayName: session.displayName,
    });
    fullViewer.open(photo.id);
    void viewerActions.loadSocialState(ownerId, photo.id);
    return true;
  }

  fullViewer.setPhotos([photo], { galleryLinkHref });
  fullViewer.open(photo.id);
  return true;
}

export function openThoughtImageInViewer({
  thoughtImg,
  thoughtViewer,
  galleryPageHref = "../gallery/index.html",
  now = Date.now,
} = {}) {
  if (!thoughtImg) return false;

  const article = thoughtImg.closest("article[data-poster-id]");
  const posterId = article?.dataset.posterId || "";
  const galleryLinkHref = posterId
    ? `${galleryPageHref}?id=${encodeURIComponent(posterId)}`
    : "";

  const photo = {
    id: `thought-img-${now()}`,
    imageUrl: thoughtImg.src,
    caption: thoughtImg.alt || "",
  };

  thoughtViewer.setPhotos([photo], { galleryLinkHref });
  thoughtViewer.open(photo.id);
  return true;
}

export function createPageGalleryViewerClickHandler({
  fullViewer,
  thoughtViewer,
  viewerActions = null,
  galleryPageHref = "../gallery/index.html",
  hasApi = false,
  now = Date.now,
  locationHref = globalThis.location?.href,
} = {}) {
  return async function handlePageGalleryViewerClick(event) {
    const target = event?.target;
    if (!target?.closest) return;
    if (target.closest(".photo-viewer")) return;
    if (target.closest("button")) return;

    const galleryItem = target.closest("[data-photo-id]");
    if (galleryItem) {
      await openGalleryItemInViewer({
        galleryItem,
        fullViewer,
        viewerActions,
        hasApi,
        locationHref,
      });
      return;
    }

    const thoughtImg = target.closest(".thought-card__image");
    if (thoughtImg) {
      openThoughtImageInViewer({
        thoughtImg,
        thoughtViewer,
        galleryPageHref,
        now,
      });
    }
  };
}
