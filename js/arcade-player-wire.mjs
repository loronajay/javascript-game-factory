import { loadFactoryProfile, saveFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { syncThoughtPostCountWithApi } from "./platform/metrics/metrics.mjs";
import { createFriendshipBetweenPlayers, loadProfileRelationshipsRecord, removeFriendBetweenPlayers } from "./platform/relationships/relationships.mjs";
import { createNotificationsApiClient } from "./platform/api/notifications-api.mjs";
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
} from "./platform/thoughts/thoughts.mjs";

export function wirePlayerPage(doc, renderPage, loadPageData, { storage, apiClient, profilePanel, authSession }) {
  let currentPageData = null;
  let openReactionThoughtId = "";
  let sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
  let commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
  let challengePickerOpen = false;
  let galleryPhotos = [];
  let pendingThoughtPhoto = null;
  let pendingGalleryPhoto = null;
  let thoughtPhotoState = {
    previewUrl: "",
    fileName: "",
    caption: "",
    visibility: "public",
    saveToGallery: true,
  };
  let galleryUploadState = {
    previewUrl: "",
    fileName: "",
    caption: "",
    visibility: "public",
    postToFeed: false,
    statusMessage: "",
  };

  const authSessionPlayerId = authSession?.playerId || "";

  function revokeGalleryPreview() {
    if (galleryUploadState.previewUrl?.startsWith?.("blob:") && globalThis.URL?.revokeObjectURL) {
      globalThis.URL.revokeObjectURL(galleryUploadState.previewUrl);
    }
  }

  function closeGalleryComposer(statusMessage = "") {
    revokeGalleryPreview();
    pendingGalleryPhoto = null;
    galleryUploadState = {
      previewUrl: "",
      fileName: "",
      caption: "",
      visibility: "public",
      postToFeed: false,
      statusMessage,
    };
  }

  function revokeThoughtPreview() {
    if (thoughtPhotoState.previewUrl?.startsWith?.("blob:") && globalThis.URL?.revokeObjectURL) {
      globalThis.URL.revokeObjectURL(thoughtPhotoState.previewUrl);
    }
  }

  function closeThoughtPhotoComposer() {
    revokeThoughtPreview();
    pendingThoughtPhoto = null;
    thoughtPhotoState = {
      previewUrl: "",
      fileName: "",
      caption: "",
      visibility: "public",
      saveToGallery: true,
    };
    const nameEl = doc.getElementById("playerThoughtPhotoName");
    if (nameEl) nameEl.textContent = "";
    const input = doc.getElementById("playerThoughtPhotoInput");
    if (input) input.value = "";
  }

  const loadGallery = async (targetPlayerId) => {
    if (!targetPlayerId || !apiClient?.listPlayerPhotos) return;
    const isOwner = targetPlayerId === authSessionPlayerId;
    const photos = await apiClient.listPlayerPhotos(targetPlayerId, isOwner ? {} : { visibility: "public" }).catch(() => []);
    galleryPhotos = Array.isArray(photos) ? photos : [];
  };

  const rerender = async (thoughtComposerFlash = "", disableProfileViewTracking = true) => {
    const pageData = await loadPageData({ storage, apiClient, authSessionPlayerId });
    currentPageData = pageData;
    profilePanel?.render?.("");
    renderPage(doc, {
      ...pageData,
      authSessionPlayerId,
      thoughtComposerFlash,
      disableProfileViewTracking,
      openReactionThoughtId,
      sharePanelState,
      commentPanelState,
      galleryPhotos,
      thoughtComposerState: thoughtPhotoState,
      galleryUploadState,
      isOwner: !!(pageData?.profile?.playerId && pageData.profile.playerId === authSessionPlayerId),
    });
  };

  async function uploadPendingThoughtPhoto(currentProfile, subject = "", text = "") {
    if (!pendingThoughtPhoto || !currentProfile?.playerId || !apiClient?.uploadPhoto) {
      return { imageUrl: "", thought: null, visibility: "public" };
    }

    const file = pendingThoughtPhoto;
    const photoState = { ...thoughtPhotoState };
    const uploadResult = await apiClient.uploadPhoto(file).catch(() => null);
    closeThoughtPhotoComposer();

    if (!uploadResult?.url) {
      return { imageUrl: "", thought: null, visibility: photoState.visibility || "public" };
    }

    if (photoState.saveToGallery !== false && apiClient?.savePlayerPhoto && uploadResult.assetId) {
      const savedPhotoRecord = await apiClient.savePlayerPhoto(currentProfile.playerId, {
        assetId: uploadResult.assetId,
        imageUrl: uploadResult.url,
        caption: photoState.caption || text,
        visibility: photoState.visibility || "public",
        postToFeed: true,
        subject,
        thoughtText: text,
      }).catch(() => null);

      if (savedPhotoRecord?.photo) {
        await loadGallery(currentProfile.playerId);
      }

      return {
        imageUrl: uploadResult.url,
        thought: savedPhotoRecord?.thought || null,
        visibility: photoState.visibility || "public",
      };
    }

    return {
      imageUrl: uploadResult.url,
      thought: null,
      visibility: photoState.visibility || "public",
    };
  }

  const openCommentSheet = async (cardId, thoughtId) => {
    commentPanelState = {
      cardId,
      thoughtId,
      text: "",
      comments: loadThoughtComments(thoughtId, storage),
    };
    openReactionThoughtId = "";
    sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
    await rerender();

    const remoteComments = await syncThoughtCommentsFromApi(thoughtId, storage, apiClient);
    if (commentPanelState.cardId !== cardId || commentPanelState.thoughtId !== thoughtId) {
      return;
    }
    commentPanelState = { ...commentPanelState, comments: remoteComments };
    await rerender();
  };

  void rerender("", false).then(() => {
    const targetId = currentPageData?.profile?.playerId || "";
    if (targetId) void loadGallery(targetId).then(() => rerender("", true));
  });

  doc.getElementById("playerProfileForm")?.addEventListener("submit", () => {
    queueMicrotask(() => { void rerender(); });
  });

  doc.getElementById("playerProfileClear")?.addEventListener("click", () => {
    queueMicrotask(() => { void rerender(); });
  });

  doc.addEventListener("submit", async (event) => {
    const form = event.target;

    if (form && typeof form === "object" && form.matches?.("[data-comment-form]")) {
      event.preventDefault();
      const currentProfile = loadFactoryProfile(storage);
      if (!commentPanelState.thoughtId || !currentProfile?.playerId || !commentPanelState.text.trim()) {
        return;
      }
      await commentOnThoughtPostWithApi(commentPanelState.thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, commentPanelState.text, storage, { apiClient });
      commentPanelState = {
        ...commentPanelState,
        text: "",
        comments: loadThoughtComments(commentPanelState.thoughtId, storage),
      };
      void rerender();
      return;
    }

    if (form && typeof form === "object" && form.matches?.("[data-share-caption-form]")) {
      event.preventDefault();
      const currentProfile = loadFactoryProfile(storage);
      if (!sharePanelState.thoughtId || !currentProfile?.playerId) return;
      await shareThoughtPostWithApi(sharePanelState.thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, storage, { apiClient, caption: sharePanelState.caption });
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender();
      return;
    }

    if (form && typeof form === "object" && form.id === "playerGalleryUploadForm") {
      event.preventDefault();
      const currentProfile = loadFactoryProfile(storage);
      if (!currentProfile?.playerId || currentProfile.playerId !== authSessionPlayerId || !apiClient?.uploadPhoto || !galleryUploadState.previewUrl) {
        galleryUploadState = { ...galleryUploadState, statusMessage: "Choose a photo first." };
        void rerender();
        return;
      }

      const file = pendingGalleryPhoto;
      if (!file) {
        galleryUploadState = { ...galleryUploadState, statusMessage: "Choose a photo first." };
        void rerender();
        return;
      }

      galleryUploadState = { ...galleryUploadState, statusMessage: "Uploading..." };
      await rerender();

      const uploadResult = await apiClient.uploadPhoto(file).catch(() => null);
      if (!uploadResult?.assetId || !uploadResult?.url) {
        galleryUploadState = { ...galleryUploadState, statusMessage: "Upload failed. Try again." };
        void rerender();
        return;
      }

      const savedPhotoRecord = await apiClient.savePlayerPhoto(currentProfile.playerId, {
        assetId: uploadResult.assetId,
        imageUrl: uploadResult.url,
        caption: galleryUploadState.caption,
        visibility: galleryUploadState.visibility,
        postToFeed: galleryUploadState.postToFeed,
      }).catch(() => null);

      if (!savedPhotoRecord?.photo) {
        galleryUploadState = { ...galleryUploadState, statusMessage: "Could not save photo. Try again." };
        void rerender();
        return;
      }

      const postedToFeed = !!savedPhotoRecord.thought;
      closeGalleryComposer(postedToFeed ? "Photo uploaded and posted." : "Photo uploaded.");
      await loadGallery(currentProfile.playerId);
      if (postedToFeed) {
        await syncThoughtFeedFromApi(storage, apiClient, currentProfile.playerId);
        const updatedThoughtCount = buildPlayerThoughtFeed(loadThoughtFeed(storage), currentProfile.playerId).length;
        syncThoughtPostCountWithApi(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
      }
      void rerender();
      return;
    }

    if (!form || typeof form !== "object" || form.id !== "playerThoughtComposer") {
      return;
    }

    event.preventDefault();
    const currentProfile = loadFactoryProfile(storage);
    const subjectInput = doc.getElementById("playerThoughtSubject");
    const bodyInput = doc.getElementById("playerThoughtBody");
    const subject = subjectInput?.value || "";
    const text = bodyInput?.value || "";
    const photoResult = await uploadPendingThoughtPhoto(currentProfile, subject, text);

    if (photoResult.thought) {
      const targetId = currentPageData?.profile?.playerId || currentProfile.playerId;
      await loadGallery(targetId);
      const updatedThoughtCount = buildPlayerThoughtFeed(await loadThoughtFeed(storage), currentProfile.playerId).length;
      syncThoughtPostCountWithApi(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
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
    void rerender("Thought posted.");
  });

  doc.addEventListener("click", async (event) => {
    const challengePickerToggle = event.target.closest("[data-gesture-challenge]");
    if (challengePickerToggle) {
      if (!authSession?.playerId) return;
      challengePickerOpen = !challengePickerOpen;
      renderPage(doc, {
        ...(currentPageData || {}),
        authSessionPlayerId,
        challengePickerOpen,
        disableProfileViewTracking: true,
        sharePanelState,
        commentPanelState,
      });
      return;
    }

    const challengePickerCancel = event.target.closest("[data-challenge-picker-cancel]");
    if (challengePickerCancel) {
      challengePickerOpen = false;
      renderPage(doc, {
        ...(currentPageData || {}),
        authSessionPlayerId,
        challengePickerOpen,
        disableProfileViewTracking: true,
        sharePanelState,
        commentPanelState,
      });
      return;
    }

    const challengeGameBtn = event.target.closest("[data-challenge-game]");
    if (challengeGameBtn) {
      const gameSlug = challengeGameBtn.dataset.challengeGame;
      const gameTitle = challengeGameBtn.dataset.challengeGameTitle || gameSlug;
      const targetPlayerId = challengeGameBtn.dataset.challengeTarget;
      const currentProfile = loadFactoryProfile(storage);
      if (!gameSlug || !targetPlayerId || !authSession?.playerId) return;
      challengeGameBtn.disabled = true;
      const notifApi = createNotificationsApiClient();
      const challenge = await notifApi.sendChallenge(
        targetPlayerId,
        gameSlug,
        gameTitle,
        currentProfile.profileName || "UNNAMED PILOT",
      );
      challengePickerOpen = false;
      renderPage(doc, {
        ...(currentPageData || {}),
        authSessionPlayerId,
        challengePickerOpen,
        gestureFlash: challenge ? `${gameTitle} challenge sent!` : "Could not send challenge — please try again.",
        disableProfileViewTracking: true,
        sharePanelState,
        commentPanelState,
      });
      return;
    }

    const gestureButton = event.target.closest("[data-gesture]");
    if (gestureButton) {
      const gestureType = gestureButton.dataset.gesture;
      const targetPlayerId = gestureButton.dataset.gestureTarget;
      const currentProfile = loadFactoryProfile(storage);
      if (!gestureType || !targetPlayerId || !authSession?.playerId) return;
      gestureButton.disabled = true;
      const notifApi = createNotificationsApiClient();
      const ok = await notifApi.sendGesture(targetPlayerId, gestureType, currentProfile.profileName || "UNNAMED PILOT");
      gestureButton.disabled = false;
      renderPage(doc, {
        ...(currentPageData || {}),
        authSessionPlayerId,
        gestureFlash: ok ? "Gesture sent!" : "Could not send gesture — please try again.",
        disableProfileViewTracking: true,
        sharePanelState,
        commentPanelState,
      });
      return;
    }

    const addFriendButton = event.target.closest("[data-add-friend]");
    if (addFriendButton) {
      const targetPlayerId = addFriendButton.dataset.addFriend;
      const currentProfile = loadFactoryProfile(storage);
      if (!targetPlayerId || !currentProfile.playerId || currentProfile.playerId === targetPlayerId) {
        return;
      }

      // authenticated users send a friend request; guests fall back to local link
      if (authSession?.playerId) {
        addFriendButton.disabled = true;
        const notifApi = createNotificationsApiClient();
        const request = await notifApi.sendFriendRequest(
          targetPlayerId,
          currentProfile.profileName || "UNNAMED PILOT",
        );
        addFriendButton.disabled = false;
        profilePanel?.render?.("");
        renderPage(doc, {
          ...(currentPageData || {}),
          authSessionPlayerId,
          relationshipFlash: request ? "Friend request sent." : "Could not send request — please try again.",
          disableProfileViewTracking: true,
          sharePanelState,
          commentPanelState,
        });
        return;
      }

      const result = await createFriendshipBetweenPlayers(currentProfile.playerId, targetPlayerId, {
        storage,
        apiClient: null,
      });
      currentPageData = {
        ...(currentPageData || {}),
        profile: currentPageData?.profile,
        thoughtFeed: currentPageData?.thoughtFeed || loadThoughtFeed(storage),
        metricsRecord: currentPageData?.metricsRecord,
        relationshipsRecord: result.rightRecord,
        viewerRelationshipsRecord: result.leftRecord,
      };
      profilePanel?.render?.("");
      renderPage(doc, {
        ...currentPageData,
        relationshipFlash: result.awarded ? "Friend linked." : "Already linked as friends.",
        disableProfileViewTracking: true,
        sharePanelState,
      });
      return;
    }

    const unfriendButton = event.target.closest("[data-unfriend]");
    if (unfriendButton) {
      const targetPlayerId = unfriendButton.dataset.unfriend;
      const currentProfile = loadFactoryProfile(storage);
      if (!targetPlayerId || !currentProfile.playerId || currentProfile.playerId === targetPlayerId) {
        return;
      }

      unfriendButton.disabled = true;
      await removeFriendBetweenPlayers(currentProfile.playerId, targetPlayerId, { storage, apiClient });
      unfriendButton.disabled = false;

      const updatedProfile = loadFactoryProfile(storage);
      const cleanedFriendsPreview = (updatedProfile.friendsPreview || []).filter(
        (f) => f.playerId !== targetPlayerId,
      );
      const cleanedMainSqueeze = updatedProfile.mainSqueeze?.playerId === targetPlayerId
        ? null
        : (updatedProfile.mainSqueeze || null);
      saveFactoryProfile({ ...updatedProfile, friendsPreview: cleanedFriendsPreview, mainSqueeze: cleanedMainSqueeze }, storage);

      const freshViewerRel = loadProfileRelationshipsRecord(currentProfile.playerId, storage);
      currentPageData = {
        ...(currentPageData || {}),
        profile: currentPageData?.profile,
        thoughtFeed: currentPageData?.thoughtFeed || loadThoughtFeed(storage),
        metricsRecord: currentPageData?.metricsRecord,
        relationshipsRecord: currentPageData?.relationshipsRecord,
        viewerRelationshipsRecord: freshViewerRel,
      };
      profilePanel?.render?.("");
      renderPage(doc, {
        ...currentPageData,
        relationshipFlash: "Friendship removed.",
        disableProfileViewTracking: true,
        sharePanelState,
        commentPanelState,
      });
      return;
    }

    const messageButton = event.target.closest("[data-message]");
    if (messageButton) {
      const targetPlayerId = messageButton.dataset.message;
      const targetName = messageButton.dataset.messageName || "";
      if (!targetPlayerId) return;
      const params = new URLSearchParams({ player: targetPlayerId });
      if (targetName) params.set("name", targetName);
      globalThis.location.assign(`../messages/conversation/index.html?${params.toString()}`);
      return;
    }

    const commentButton = event.target.closest("[data-comment-thought-id]");
    if (commentButton) {
      const thoughtId = commentButton.dataset.commentThoughtId || "";
      const cardId = commentButton.dataset.commentCardId || "";
      const currentProfile = loadFactoryProfile(storage);
      if (!thoughtId || !currentProfile?.playerId) return;
      if (commentPanelState.cardId === cardId) {
        commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
        void rerender();
        return;
      }
      void openCommentSheet(cardId, thoughtId);
      return;
    }

    const shareButton = event.target.closest("[data-share-thought-id]");
    if (shareButton) {
      const thoughtId = shareButton.dataset.shareThoughtId;
      const cardId = shareButton.dataset.shareCardId || "";
      const currentProfile = loadFactoryProfile(storage);
      if (!thoughtId || !currentProfile?.playerId) return;
      openReactionThoughtId = "";
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      sharePanelState = sharePanelState.cardId === cardId
        ? { cardId: "", thoughtId: "", mode: "", caption: "" }
        : { cardId, thoughtId, mode: "", caption: "" };
      void rerender();
      return;
    }

    const shareNowButton = event.target.closest("[data-share-now-thought-id]");
    if (shareNowButton) {
      const thoughtId = shareNowButton.dataset.shareNowThoughtId;
      const currentProfile = loadFactoryProfile(storage);
      if (!thoughtId || !currentProfile?.playerId) return;
      await shareThoughtPostWithApi(thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, storage, { apiClient });
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      openReactionThoughtId = "";
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender();
      return;
    }

    const openShareCaptionButton = event.target.closest("[data-open-share-caption]");
    if (openShareCaptionButton) {
      sharePanelState = {
        cardId: openShareCaptionButton.dataset.shareCardId || "",
        thoughtId: openShareCaptionButton.dataset.openShareCaption || "",
        mode: "caption",
        caption: sharePanelState.thoughtId === (openShareCaptionButton.dataset.openShareCaption || "")
          ? sharePanelState.caption
          : "",
      };
      openReactionThoughtId = "";
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender();
      return;
    }

    const closeShareSheetButton = event.target.closest("[data-close-share-sheet]");
    if (closeShareSheetButton) {
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      void rerender();
      return;
    }

    const closeCommentSheetButton = event.target.closest("[data-close-comment-sheet]");
    if (closeCommentSheetButton) {
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender();
      return;
    }

    const toggleButton = event.target.closest("[data-toggle-thought-reactions]");
    if (toggleButton) {
      const thoughtId = toggleButton.dataset.toggleThoughtReactions || "";
      openReactionThoughtId = openReactionThoughtId === thoughtId ? "" : thoughtId;
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      const pageData = currentPageData || await loadPageData({ storage, apiClient });
      currentPageData = pageData;
      profilePanel?.render?.("");
      renderPage(doc, {
        ...pageData,
        disableProfileViewTracking: true,
        openReactionThoughtId,
        sharePanelState,
        commentPanelState,
      });
      return;
    }

    const reactionButton = event.target.closest("[data-react-thought-id]");
    if (reactionButton) {
      const thoughtId = reactionButton.dataset.reactThoughtId;
      const reactionId = reactionButton.dataset.thoughtReactionId;
      const currentProfile = loadFactoryProfile(storage);
      if (!thoughtId || !reactionId || !currentProfile?.playerId) return;
      await reactToThoughtPostWithApi(thoughtId, currentProfile.playerId, reactionId, storage, { apiClient });
      openReactionThoughtId = "";
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender();
      return;
    }

    const button = event.target.closest("[data-delete-id]");
    if (!button) {
      if (!event.target.closest(".thought-card__reaction-picker") && openReactionThoughtId) {
        openReactionThoughtId = "";
        const pageData = currentPageData || await loadPageData({ storage, apiClient });
        currentPageData = pageData;
        profilePanel?.render?.("");
        renderPage(doc, {
          ...pageData,
          disableProfileViewTracking: true,
          openReactionThoughtId,
          sharePanelState,
          commentPanelState,
        });
        return;
      }
      if (!event.target.closest(".thought-card__share-sheet") && sharePanelState.cardId) {
        sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
        const pageData = currentPageData || await loadPageData({ storage, apiClient });
        currentPageData = pageData;
        profilePanel?.render?.("");
        renderPage(doc, {
          ...pageData,
          disableProfileViewTracking: true,
          openReactionThoughtId,
          sharePanelState,
          commentPanelState,
        });
        return;
      }
      if (!event.target.closest(".thought-card__comment-sheet") && commentPanelState.cardId) {
        commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
        const pageData = currentPageData || await loadPageData({ storage, apiClient });
        currentPageData = pageData;
        profilePanel?.render?.("");
        renderPage(doc, {
          ...pageData,
          disableProfileViewTracking: true,
          openReactionThoughtId,
          sharePanelState,
          commentPanelState,
        });
      }
      return;
    }

    const id = button.dataset.deleteId;
    if (!id) return;

    const currentProfile = loadFactoryProfile(storage);
    await deleteThoughtPostWithApi(id, storage, { apiClient });
    const updatedThoughtCount = buildPlayerThoughtFeed(loadThoughtFeed(storage), currentProfile.playerId).length;
    syncThoughtPostCountWithApi(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
    void rerender();
  });

  doc.addEventListener("click", (event) => {
    const clearThoughtPhotoButton = event.target.closest("[data-clear-thought-photo]");
    if (clearThoughtPhotoButton) {
      closeThoughtPhotoComposer();
      void rerender();
      return;
    }

    const cancelGalleryButton = event.target.closest("[data-cancel-gallery-upload]");
    if (!cancelGalleryButton) return;
    closeGalleryComposer("");
    void rerender();
  });

  doc.addEventListener("change", (event) => {
    if (event.target?.id === "playerThoughtPhotoInput") {
      const file = event.target.files?.[0] || null;
      if (!file) {
        closeThoughtPhotoComposer();
        void rerender();
        return;
      }
      revokeThoughtPreview();
      pendingThoughtPhoto = file;
      thoughtPhotoState = {
        previewUrl: globalThis.URL?.createObjectURL ? globalThis.URL.createObjectURL(file) : "",
        fileName: file.name || "Selected photo",
        caption: "",
        visibility: "public",
        saveToGallery: true,
      };
      const nameEl = doc.getElementById("playerThoughtPhotoName");
      if (nameEl) nameEl.textContent = file ? file.name : "";
      void rerender();
      return;
    }

    if (event.target?.id === "playerThoughtVisibility") {
      thoughtPhotoState = { ...thoughtPhotoState, visibility: event.target.value || "public" };
      return;
    }

    if (event.target?.id === "playerThoughtSaveToGallery") {
      thoughtPhotoState = { ...thoughtPhotoState, saveToGallery: !!event.target.checked };
      return;
    }

    if (event.target?.id === "playerGalleryFileInput") {
      const file = event.target.files?.[0] || null;
      if (!file) return;
      revokeGalleryPreview();
      pendingGalleryPhoto = file;
      galleryUploadState = {
        previewUrl: globalThis.URL?.createObjectURL ? globalThis.URL.createObjectURL(file) : "",
        fileName: file.name || "Selected photo",
        caption: "",
        visibility: "public",
        postToFeed: false,
        statusMessage: "",
      };
      void rerender();
      return;
    }

    if (event.target?.id === "playerGalleryVisibility") {
      galleryUploadState = { ...galleryUploadState, visibility: event.target.value || "public" };
      return;
    }

    if (event.target?.id === "playerGalleryPostToFeed") {
      galleryUploadState = { ...galleryUploadState, postToFeed: !!event.target.checked };
    }
  });

  doc.addEventListener("click", (event) => {
    const deletePhotoBtn = event.target.closest("[data-delete-photo-id]");
    if (deletePhotoBtn) {
      const photoId = deletePhotoBtn.dataset.deletePhotoId;
      const targetId = currentPageData?.profile?.playerId || "";
      if (!photoId || !targetId || !apiClient?.deletePlayerPhoto) return;
      apiClient.deletePlayerPhoto(targetId, photoId).then(async () => {
        await loadGallery(targetId);
        void rerender();
      }).catch(() => {});
    }
  }, true);

  doc.addEventListener("input", (event) => {
    const captionInput = event.target.closest("[data-share-caption-input]");
    if (captionInput) {
      sharePanelState = { ...sharePanelState, caption: captionInput.value || "" };
      return;
    }
    if (event.target?.id === "playerThoughtPhotoCaption") {
      thoughtPhotoState = { ...thoughtPhotoState, caption: event.target.value || "" };
      return;
    }
    if (event.target?.id === "playerGalleryCaption") {
      galleryUploadState = { ...galleryUploadState, caption: event.target.value || "" };
      return;
    }
    const commentInput = event.target.closest("[data-comment-input]");
    if (!commentInput) return;
    commentPanelState = { ...commentPanelState, text: commentInput.value || "" };
  });
}
