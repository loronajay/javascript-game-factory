import { PROFILE_UPDATED_EVENT } from "../arcade-profile.mjs";
import { loadFactoryProfile } from "../platform/identity/factory-profile.mjs";
import {
  syncThoughtPostCountWithApi,
} from "../platform/metrics/metrics.mjs";
import {
  buildPlayerThoughtFeed,
  commentOnThoughtPostWithApi,
  deleteThoughtPostWithApi,
  loadThoughtFeed,
  loadThoughtComments,
  publishThoughtPostWithApi,
  reactToThoughtPostWithApi,
  shareThoughtPostWithApi,
  syncThoughtCommentsFromApi,
  syncThoughtFeedFromApi,
} from "../platform/thoughts/thoughts.mjs";
import { createMediaComposerState } from "../profile-social/media-composer-state.mjs";
import { createProfileSocialActions } from "../profile-social/social-actions.mjs";
import { initPageGalleryViewer } from "../gallery-page/viewer.mjs";
import { createFriendNavigatorController } from "./friend-navigator.mjs";
import { createMePageDataController } from "./page-data.mjs";
import {
  submitGalleryUpload,
  uploadPendingThoughtPhoto,
} from "./media-actions.mjs";

export function wireMePage(doc, renderPage, addFriendByCode, { storage, apiClient, profilePanel, authClient }) {
  initPageGalleryViewer({ doc, apiClient });
  const friendNavigator = createFriendNavigatorController();
  const pageData = createMePageDataController({ storage, apiClient });
  const mediaComposer = createMediaComposerState({
    doc,
    thoughtPhotoNameId: "meThoughtPhotoName",
    thoughtPhotoInputId: "meThoughtPhotoInput",
  });

  const rerender = async (thoughtComposerFlash = "", shouldHydrate = false, friendCodeFlash = "") => {
    const renderState = await pageData.loadRenderState({ shouldHydrate });

    const socialViewState = socialActions.getViewState();
    profilePanel?.render?.("");
    renderPage(doc, renderState.profile, {
      thoughtFeed: renderState.thoughtFeed,
      thoughtComposerFlash,
      friendCodeFlash,
      metricsRecord: renderState.metricsRecord,
      relationshipsRecord: renderState.relationshipsRecord,
      openReactionThoughtId: socialViewState.openReactionThoughtId,
      sharePanelState: socialViewState.sharePanelState,
      commentPanelState: socialViewState.commentPanelState,
      galleryPhotos: renderState.galleryPhotos,
      thoughtComposerState: mediaComposer.getThoughtPhotoState(),
      galleryUploadState: mediaComposer.getGalleryUploadState(),
      friendNavigatorExpanded: friendNavigator.getViewState().expanded,
      friendNavigatorSearchQuery: friendNavigator.getViewState().searchQuery,
    });
    friendNavigator.applyFilter(doc);
  };

  const socialActions = createProfileSocialActions({
    loadCurrentProfile() {
      return loadFactoryProfile(storage);
    },
    loadThoughtComments(thoughtId) {
      return loadThoughtComments(thoughtId, storage);
    },
    async syncThoughtComments(thoughtId) {
      return syncThoughtCommentsFromApi(thoughtId, storage, apiClient);
    },
    async commentOnThought(thoughtId, currentProfile, text) {
      return commentOnThoughtPostWithApi(thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, text, storage, { apiClient });
    },
    async shareThought(thoughtId, currentProfile, caption = "") {
      return shareThoughtPostWithApi(thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, storage, { apiClient, caption });
    },
    async reactToThought(thoughtId, reactionId, currentProfile) {
      return reactToThoughtPostWithApi(thoughtId, currentProfile.playerId, reactionId, storage, { apiClient });
    },
    async deleteThought(thoughtId) {
      return deleteThoughtPostWithApi(thoughtId, storage, { apiClient });
    },
    async rerenderView() {
      return rerender();
    },
    async rerenderPanels() {
      return rerender();
    },
    async afterDelete(_thoughtId, currentProfile) {
      const updatedThoughtCount = buildPlayerThoughtFeed(loadThoughtFeed(storage), currentProfile.playerId).length;
      syncThoughtPostCountWithApi(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
    },
  });

  void pageData.loadGallery().then(() => rerender("", true));

  doc.getElementById("meDeleteAccountBtn")?.addEventListener("click", async () => {
    const flashEl = doc.getElementById("meDeleteAccountFlash");
    const btn = doc.getElementById("meDeleteAccountBtn");
    if (!confirm("Delete your account permanently? All your data will be removed and cannot be recovered.")) return;
    if (btn) { btn.disabled = true; btn.textContent = "Deleting..."; }
    const result = await authClient?.deleteAccount?.();
    if (!result?.ok) {
      if (flashEl) flashEl.textContent = "Could not delete account. Try again.";
      if (btn) { btn.disabled = false; btn.textContent = "Delete Account"; }
      return;
    }
    try { localStorage.clear(); } catch { /* ignore */ }
    window.location.href = "../index.html";
  });

  doc.addEventListener(PROFILE_UPDATED_EVENT, () => {
    pageData.clearCachedHydration();
    void rerender();
  });

  doc.addEventListener("submit", async (event) => {
    const form = event.target;

    if (form?.matches?.("[data-comment-form]") || form?.matches?.("[data-share-caption-form]")) {
      event.preventDefault();
      if (await socialActions.handleSubmit(form)) {
        return;
      }
    }

    if (form && typeof form === "object" && form.id === "meFriendCodeForm") {
      event.preventDefault();
      const input = doc.getElementById("meFriendCodeInput");
      const outcome = await addFriendByCode(input?.value || "", { storage, apiClient });
      void rerender("", false, outcome.message);
      return;
    }

    if (form && typeof form === "object" && form.id === "meGalleryUploadForm") {
      event.preventDefault();
      const currentProfile = loadFactoryProfile(storage);
      const galleryUploadState = mediaComposer.getGalleryUploadState();
      if (galleryUploadState?.isUploading) return;
      await rerender();
      const galleryUploadResult = await submitGalleryUpload({
        currentProfile,
        mediaComposer,
        apiClient,
        loadGallery: () => pageData.loadGallery(),
        async onUploadStart() {
          await rerender();
        },
      });
      if (!galleryUploadResult.ok) {
        if (!galleryUploadResult.skipped) {
          void rerender();
        }
        return;
      }

      const postedToFeed = !!galleryUploadResult.thought;
      if (postedToFeed) {
        await syncThoughtFeedFromApi(storage, apiClient, currentProfile.playerId);
        const updatedThoughtCount = buildPlayerThoughtFeed(loadThoughtFeed(storage), currentProfile.playerId).length;
        syncThoughtPostCountWithApi(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
      }
      void rerender();
      return;
    }

    if (!form || typeof form !== "object" || form.id !== "meThoughtComposer") {
      return;
    }

    event.preventDefault();
    const currentProfile = loadFactoryProfile(storage);
    const subjectInput = doc.getElementById("meThoughtSubject");
    const bodyInput = doc.getElementById("meThoughtBody");
    const thoughtPhotoState = mediaComposer.getThoughtPhotoState();
    const subject = subjectInput?.value ?? thoughtPhotoState.subject ?? "";
    const text = bodyInput?.value ?? thoughtPhotoState.text ?? "";
    const photoResult = await uploadPendingThoughtPhoto({
      currentProfile,
      mediaComposer,
      apiClient,
      loadGallery: () => pageData.loadGallery(),
      subject,
      text,
    });

    if (photoResult.thought) {
      await syncThoughtFeedFromApi(storage, apiClient, currentProfile.playerId);
      const updatedThoughtCount = buildPlayerThoughtFeed(loadThoughtFeed(storage), currentProfile.playerId).length;
      syncThoughtPostCountWithApi(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
      mediaComposer.closeThoughtPhotoComposer();
      mediaComposer.clearThoughtDraft();
      void rerender("Thought posted.");
      return;
    }

    const saved = await publishThoughtPostWithApi({
      authorPlayerId: currentProfile.playerId,
      authorDisplayName: currentProfile.profileName || "UNNAMED PILOT",
      subject,
      text,
      visibility: photoResult.visibility || "public",
      imageUrl: photoResult.imageUrl,
    }, storage, { apiClient });

    if (!saved) {
      void rerender("Write a thought before posting.");
      return;
    }

    const updatedThoughtCount = buildPlayerThoughtFeed(loadThoughtFeed(storage), currentProfile.playerId).length;
    syncThoughtPostCountWithApi(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
    mediaComposer.closeThoughtPhotoComposer();
    mediaComposer.clearThoughtDraft();
    void rerender("Thought posted.");
  });

  doc.addEventListener("click", async (event) => {
    const toggleFriendsButton = event.target.closest("#meFriendsToggle");
    if (toggleFriendsButton) {
      friendNavigator.toggleExpanded();
      void rerender();
      return;
    }

    const openFavoritePickerButton = event.target.closest("[data-open-favorite-picker]");
    if (openFavoritePickerButton) {
      profilePanel?.openPanel?.();
      const favoriteInput = doc.getElementById("playerProfileFavoriteGame");
      favoriteInput?.focus?.();
      return;
    }

    if (await socialActions.handleClick(event)) {
      return;
    }
  });

  doc.addEventListener("click", (event) => {
    const clearThoughtPhotoButton = event.target.closest("[data-clear-thought-photo]");
    if (clearThoughtPhotoButton) {
      mediaComposer.closeThoughtPhotoComposer();
      void rerender();
      return;
    }

    const cancelGalleryButton = event.target.closest("[data-cancel-gallery-upload]");
    if (!cancelGalleryButton) return;
    mediaComposer.closeGalleryComposer("");
    void rerender();
  });

  doc.addEventListener("change", async (event) => {
    if (event.target?.id === "meThoughtPhotoInput") {
      const file = event.target.files?.[0] || null;
      if (!file) {
        mediaComposer.closeThoughtPhotoComposer();
        void rerender();
        return;
      }
      mediaComposer.applyThoughtPhotoFile(file);
      void rerender();
      return;
    }

    if (event.target?.id === "meThoughtVisibility") {
      mediaComposer.setThoughtPhotoField("visibility", event.target.value || "public");
      return;
    }

    if (event.target?.id === "meThoughtSaveToGallery") {
      mediaComposer.setThoughtPhotoField("saveToGallery", !!event.target.checked);
      return;
    }

    if (event.target?.id === "meGalleryFileInput") {
      const file = event.target.files?.[0] || null;
      if (!file) return;
      mediaComposer.applyGalleryPhotoFile(file);
      void rerender();
    }

    if (event.target?.id === "meGalleryVisibility") {
      mediaComposer.setGalleryUploadField("visibility", event.target.value || "public");
      return;
    }

    if (event.target?.id === "meGalleryPostToFeed") {
      mediaComposer.setGalleryUploadField("postToFeed", !!event.target.checked);
    }
  });

  doc.addEventListener("click", (event) => {
    const deleteBtn = event.target.closest("[data-delete-photo-id]");
    if (deleteBtn) {
      const photoId = deleteBtn.dataset.deletePhotoId;
      const currentProfile = loadFactoryProfile(storage);
      if (!photoId || !currentProfile?.playerId || !apiClient?.deletePlayerPhoto) return;
      apiClient.deletePlayerPhoto(currentProfile.playerId, photoId).then(async () => {
        await pageData.loadGallery();
        void rerender();
      }).catch(() => {});
    }
  }, true);

  doc.addEventListener("input", (event) => {
    if (event.target?.id === "meFriendsSearchInput") {
      friendNavigator.setSearchQuery(event.target.value || "");
      friendNavigator.applyFilter(doc);
      return;
    }

    if (socialActions.handleInput(event)) return;
    if (event.target?.id === "meThoughtPhotoCaption") {
      mediaComposer.setThoughtPhotoField("caption", event.target.value || "");
      return;
    }
    if (event.target?.id === "meThoughtSubject") {
      mediaComposer.setThoughtPhotoField("subject", event.target.value || "");
      return;
    }
    if (event.target?.id === "meThoughtBody") {
      mediaComposer.setThoughtPhotoField("text", event.target.value || "");
      return;
    }
    if (event.target?.id === "meGalleryCaption") {
      mediaComposer.setGalleryUploadField("caption", event.target.value || "");
      return;
    }
  });
}
