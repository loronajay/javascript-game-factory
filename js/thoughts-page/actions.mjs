import {
  commentOnThoughtPostWithApi,
  loadThoughtComments,
  loadThoughtFeed,
  reactToThoughtPostWithApi,
  shareThoughtPostWithApi,
  syncThoughtCommentsFromApi,
} from "../platform/thoughts/thoughts.mjs";

export function createThoughtsPageActions({
  storage,
  apiClient,
  loadCurrentProfile,
  rerender,
  loadThoughtFeedImpl = loadThoughtFeed,
  loadThoughtCommentsImpl = loadThoughtComments,
  syncThoughtCommentsFromApiImpl = syncThoughtCommentsFromApi,
  shareThoughtPostWithApiImpl = shareThoughtPostWithApi,
  reactToThoughtPostWithApiImpl = reactToThoughtPostWithApi,
  commentOnThoughtPostWithApiImpl = commentOnThoughtPostWithApi,
} = {}) {
  let currentProfile = loadCurrentProfile?.();
  let openReactionThoughtId = "";
  let sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
  let commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };

  function getViewState() {
    return {
      openReactionThoughtId,
      sharePanelState,
      commentPanelState,
    };
  }

  function refreshCurrentProfile() {
    currentProfile = loadCurrentProfile?.();
    return currentProfile;
  }

  async function rerenderWithFeed() {
    const thoughtFeed = loadThoughtFeedImpl(storage);
    await Promise.resolve(rerender?.(thoughtFeed));
  }

  async function openCommentSheet(cardId, thoughtId) {
    commentPanelState = {
      cardId,
      thoughtId,
      text: "",
      comments: loadThoughtCommentsImpl(thoughtId, storage),
    };
    openReactionThoughtId = "";
    sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
    await rerenderWithFeed();

    const remoteComments = await syncThoughtCommentsFromApiImpl(thoughtId, storage, apiClient);
    if (commentPanelState.cardId !== cardId || commentPanelState.thoughtId !== thoughtId) {
      return;
    }

    commentPanelState = {
      ...commentPanelState,
      comments: remoteComments,
    };
    await rerenderWithFeed();
  }

  async function handleClick(event) {
    refreshCurrentProfile();

    const commentButton = event.target.closest("[data-comment-thought-id]");
    if (commentButton) {
      const thoughtId = commentButton.dataset.commentThoughtId || "";
      const cardId = commentButton.dataset.commentCardId || "";
      if (!thoughtId || !currentProfile?.playerId) return true;

      if (commentPanelState.cardId === cardId) {
        commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
        await rerenderWithFeed();
        return true;
      }

      await openCommentSheet(cardId, thoughtId);
      return true;
    }

    const shareButton = event.target.closest("[data-share-thought-id]");
    if (shareButton) {
      const thoughtId = shareButton.dataset.shareThoughtId;
      const cardId = shareButton.dataset.shareCardId || "";
      if (!thoughtId || !currentProfile?.playerId) return true;

      openReactionThoughtId = "";
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      sharePanelState = sharePanelState.cardId === cardId
        ? { cardId: "", thoughtId: "", mode: "", caption: "" }
        : { cardId, thoughtId, mode: "", caption: "" };
      await rerenderWithFeed();
      return true;
    }

    const shareNowButton = event.target.closest("[data-share-now-thought-id]");
    if (shareNowButton) {
      const thoughtId = shareNowButton.dataset.shareNowThoughtId;
      if (!thoughtId || !currentProfile?.playerId) return true;

      await shareThoughtPostWithApiImpl(thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, storage, {
        apiClient,
      });
      openReactionThoughtId = "";
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      await rerenderWithFeed();
      return true;
    }

    const openShareCaptionButton = event.target.closest("[data-open-share-caption]");
    if (openShareCaptionButton) {
      const thoughtId = openShareCaptionButton.dataset.openShareCaption || "";
      const cardId = openShareCaptionButton.dataset.shareCardId || "";
      sharePanelState = {
        cardId,
        thoughtId,
        mode: "caption",
        caption: sharePanelState.thoughtId === thoughtId ? sharePanelState.caption : "",
      };
      openReactionThoughtId = "";
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      await rerenderWithFeed();
      return true;
    }

    const closeShareSheetButton = event.target.closest("[data-close-share-sheet]");
    if (closeShareSheetButton) {
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      await rerenderWithFeed();
      return true;
    }

    const closeCommentSheetButton = event.target.closest("[data-close-comment-sheet]");
    if (closeCommentSheetButton) {
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      await rerenderWithFeed();
      return true;
    }

    const toggleButton = event.target.closest("[data-toggle-thought-reactions]");
    if (toggleButton) {
      const thoughtId = toggleButton.dataset.toggleThoughtReactions || "";
      openReactionThoughtId = openReactionThoughtId === thoughtId ? "" : thoughtId;
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      await rerenderWithFeed();
      return true;
    }

    const reactionButton = event.target.closest("[data-react-thought-id]");
    if (reactionButton) {
      const thoughtId = reactionButton.dataset.reactThoughtId;
      const reactionId = reactionButton.dataset.thoughtReactionId;
      if (!thoughtId || !reactionId || !currentProfile?.playerId) return true;

      await reactToThoughtPostWithApiImpl(thoughtId, currentProfile.playerId, reactionId, storage, {
        apiClient,
      });
      openReactionThoughtId = "";
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      await rerenderWithFeed();
      return true;
    }

    if (!event.target.closest(".thought-card__reaction-picker") && openReactionThoughtId) {
      openReactionThoughtId = "";
      await rerenderWithFeed();
      return true;
    }

    if (!event.target.closest(".thought-card__share-sheet") && sharePanelState.cardId) {
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      await rerenderWithFeed();
      return true;
    }

    if (!event.target.closest(".thought-card__comment-sheet") && commentPanelState.cardId) {
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      await rerenderWithFeed();
      return true;
    }

    return false;
  }

  function handleInput(event) {
    const captionInput = event.target.closest("[data-share-caption-input]");
    if (captionInput) {
      sharePanelState = {
        ...sharePanelState,
        caption: captionInput.value || "",
      };
      return true;
    }

    const commentInput = event.target.closest("[data-comment-input]");
    if (!commentInput) return false;
    commentPanelState = {
      ...commentPanelState,
      text: commentInput.value || "",
    };
    return true;
  }

  async function handleSubmit(form, event = null) {
    refreshCurrentProfile();
    if (!form || typeof form !== "object") {
      return false;
    }

    if (form.matches?.("[data-share-caption-form]")) {
      event?.preventDefault?.();
      if (!sharePanelState.thoughtId || !currentProfile?.playerId) {
        return true;
      }

      await shareThoughtPostWithApiImpl(sharePanelState.thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, storage, {
        apiClient,
        caption: sharePanelState.caption,
      });
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      await rerenderWithFeed();
      return true;
    }

    if (!form.matches?.("[data-comment-form]")) {
      return false;
    }

    event?.preventDefault?.();
    if (!commentPanelState.thoughtId || !currentProfile?.playerId || !commentPanelState.text.trim()) {
      return true;
    }

    await commentOnThoughtPostWithApiImpl(commentPanelState.thoughtId, {
      playerId: currentProfile.playerId,
      profileName: currentProfile.profileName || "UNNAMED PILOT",
    }, commentPanelState.text, storage, {
      apiClient,
    });
    commentPanelState = {
      ...commentPanelState,
      text: "",
      comments: loadThoughtCommentsImpl(commentPanelState.thoughtId, storage),
    };
    await rerenderWithFeed();
    return true;
  }

  return {
    getViewState,
    handleClick,
    handleInput,
    handleSubmit,
  };
}
