import { hydrateArcadeProfileFromApi, initArcadeProfilePanel } from "./arcade-profile.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import {
  loadProfileMetricsRecord,
  normalizeProfileMetricsRecord,
  syncThoughtPostCountWithApi,
} from "./platform/metrics/metrics.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import {
  buildPlayerProfileView,
  formatProfileFriendCode,
  sanitizeProfileFriendCode,
} from "./platform/profile/profile.mjs";
import {
  buildBadgeItems,
  buildFavoriteGameItems,
  buildFriendItems,
  buildHeroStats,
  buildIdentityLinkItems,
  buildPresenceToneClass,
  buildProfileInitials,
  buildRankingItems,
  formatPresenceLabel,
  titleFromSlug,
} from "./arcade-profile-page-helpers.mjs";
import {
  createFriendshipBetweenPlayers,
  loadProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
  saveProfileRelationshipsRecord,
} from "./platform/relationships/relationships.mjs";
import { getDefaultPlatformStorage } from "./platform/storage/storage.mjs";
import {
  buildPlayerThoughtFeed,
  buildThoughtCardItems,
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
import { renderMePageView } from "./arcade-me-view.mjs";

const DEFAULT_PROFILE_PICTURE_SRC = "../images/default/profile-picture/default.png";

function resolveOwnerPresence(presence) {
  return "online";
}

export async function addFriendByCode(friendCode, options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options.apiClient || createPlatformApiClient();
  const currentProfile = loadFactoryProfile(storage);
  const normalizedFriendCode = sanitizeProfileFriendCode(friendCode);

  if (!normalizedFriendCode) {
    return { ok: false, message: "Enter a friend code first." };
  }

  if (!currentProfile?.playerId) {
    return { ok: false, message: "Your player profile is not ready yet." };
  }

  if (currentProfile.friendCode === normalizedFriendCode) {
    return { ok: false, message: "That is your friend code." };
  }

  if (typeof apiClient?.loadPlayerProfileByFriendCode !== "function") {
    return { ok: false, message: "Friend-code lookup is unavailable right now." };
  }

  const targetProfile = await apiClient.loadPlayerProfileByFriendCode(normalizedFriendCode);
  if (!targetProfile?.playerId) {
    return { ok: false, message: "No player matched that friend code." };
  }

  if (targetProfile.playerId === currentProfile.playerId) {
    return { ok: false, message: "That is your friend code." };
  }

  let result = null;

  if (typeof apiClient?.createFriendshipBetweenPlayers === "function") {
    result = await apiClient.createFriendshipBetweenPlayers(currentProfile.playerId, targetProfile.playerId);
    if (result?.leftRecord?.playerId) {
      saveProfileRelationshipsRecord(result.leftRecord, storage);
    }
    if (result?.rightRecord?.playerId) {
      saveProfileRelationshipsRecord(result.rightRecord, storage);
    }
  }

  if (!result?.leftRecord?.playerId || !result?.rightRecord?.playerId) {
    result = createFriendshipBetweenPlayers(currentProfile.playerId, targetProfile.playerId, {
      storage,
      apiClient,
    });
  }

  const label = targetProfile.profileName || targetProfile.playerId || "that player";
  return {
    ok: true,
    message: result.awarded ? `Friend linked with ${label}.` : `${label} is already linked.`,
    targetProfile,
    relationshipResult: result,
  };
}

export function buildMePageViewModel(profile, options = {}) {
  const publicView = buildPlayerProfileView(profile, options);
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : [];
  const playerThoughtFeed = buildPlayerThoughtFeed(thoughtFeed, publicView.playerId);
  const thoughtItems = buildThoughtCardItems(playerThoughtFeed, {
    placeholderId: "me-thought-placeholder",
    placeholderTitle: "Player Feed Warming Up",
    placeholderSummary: "Your player feed is waiting for the first shared thought. Status posts will land here once personal posting flows come online.",
    isOwner: true,
  });
  const resolvedThoughtCount = Math.max(publicView.thoughtCount, playerThoughtFeed.length);
  const favoriteTitleResolver = typeof options?.favoriteTitleResolver === "function"
    ? options.favoriteTitleResolver
    : titleFromSlug;
  const metricsRecord = options?.metricsRecord?.playerId
    ? normalizeProfileMetricsRecord(options.metricsRecord)
    : normalizeProfileMetricsRecord({ playerId: publicView.playerId });
  const relationshipsRecord = options?.relationshipsRecord?.playerId
    ? normalizeProfileRelationshipsRecord(options.relationshipsRecord)
    : normalizeProfileRelationshipsRecord({ playerId: publicView.playerId });
  const favoriteGameItems = buildFavoriteGameItems(publicView, favoriteTitleResolver, {
    emptyValue: "Pin a go-to cabinet once favorites are wired into the shared player profile.",
  });
  const rankingItems = buildRankingItems(publicView, favoriteTitleResolver, {
    emptyValue: "Rank snapshots will appear here once shared standings come online.",
  });
  const friendItems = buildFriendItems(publicView, relationshipsRecord);

  const heroName = publicView.profileName || "UNNAMED PILOT";
  const heroRealName = publicView.realName || "";
  const heroTagline = publicView.tagline || "No tagline set yet.";
  const heroBio = publicView.bio || "This shared player page will grow into your public home base across the arcade as more platform features come online.";
  const sessionPresence = resolveOwnerPresence(publicView.presence);
  const friendCodeValue = publicView.friendCode || "";

  const identityLinkItems = buildIdentityLinkItems(publicView.links, "Profile links are not wired in yet.");
  const badgeItems = buildBadgeItems(publicView.badgeIds);

  return {
    pageTitle: heroName,
    pageSubtitle: heroTagline,
    heroName,
    heroRealName,
    heroTagline,
    heroBio,
    heroChipLabel: "PLAYER PROFILE",
    isOwnerView: true,
    editButtonLabel: "Edit Profile",
    presenceLabel: formatPresenceLabel(sessionPresence),
    presenceToneClass: buildPresenceToneClass(sessionPresence),
    pageViewCount: String(metricsRecord.profileViewCount),
    friendCodeValue,
    friendCodeDisplay: formatProfileFriendCode(friendCodeValue),
    friendCodeFlashMessage: typeof options?.friendCodeFlash === "string" ? options.friendCodeFlash : "",
    avatarSrc: publicView.avatarUrl || DEFAULT_PROFILE_PICTURE_SRC,
    avatarAlt: `${heroName} portrait`,
    avatarInitials: buildProfileInitials(heroName),
    heroMeta: [
      { label: "Factory ID", value: publicView.playerId || "PENDING-ID" },
      { label: "Status", value: formatPresenceLabel(sessionPresence) },
      { label: "Badges", value: String(publicView.badgeIds.length) },
      { label: "Thoughts", value: String(resolvedThoughtCount) },
    ],
    heroStats: buildHeroStats(publicView, resolvedThoughtCount, metricsRecord),
    avatarAssetId: publicView.avatarAssetId,
    backgroundImageUrl: publicView.backgroundImageUrl,
    identityLinkItems,
    favoriteGameItems,
    rankingItems,
    friendItems,
    thoughtItems,
    thoughtComposer: {
      enabled: true,
      subjectPlaceholder: "Optional headline",
      textPlaceholder: "Share a thought from your profile lane.",
      submitLabel: "Post Thought",
      flashMessage: typeof options?.thoughtComposerFlash === "string" ? options.thoughtComposerFlash : "",
    },
    aboutText: heroBio,
    badgeItems,
  };
}




export function renderMePage(doc = globalThis.document, profile = loadFactoryProfile(), options = {}) {
  if (!doc?.getElementById) return null;

  const storage = options.storage || getDefaultPlatformStorage();
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : loadThoughtFeed(storage);
  const metricsRecord = options?.metricsRecord?.playerId
    ? options.metricsRecord
    : loadProfileMetricsRecord(profile?.playerId, storage);
  const relationshipsRecord = options?.relationshipsRecord?.playerId
    ? options.relationshipsRecord
    : loadProfileRelationshipsRecord(profile?.playerId, storage);
  const model = buildMePageViewModel(profile, {
    thoughtFeed,
    metricsRecord,
    relationshipsRecord,
    thoughtComposerFlash: options?.thoughtComposerFlash || "",
    friendCodeFlash: options?.friendCodeFlash || "",
  });
  renderMePageView(doc, model, options);
  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  const storage = getDefaultPlatformStorage();
  const apiClient = createPlatformApiClient();
  const profilePanel = initArcadeProfilePanel({ storage });
  let openReactionThoughtId = "";
  let sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
  let commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
  renderMePage(doc);

  const rerender = async (thoughtComposerFlash = "", shouldHydrate = false, friendCodeFlash = "") => {
    const currentProfile = loadFactoryProfile(storage);
    const thoughtFeed = shouldHydrate
      ? await syncThoughtFeedFromApi(storage, apiClient, currentProfile.playerId)
      : loadThoughtFeed(storage);
    const hydrated = shouldHydrate
      ? await hydrateArcadeProfileFromApi(storage)
      : {
          profile: currentProfile,
          metricsRecord: loadProfileMetricsRecord(currentProfile.playerId, storage),
          relationshipsRecord: loadProfileRelationshipsRecord(currentProfile.playerId, storage),
        };
    profilePanel?.render?.("");
    renderMePage(doc, hydrated.profile, {
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
    commentPanelState = {
      ...commentPanelState,
      comments: remoteComments,
    };
    await rerender();
  };

  void rerender("", true);

  doc.getElementById("playerProfileForm")?.addEventListener("submit", () => {
    queueMicrotask(() => {
      void rerender("", true);
    });
  });

  doc.getElementById("playerProfileClear")?.addEventListener("click", () => {
    queueMicrotask(() => {
      void rerender("", true);
    });
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
      }, commentPanelState.text, storage, {
        apiClient,
      });
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
      }, storage, {
        apiClient,
        caption: sharePanelState.caption,
      });
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender();
      return;
    }

    if (form && typeof form === "object" && form.id === "meFriendCodeForm") {
      event.preventDefault();
      const input = doc.getElementById("meFriendCodeInput");
      const outcome = await addFriendByCode(input?.value || "", {
        storage,
        apiClient,
      });
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
    }, storage);

    if (!saved) {
      void rerender("Write a thought before posting.");
      return;
    }

    const updatedThoughtCount = buildPlayerThoughtFeed(loadThoughtFeed(storage), currentProfile.playerId).length;
    syncThoughtPostCountWithApi(
      currentProfile.playerId,
      updatedThoughtCount,
      storage,
      apiClient,
    );
    void rerender("Thought posted.");
  });

  doc.addEventListener("click", async (event) => {
    const commentButton = event.target.closest("[data-comment-thought-id]");
    if (commentButton) {
      const thoughtId = commentButton.dataset.commentThoughtId || "";
      const cardId = commentButton.dataset.commentCardId || "";
      const currentProfile = loadFactoryProfile(storage);
      if (!thoughtId || !currentProfile?.playerId) {
        return;
      }

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
      if (!thoughtId || !currentProfile?.playerId) {
        return;
      }

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
      if (!thoughtId || !currentProfile?.playerId) {
        return;
      }

      await shareThoughtPostWithApi(thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, storage, {
        apiClient,
      });
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
      if (!thoughtId || !reactionId || !currentProfile?.playerId) {
        return;
      }

      await reactToThoughtPostWithApi(thoughtId, currentProfile.playerId, reactionId, storage, {
        apiClient,
      });
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
    await deleteThoughtPostWithApi(id, storage);
    const updatedThoughtCount = buildPlayerThoughtFeed(loadThoughtFeed(storage), currentProfile.playerId).length;
    syncThoughtPostCountWithApi(
      currentProfile.playerId,
      updatedThoughtCount,
      storage,
      apiClient,
    );
    void rerender();
  });

  doc.addEventListener("input", (event) => {
    const captionInput = event.target.closest("[data-share-caption-input]");
    if (captionInput) {
      sharePanelState = {
        ...sharePanelState,
        caption: captionInput.value || "",
      };
      return;
    }

    const commentInput = event.target.closest("[data-comment-input]");
    if (!commentInput) return;
    commentPanelState = {
      ...commentPanelState,
      text: commentInput.value || "",
    };
  });
}
