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
} from "./platform/thoughts/thoughts.mjs";

export function wirePlayerPage(doc, renderPage, loadPageData, { storage, apiClient, profilePanel, authSession }) {
  let currentPageData = null;
  let openReactionThoughtId = "";
  let sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
  let commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };

  const authSessionPlayerId = authSession?.playerId || "";

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
    });
  };

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

  void rerender("", false);

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

    if (!form || typeof form !== "object" || form.id !== "playerThoughtComposer") {
      return;
    }

    event.preventDefault();
    const currentProfile = loadFactoryProfile(storage);
    const subjectInput = doc.getElementById("playerThoughtSubject");
    const bodyInput = doc.getElementById("playerThoughtBody");
    const saved = await publishThoughtPostWithApi({
      authorPlayerId: currentProfile.playerId,
      authorDisplayName: currentProfile.profileName || "UNNAMED PILOT",
      subject: subjectInput?.value || "",
      text: bodyInput?.value || "",
      visibility: "public",
    }, storage);

    if (!saved) {
      void rerender("Write a thought before posting.");
      return;
    }

    const updatedThoughtCount = buildPlayerThoughtFeed(loadThoughtFeed(storage), currentProfile.playerId).length;
    syncThoughtPostCountWithApi(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
    void rerender("Thought posted.");
  });

  doc.addEventListener("click", async (event) => {
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
          relationshipFlash: request ? "Friend request sent." : "Could not send request — please try again.",
          disableProfileViewTracking: true,
          sharePanelState,
          commentPanelState,
        });
        return;
      }

      const result = createFriendshipBetweenPlayers(currentProfile.playerId, targetPlayerId, {
        storage,
        apiClient,
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

      if (authSession?.playerId) {
        unfriendButton.disabled = true;
        await apiClient.removeFriend(authSession.playerId, targetPlayerId).catch(() => null);
        unfriendButton.disabled = false;
      }

      removeFriendBetweenPlayers(currentProfile.playerId, targetPlayerId, { storage, apiClient });

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
    await deleteThoughtPostWithApi(id, storage);
    const updatedThoughtCount = buildPlayerThoughtFeed(loadThoughtFeed(storage), currentProfile.playerId).length;
    syncThoughtPostCountWithApi(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
    void rerender();
  });

  doc.addEventListener("input", (event) => {
    const captionInput = event.target.closest("[data-share-caption-input]");
    if (captionInput) {
      sharePanelState = { ...sharePanelState, caption: captionInput.value || "" };
      return;
    }
    const commentInput = event.target.closest("[data-comment-input]");
    if (!commentInput) return;
    commentPanelState = { ...commentPanelState, text: commentInput.value || "" };
  });
}
