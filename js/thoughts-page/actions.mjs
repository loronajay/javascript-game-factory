import { commentOnThoughtPostWithApi, loadThoughtComments, loadThoughtFeed, reactToThoughtPostWithApi, shareThoughtPostWithApi, syncThoughtCommentsFromApi, } from "../platform/thoughts/thoughts.mjs";
function emptySharePanelState() {
    return { cardId: "", thoughtId: "", mode: "", caption: "" };
}
function emptyCommentPanelState() {
    return { cardId: "", thoughtId: "", text: "", comments: [] };
}
function closestEl(event, selector) {
    const target = event.target;
    return target?.closest(selector) ?? null;
}
function closestField(event, selector) {
    const target = event.target;
    return target?.closest(selector) ?? null;
}
export function createThoughtsPageActions({ storage, apiClient, loadCurrentProfile, rerender, loadThoughtFeedImpl = loadThoughtFeed, loadThoughtCommentsImpl = loadThoughtComments, syncThoughtCommentsFromApiImpl = syncThoughtCommentsFromApi, shareThoughtPostWithApiImpl = shareThoughtPostWithApi, reactToThoughtPostWithApiImpl = reactToThoughtPostWithApi, commentOnThoughtPostWithApiImpl = commentOnThoughtPostWithApi, } = {}) {
    let currentProfile = loadCurrentProfile?.();
    let openReactionThoughtId = "";
    let sharePanelState = emptySharePanelState();
    let commentPanelState = emptyCommentPanelState();
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
        sharePanelState = emptySharePanelState();
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
        const commentButton = closestEl(event, "[data-comment-thought-id]");
        if (commentButton) {
            const thoughtId = commentButton.dataset.commentThoughtId || "";
            const cardId = commentButton.dataset.commentCardId || "";
            if (!thoughtId || !currentProfile?.playerId)
                return true;
            if (commentPanelState.cardId === cardId) {
                commentPanelState = emptyCommentPanelState();
                await rerenderWithFeed();
                return true;
            }
            await openCommentSheet(cardId, thoughtId);
            return true;
        }
        const shareButton = closestEl(event, "[data-share-thought-id]");
        if (shareButton) {
            const thoughtId = shareButton.dataset.shareThoughtId || "";
            const cardId = shareButton.dataset.shareCardId || "";
            if (!thoughtId || !currentProfile?.playerId)
                return true;
            openReactionThoughtId = "";
            commentPanelState = emptyCommentPanelState();
            sharePanelState = sharePanelState.cardId === cardId
                ? emptySharePanelState()
                : { cardId, thoughtId, mode: "", caption: "" };
            await rerenderWithFeed();
            return true;
        }
        const shareNowButton = closestEl(event, "[data-share-now-thought-id]");
        if (shareNowButton) {
            const thoughtId = shareNowButton.dataset.shareNowThoughtId || "";
            if (!thoughtId || !currentProfile?.playerId)
                return true;
            await shareThoughtPostWithApiImpl(thoughtId, {
                playerId: currentProfile.playerId,
                profileName: currentProfile.profileName || "UNNAMED PILOT",
            }, storage, {
                apiClient,
            });
            openReactionThoughtId = "";
            sharePanelState = emptySharePanelState();
            commentPanelState = emptyCommentPanelState();
            await rerenderWithFeed();
            return true;
        }
        const openShareCaptionButton = closestEl(event, "[data-open-share-caption]");
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
            commentPanelState = emptyCommentPanelState();
            await rerenderWithFeed();
            return true;
        }
        const closeShareSheetButton = closestEl(event, "[data-close-share-sheet]");
        if (closeShareSheetButton) {
            sharePanelState = emptySharePanelState();
            await rerenderWithFeed();
            return true;
        }
        const closeCommentSheetButton = closestEl(event, "[data-close-comment-sheet]");
        if (closeCommentSheetButton) {
            commentPanelState = emptyCommentPanelState();
            await rerenderWithFeed();
            return true;
        }
        const toggleButton = closestEl(event, "[data-toggle-thought-reactions]");
        if (toggleButton) {
            const thoughtId = toggleButton.dataset.toggleThoughtReactions || "";
            openReactionThoughtId = openReactionThoughtId === thoughtId ? "" : thoughtId;
            sharePanelState = emptySharePanelState();
            commentPanelState = emptyCommentPanelState();
            await rerenderWithFeed();
            return true;
        }
        const reactionButton = closestEl(event, "[data-react-thought-id]");
        if (reactionButton) {
            const thoughtId = reactionButton.dataset.reactThoughtId || "";
            const reactionId = reactionButton.dataset.thoughtReactionId || "";
            if (!thoughtId || !reactionId || !currentProfile?.playerId)
                return true;
            await reactToThoughtPostWithApiImpl(thoughtId, currentProfile.playerId, reactionId, storage, {
                apiClient,
            });
            openReactionThoughtId = "";
            sharePanelState = emptySharePanelState();
            commentPanelState = emptyCommentPanelState();
            await rerenderWithFeed();
            return true;
        }
        const target = event.target;
        if (!target?.closest(".thought-card__reaction-picker") && openReactionThoughtId) {
            openReactionThoughtId = "";
            await rerenderWithFeed();
            return true;
        }
        if (!target?.closest(".thought-card__share-sheet") && sharePanelState.cardId) {
            sharePanelState = emptySharePanelState();
            await rerenderWithFeed();
            return true;
        }
        if (!target?.closest(".thought-card__comment-sheet") && commentPanelState.cardId) {
            commentPanelState = emptyCommentPanelState();
            await rerenderWithFeed();
            return true;
        }
        return false;
    }
    function handleInput(event) {
        const captionInput = closestField(event, "[data-share-caption-input]");
        if (captionInput) {
            sharePanelState = {
                ...sharePanelState,
                caption: captionInput.value || "",
            };
            return true;
        }
        const commentInput = closestField(event, "[data-comment-input]");
        if (!commentInput)
            return false;
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
        const formEl = form;
        if (formEl.matches?.("[data-share-caption-form]")) {
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
            sharePanelState = emptySharePanelState();
            commentPanelState = emptyCommentPanelState();
            await rerenderWithFeed();
            return true;
        }
        if (!formEl.matches?.("[data-comment-form]")) {
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
