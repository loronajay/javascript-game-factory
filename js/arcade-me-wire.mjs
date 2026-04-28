import { hydrateArcadeProfileFromApi } from "./arcade-profile.mjs";
import { loadFactoryProfile, saveFactoryProfile } from "./platform/identity/factory-profile.mjs";
import {
  loadProfileMetricsRecord,
  syncThoughtPostCountWithApi,
} from "./platform/metrics/metrics.mjs";
import {
  loadProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
} from "./platform/relationships/relationships.mjs";
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

export function wireMePage(doc, renderPage, addFriendByCode, { storage, apiClient, profilePanel, authClient }) {
  let openReactionThoughtId = "";
  let sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
  let commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
  let cachedHydration = null;

  const rerender = async (thoughtComposerFlash = "", shouldHydrate = false, friendCodeFlash = "") => {
    const currentProfile = loadFactoryProfile(storage);
    const thoughtFeed = shouldHydrate
      ? await syncThoughtFeedFromApi(storage, apiClient, currentProfile.playerId)
      : loadThoughtFeed(storage);
    if (!cachedHydration) {
      const fetched = await hydrateArcadeProfileFromApi(storage, apiClient);
      if (!fetched.error && fetched.profile) cachedHydration = fetched;
    }
    const hydrated = cachedHydration ?? {
      profile: currentProfile,
      metricsRecord: loadProfileMetricsRecord(currentProfile.playerId, storage),
      relationshipsRecord: loadProfileRelationshipsRecord(currentProfile.playerId, storage),
    };

    let enrichedProfile = hydrated.profile;
    if (apiClient?.loadPlayerProfile) {
      const normalizedRel = normalizeProfileRelationshipsRecord(
        hydrated.relationshipsRecord?.playerId
          ? hydrated.relationshipsRecord
          : { playerId: currentProfile.playerId },
      );
      const knownIds = new Set((enrichedProfile?.friendsPreview || []).map((f) => f.playerId).filter(Boolean));
      const missingIds = normalizedRel.friendPlayerIds.filter((id) => !knownIds.has(id)).slice(0, 8);
      if (missingIds.length > 0) {
        const fetched = await Promise.all(missingIds.map((id) => apiClient.loadPlayerProfile(id).catch(() => null)));
        const extra = fetched.filter((p) => p?.playerId).map((p) => ({
          playerId: p.playerId,
          profileName: p.profileName || "Arcade Pilot",
          presence: p.presence || "offline",
          friendPoints: normalizedRel.friendPointsByPlayerId[p.playerId] || 0,
          avatarUrl: p.avatarUrl || "",
        }));
        if (extra.length > 0) {
          enrichedProfile = { ...enrichedProfile, friendsPreview: [...(enrichedProfile?.friendsPreview || []), ...extra] };
          saveFactoryProfile(enrichedProfile, storage);
        }
      }
    }

    profilePanel?.render?.("");
    renderPage(doc, enrichedProfile, {
      thoughtFeed,
      thoughtComposerFlash,
      friendCodeFlash,
      metricsRecord: hydrated.metricsRecord,
      relationshipsRecord: hydrated.relationshipsRecord,
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

  void rerender("", true);

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

  doc.getElementById("playerProfileForm")?.addEventListener("submit", () => {
    cachedHydration = null;
    queueMicrotask(() => { void rerender(); });
  });

  doc.getElementById("playerProfileClear")?.addEventListener("click", () => {
    cachedHydration = null;
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
      if (!sharePanelState.thoughtId || !currentProfile?.playerId) {
        return;
      }
      await shareThoughtPostWithApi(sharePanelState.thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, storage, { apiClient, caption: sharePanelState.caption });
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender();
      return;
    }

    if (form && typeof form === "object" && form.id === "meFriendCodeForm") {
      event.preventDefault();
      const input = doc.getElementById("meFriendCodeInput");
      const outcome = await addFriendByCode(input?.value || "", { storage, apiClient });
      void rerender("", false, outcome.message);
      return;
    }

    if (!form || typeof form !== "object" || form.id !== "meThoughtComposer") {
      return;
    }

    event.preventDefault();
    const currentProfile = loadFactoryProfile(storage);
    const subjectInput = doc.getElementById("meThoughtSubject");
    const bodyInput = doc.getElementById("meThoughtBody");
    const saved = await publishThoughtPostWithApi({
      authorPlayerId: currentProfile.playerId,
      authorDisplayName: currentProfile.profileName || "UNNAMED PILOT",
      subject: subjectInput?.value || "",
      text: bodyInput?.value || "",
      visibility: "public",
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
      void rerender();
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
        void rerender();
        return;
      }
      if (!event.target.closest(".thought-card__share-sheet") && sharePanelState.cardId) {
        sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
        void rerender();
        return;
      }
      if (!event.target.closest(".thought-card__comment-sheet") && commentPanelState.cardId) {
        commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
        void rerender();
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
