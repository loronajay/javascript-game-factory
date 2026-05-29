import { createAuthApiClient } from "../platform/api/auth-api.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { createMediaComposerState } from "../profile-social/media-composer-state.mjs";
import { renderGalleryPageView } from "./render.mjs";
import { loadGalleryPageData, sanitizeGalleryPlayerId } from "./loader.mjs";
import type { GalleryPageData } from "./loader.mjs";
import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { createPhotoViewer } from "./viewer.mjs";

async function initGalleryPage(doc: Document = globalThis.document): Promise<void> {
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

  let pageState: GalleryPageData = await loadGalleryPageData(playerId, { apiClient, authClient });

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

  async function loadViewerSocialState(photoId: string) {
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

  async function openViewer(photoId: string) {
    viewer.open(photoId);
    void loadViewerSocialState(photoId);
  }

  async function handleViewerDelete(photoId: string) {
    if (!pageState.isOwner) return;
    viewer.close();
    await apiClient.deletePlayerPhoto(playerId, photoId).catch(() => {});
    await reloadPhotos();
    rerender();
    syncViewer();
  }

  async function handleViewerReact(photoId: string, reactionId: string) {
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

  async function handleViewerComment(photoId: string, text: string) {
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
    const form = event.target as HTMLElement | null;
    if (!form || form.id !== "galleryGalleryUploadForm") return;
    event.preventDefault();

    const galleryUploadState = mediaComposer.getGalleryUploadState();
    if (galleryUploadState?.isUploading) return;
    if (!pageState.isOwner || !galleryUploadState.previewUrl) {
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
    const target = event.target as Element | null;
    const cancelBtn = target?.closest("[data-cancel-gallery-upload]");
    if (cancelBtn) {
      mediaComposer.closeGalleryComposer("");
      rerender();
      return;
    }

    const deleteBtn = target?.closest<HTMLElement>("[data-delete-photo-id]");
    if (deleteBtn) {
      const photoId = deleteBtn.dataset.deletePhotoId;
      if (!photoId || !pageState.isOwner) return;
      await apiClient.deletePlayerPhoto(playerId, photoId).catch(() => {});
      await reloadPhotos();
      rerender();
      syncViewer();
      return;
    }

    if (target?.closest(".photo-viewer")) return;

    const galleryItem = target?.closest<HTMLElement>("[data-photo-id]");
    if (galleryItem) {
      void openViewer(galleryItem.dataset.photoId || "");
      return;
    }
  });

  doc.addEventListener("change", (event) => {
    const targetEl = event.target as HTMLInputElement | null;
    if (targetEl?.id === "galleryGalleryFileInput") {
      const file = targetEl.files?.[0] || null;
      if (!file) return;
      mediaComposer.applyGalleryPhotoFile(file);
      rerender();
      return;
    }
    if (targetEl?.id === "galleryGalleryVisibility") {
      mediaComposer.setGalleryUploadField("visibility", targetEl.value || "public");
      return;
    }
    if (targetEl?.id === "galleryGalleryPostToFeed") {
      mediaComposer.setGalleryUploadField("postToFeed", !!targetEl.checked);
    }
  });

  doc.addEventListener("input", (event) => {
    const targetEl = event.target as HTMLTextAreaElement | null;
    if (targetEl?.id === "galleryGalleryCaption") {
      mediaComposer.setGalleryUploadField("caption", targetEl.value || "");
    }
  });
}

const doc = globalThis.document;
if (typeof doc?.getElementById === "function") {
  void initGalleryPage(doc);
}
