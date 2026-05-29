import type { CommentLike, SharePanelState, CommentPanelState, SocialViewState } from "./social-view-shared.mjs";

interface ProfileLike {
  playerId?: string;
  profileName?: string;
}

export interface ProfileSocialActionsOptions {
  loadCurrentProfile?: () => ProfileLike | null | undefined;
  loadThoughtComments?: (thoughtId: string) => unknown;
  syncThoughtComments?: (thoughtId: string) => unknown;
  commentOnThought?: (thoughtId: string, profile: ProfileLike, text: string) => unknown;
  shareThought?: (thoughtId: string, profile: ProfileLike, caption: string) => unknown;
  reactToThought?: (thoughtId: string, reactionId: string, profile: ProfileLike) => unknown;
  deleteThought?: (thoughtId: string, profile: ProfileLike | null | undefined) => unknown;
  rerenderView?: () => unknown;
  rerenderPanels?: () => unknown;
  afterDelete?: (thoughtId: string, profile: ProfileLike | null | undefined) => unknown;
}

function createInitialSharePanelState(): SharePanelState {
  return { cardId: "", thoughtId: "", mode: "", caption: "" };
}

function createInitialCommentPanelState(): CommentPanelState {
  return { cardId: "", thoughtId: "", text: "", comments: [] };
}

function normalizeComments(comments: unknown): CommentLike[] {
  return Array.isArray(comments) ? (comments as CommentLike[]) : [];
}

export function createProfileSocialActions({
  loadCurrentProfile,
  loadThoughtComments,
  syncThoughtComments,
  commentOnThought,
  shareThought,
  reactToThought,
  deleteThought,
  rerenderView,
  rerenderPanels,
  afterDelete,
}: ProfileSocialActionsOptions = {}) {
  let openReactionThoughtId = "";
  let sharePanelState = createInitialSharePanelState();
  let commentPanelState = createInitialCommentPanelState();

  function resetSharePanel() {
    sharePanelState = createInitialSharePanelState();
    return sharePanelState;
  }

  function resetCommentPanel() {
    commentPanelState = createInitialCommentPanelState();
    return commentPanelState;
  }

  async function renderView() {
    return rerenderView?.();
  }

  async function renderPanels() {
    return (rerenderPanels || rerenderView)?.();
  }

  return {
    getViewState(): SocialViewState {
      return {
        openReactionThoughtId,
        sharePanelState,
        commentPanelState,
      };
    },

    async openCommentSheet(cardId: string, thoughtId: string): Promise<boolean> {
      commentPanelState = {
        cardId,
        thoughtId,
        text: "",
        comments: normalizeComments(loadThoughtComments?.(thoughtId)),
      };
      openReactionThoughtId = "";
      resetSharePanel();
      await renderView();

      const remoteComments = normalizeComments(await syncThoughtComments?.(thoughtId));
      if (commentPanelState.cardId !== cardId || commentPanelState.thoughtId !== thoughtId) {
        return false;
      }

      commentPanelState = {
        ...commentPanelState,
        comments: remoteComments,
      };
      await renderView();
      return true;
    },

    handleInput(event: Event): boolean {
      const target = event?.target as Element | null;
      const captionInput = target?.closest<HTMLTextAreaElement>("[data-share-caption-input]");
      if (captionInput) {
        sharePanelState = {
          ...sharePanelState,
          caption: captionInput.value || "",
        };
        return true;
      }

      const commentInput = target?.closest<HTMLTextAreaElement>("[data-comment-input]");
      if (commentInput) {
        commentPanelState = {
          ...commentPanelState,
          text: commentInput.value || "",
        };
        return true;
      }

      return false;
    },

    async handleSubmit(form: EventTarget | null): Promise<boolean> {
      const formEl = form as Element | null;
      if (formEl && typeof formEl === "object" && formEl.matches?.("[data-comment-form]")) {
        const currentProfile = loadCurrentProfile?.();
        if (!commentPanelState.thoughtId || !currentProfile?.playerId || !commentPanelState.text.trim()) {
          return true;
        }

        await commentOnThought?.(commentPanelState.thoughtId, currentProfile, commentPanelState.text);
        commentPanelState = {
          ...commentPanelState,
          text: "",
          comments: normalizeComments(loadThoughtComments?.(commentPanelState.thoughtId)),
        };
        await renderView();
        return true;
      }

      if (formEl && typeof formEl === "object" && formEl.matches?.("[data-share-caption-form]")) {
        const currentProfile = loadCurrentProfile?.();
        if (!sharePanelState.thoughtId || !currentProfile?.playerId) {
          return true;
        }

        await shareThought?.(sharePanelState.thoughtId, currentProfile, sharePanelState.caption);
        resetSharePanel();
        resetCommentPanel();
        await renderView();
        return true;
      }

      return false;
    },

    async handleClick(event: Event): Promise<boolean> {
      const target = event?.target as Element | null;
      if (!target?.closest) {
        return false;
      }

      const commentButton = target.closest<HTMLElement>("[data-comment-thought-id]");
      if (commentButton) {
        const thoughtId = commentButton.dataset.commentThoughtId || "";
        const cardId = commentButton.dataset.commentCardId || "";
        const currentProfile = loadCurrentProfile?.();
        if (!thoughtId || !currentProfile?.playerId) {
          return true;
        }
        if (commentPanelState.cardId === cardId) {
          resetCommentPanel();
          await renderPanels();
          return true;
        }
        void this.openCommentSheet(cardId, thoughtId);
        return true;
      }

      const shareButton = target.closest<HTMLElement>("[data-share-thought-id]");
      if (shareButton) {
        const thoughtId = shareButton.dataset.shareThoughtId || "";
        const cardId = shareButton.dataset.shareCardId || "";
        const currentProfile = loadCurrentProfile?.();
        if (!thoughtId || !currentProfile?.playerId) {
          return true;
        }
        openReactionThoughtId = "";
        resetCommentPanel();
        sharePanelState = sharePanelState.cardId === cardId
          ? createInitialSharePanelState()
          : { cardId, thoughtId, mode: "", caption: "" };
        await renderPanels();
        return true;
      }

      const shareNowButton = target.closest<HTMLElement>("[data-share-now-thought-id]");
      if (shareNowButton) {
        const thoughtId = shareNowButton.dataset.shareNowThoughtId || "";
        const currentProfile = loadCurrentProfile?.();
        if (!thoughtId || !currentProfile?.playerId) {
          return true;
        }
        await shareThought?.(thoughtId, currentProfile, "");
        resetSharePanel();
        openReactionThoughtId = "";
        resetCommentPanel();
        await renderView();
        return true;
      }

      const openShareCaptionButton = target.closest<HTMLElement>("[data-open-share-caption]");
      if (openShareCaptionButton) {
        const thoughtId = openShareCaptionButton.dataset.openShareCaption || "";
        sharePanelState = {
          cardId: openShareCaptionButton.dataset.shareCardId || "",
          thoughtId,
          mode: "caption",
          caption: sharePanelState.thoughtId === thoughtId ? sharePanelState.caption : "",
        };
        openReactionThoughtId = "";
        resetCommentPanel();
        await renderPanels();
        return true;
      }

      const closeShareSheetButton = target.closest<HTMLElement>("[data-close-share-sheet]");
      if (closeShareSheetButton) {
        resetSharePanel();
        await renderPanels();
        return true;
      }

      const closeCommentSheetButton = target.closest<HTMLElement>("[data-close-comment-sheet]");
      if (closeCommentSheetButton) {
        resetCommentPanel();
        await renderPanels();
        return true;
      }

      const toggleButton = target.closest<HTMLElement>("[data-toggle-thought-reactions]");
      if (toggleButton) {
        const thoughtId = toggleButton.dataset.toggleThoughtReactions || "";
        openReactionThoughtId = openReactionThoughtId === thoughtId ? "" : thoughtId;
        resetSharePanel();
        resetCommentPanel();
        await renderPanels();
        return true;
      }

      const reactionButton = target.closest<HTMLElement>("[data-react-thought-id]");
      if (reactionButton) {
        const thoughtId = reactionButton.dataset.reactThoughtId || "";
        const reactionId = reactionButton.dataset.thoughtReactionId || "";
        const currentProfile = loadCurrentProfile?.();
        if (!thoughtId || !reactionId || !currentProfile?.playerId) {
          return true;
        }
        await reactToThought?.(thoughtId, reactionId, currentProfile);
        openReactionThoughtId = "";
        resetSharePanel();
        resetCommentPanel();
        await renderView();
        return true;
      }

      const deleteButton = target.closest<HTMLElement>("[data-delete-id]");
      if (deleteButton) {
        const thoughtId = deleteButton.dataset.deleteId || "";
        if (!thoughtId) {
          return true;
        }
        const currentProfile = loadCurrentProfile?.();
        await deleteThought?.(thoughtId, currentProfile);
        await afterDelete?.(thoughtId, currentProfile);
        await renderView();
        return true;
      }

      if (!target.closest(".thought-card__reaction-picker") && openReactionThoughtId) {
        openReactionThoughtId = "";
        await renderPanels();
        return true;
      }

      if (!target.closest(".thought-card__share-sheet") && sharePanelState.cardId) {
        resetSharePanel();
        await renderPanels();
        return true;
      }

      if (!target.closest(".thought-card__comment-sheet") && commentPanelState.cardId) {
        resetCommentPanel();
        await renderPanels();
        return true;
      }

      return false;
    },
  };
}
