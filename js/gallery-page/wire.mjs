import { createAuthApiClient } from "../platform/api/auth-api.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { createMediaComposerState } from "../profile-social/media-composer-state.mjs";
import { renderGalleryPageView } from "./render.mjs";
import { loadGalleryPageData, sanitizeGalleryPlayerId } from "./loader.mjs";
import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";

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

  rerender();

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
