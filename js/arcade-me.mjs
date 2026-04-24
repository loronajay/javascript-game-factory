import { initArcadeProfilePanel } from "./arcade-profile.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import {
  loadProfileMetricsRecord,
  normalizeProfileMetricsRecord,
  syncThoughtPostCount,
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
  loadThoughtFeed,
} from "./platform/thoughts/thoughts.mjs";
import { renderMePageView } from "./arcade-me-view.mjs";
import { wireMePage } from "./arcade-me-wire.mjs";
import { initSessionNav } from "./arcade-session-nav.mjs";
import { createAuthApiClient } from "./platform/api/auth-api.mjs";

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
  const playerThoughtFeed = buildPlayerThoughtFeed(thoughtFeed, profile?.playerId);
  if (profile?.playerId) {
    syncThoughtPostCount(profile.playerId, playerThoughtFeed.length, storage);
  }
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
  let session = null;
  try { session = await createAuthApiClient().getSession(); } catch { /* network down */ }

  if (!session?.ok || !session?.playerId) {
    window.location.replace("../sign-in/index.html?next=/me/index.html");
  } else {
    const storage = getDefaultPlatformStorage();
    const apiClient = createPlatformApiClient();
    const authClient = createAuthApiClient();
    const profilePanel = initArcadeProfilePanel({ storage });
    renderMePage(doc);
    wireMePage(doc, renderMePage, addFriendByCode, { storage, apiClient, profilePanel, authClient });
    initSessionNav(doc.getElementById("meAuthNav"), {
      signInPath: "../sign-in/index.html",
      signUpPath: "../sign-up/index.html",
      homeOnLogout: "../index.html",
    });
  }
}
