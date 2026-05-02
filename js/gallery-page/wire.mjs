import { createAuthApiClient } from "../platform/api/auth-api.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { createMediaComposerState } from "../profile-social/media-composer-state.mjs";
import { renderGalleryPageView } from "./render.mjs";
import { loadGalleryPageData, sanitizeGalleryPlayerId } from "./loader.mjs";
import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { createPhotoViewer } from "./viewer.mjs";

async function initGalleryPage(doc = globalThis.document) {
  if (!doc?.getElementById) return;

  const params = new URLSearchParams(globalThis.location?.search || "");
  const playerId = sanitizeGalleryPlayerId(params.get("id"));

  renderPrimaryAppNav(doc.getElementById("galleryPrimaryNav"), {
    basePath: "../",
    currentPage: "",
    sessionNavId: "galleryAuthNav",
  });
  void initSessionNav(doc.getElementById("galleryAuthNav"), {
    signInPath: "../sign-in/index.html",
    signUpPath: "../sign-up/index.html",
    homeOnLogout: "../index.html",
  });

  if (!playerId) {
    const titleEl = doc.getElementById("galleryPageTitle");
    if (titleEl) titleEl.textContent = "No player specified.";
    return;
  }

  const apiClient = createPlatformApiClient();
  const authClient = createAuthApiClient();
  const mediaComposer = createMediaComposerState({ doc });
  const viewer = createPhotoViewer({ doc });

  let pageState = await loadGalleryPageData(playerId, { apiClient, authClient });

  const rerender = () => {
    renderGalleryPageView(doc, {
      profile: pageState.profile,
      photos: pageState.photos,
      isOwner: pageState.isOwner,
      uploadState: mediaComposer.getGalleryUploadState(),
    });
  };

  const reloadPhotos = async () => {
    const photos = await apiClient.listPlayerPhotos(
      playerId,
      pageState.isOwner ? {} : { visibility: "public" },
    ).catch(() => []);
    pageState = { ...pageState, photos: Array.isArray(photos) ? photos : [] };
  };

  const syncViewer = () => {
    viewer.setPhotos(pageState.photos, {
      isOwner: pageState.isOwner,
      onDelete: handleViewerDelete,
      onReact: handleViewerReact,
      onComment: handleViewerComment,
      viewerPlayerId: pageState.authSessionPlayerId,
      viewerAuthorDisplayName: pageState.authSessionDisplayName,
    });
  };

  async function loadViewerSocialState(photoId) {
    const [comments, photo] = await Promise.all([
      apiClient.listPhotoComments(photoId).catch(() => []),
      apiClient.getPlayerPhoto(playerId, photoId).catch(() => null),
    ]);
    viewer.setSocialState(photoId, {
      reactionTotals: photo?.reactionTotals || {},
      viewerReaction: photo?.viewerReaction || "",
      comments: Array.isArray(comments) ? comments : [],
    });
  }

  async function openViewer(photoId) {
    viewer.open(photoId);
    void loadViewerSocialState(photoId);
  }

  async function handleViewerDelete(photoId) {
    if (!pageState.isOwner || !apiClient?.deletePlayerPhoto) return;
    viewer.close();
    await apiClient.deletePlayerPhoto(playerId, photoId).catch(() => {});
    await reloadPhotos();
    rerender();
    syncViewer();
  }

  async function handleViewerReact(photoId, reactionId) {
    const viewerPlayerId = pageState.authSessionPlayerId;
    if (!viewerPlayerId) return;
    const photo = await apiClient.reactToPhoto(photoId, viewerPlayerId, reactionId).catch(() => null);
    if (!photo) return;
    const comments = await apiClient.listPhotoComments(photoId).catch(() => []);
    viewer.setSocialState(photoId, {
      reactionTotals: photo.reactionTotals || {},
      viewerReaction: photo.viewerReaction || "",
      comments: Array.isArray(comments) ? comments : [],
    });
  }

  async function handleViewerComment(photoId, text) {
    const viewerPlayerId = pageState.authSessionPlayerId;
    const viewerAuthorDisplayName = pageState.authSessionDisplayName;
    if (!viewerPlayerId || !viewerAuthorDisplayName || !text?.trim()) return;
    const commentRecord = await apiClient
      .commentOnPhoto(photoId, viewerPlayerId, viewerAuthorDisplayName, text)
      .catch(() => null);
    if (!commentRecord) return;
    const comments = await apiClient.listPhotoComments(photoId).catch(() => []);
    const photo = commentRecord.photo;
    viewer.setSocialState(photoId, {
      reactionTotals: photo?.reactionTotals || {},
      viewerReaction: "",
      comments: Array.isArray(comments) ? comments : [],
    });
  }

  rerender();
  syncViewer();

  const initialPhotoId = params.get("photo");
  if (initialPhotoId) void openViewer(initialPhotoId);

  doc.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!form || form.id !== "galleryGalleryUploadForm") return;
    event.preventDefault();

    const galleryUploadState = mediaComposer.getGalleryUploadState();
    if (galleryUploadState?.isUploading) return;
    if (!pageState.isOwner || !apiClient?.uploadPhoto || !galleryUploadState.previewUrl) {
      mediaComposer.setGalleryUploadField("statusMessage", "Choose a photo first.");
      rerender();
      return;
    }

    const file = mediaComposer.getPendingGalleryPhoto();
    if (!file) {
      mediaComposer.setGalleryUploadField("statusMessage", "Choose a photo first.");
      rerender();
      return;
    }

    mediaComposer.setGalleryUploadField("isUploading", true);
    mediaComposer.setGalleryUploadField("statusMessage", "Uploading...");
    rerender();

    const uploadResult = await apiClient.uploadPhoto(file).catch(() => null);
    if (!uploadResult?.assetId || !uploadResult?.url) {
      mediaComposer.setGalleryUploadField("isUploading", false);
      mediaComposer.setGalleryUploadField("statusMessage", "Upload failed. Try again.");
      rerender();
      return;
    }

    const savedGalleryState = mediaComposer.getGalleryUploadState();
    const savedPhotoRecord = await apiClient.savePlayerPhoto(playerId, {
      assetId: uploadResult.assetId,
      imageUrl: uploadResult.url,
      caption: savedGalleryState.caption,
      visibility: savedGalleryState.visibility,
      postToFeed: savedGalleryState.postToFeed,
    }).catch(() => null);

    if (!savedPhotoRecord?.photo) {
      mediaComposer.setGalleryUploadField("isUploading", false);
      mediaComposer.setGalleryUploadField("statusMessage", "Could not save photo. Try again.");
      rerender();
      return;
    }

    const postedToFeed = !!savedPhotoRecord.thought;
    mediaComposer.closeGalleryComposer(postedToFeed ? "Photo uploaded and posted." : "Photo uploaded.");
    await reloadPhotos();
    rerender();
    syncViewer();
  });

  doc.addEventListener("click", async (event) => {
    const cancelBtn = event.target.closest("[data-cancel-gallery-upload]");
    if (cancelBtn) {
      mediaComposer.closeGalleryComposer("");
      rerender();
      return;
    }

    const deleteBtn = event.target.closest("[data-delete-photo-id]");
    if (deleteBtn) {
      const photoId = deleteBtn.dataset.deletePhotoId;
      if (!photoId || !pageState.isOwner || !apiClient?.deletePlayerPhoto) return;
      await apiClient.deletePlayerPhoto(playerId, photoId).catch(() => {});
      await reloadPhotos();
      rerender();
      syncViewer();
      return;
    }

    if (event.target.closest(".photo-viewer")) return;

    const galleryItem = event.target.closest("[data-photo-id]");
    if (galleryItem) {
      void openViewer(galleryItem.dataset.photoId);
      return;
    }
  });

  doc.addEventListener("change", (event) => {
    if (event.target?.id === "galleryGalleryFileInput") {
      const file = event.target.files?.[0] || null;
      if (!file) return;
      mediaComposer.applyGalleryPhotoFile(file);
      rerender();
      return;
    }
    if (event.target?.id === "galleryGalleryVisibility") {
      mediaComposer.setGalleryUploadField("visibility", event.target.value || "public");
      return;
    }
    if (event.target?.id === "galleryGalleryPostToFeed") {
      mediaComposer.setGalleryUploadField("postToFeed", !!event.target.checked);
    }
  });

  doc.addEventListener("input", (event) => {
    if (event.target?.id === "galleryGalleryCaption") {
      mediaComposer.setGalleryUploadField("caption", event.target.value || "");
    }
  });
}

const doc = globalThis.document;
if (doc?.getElementById) {
  void initGalleryPage(doc);
}
