import {
  buildPlayerProfileView,
  formatProfileFriendCode,
} from "../platform/profile/profile.mjs";
import {
  buildBadgeItems,
  buildFavoriteGameItems,
  buildFriendItems,
  buildFriendNavigatorItems,
  buildHeroStats,
  buildIdentityLinkItems,
  buildPresenceToneClass,
  buildProfileInitials,
  buildRankingItems,
  formatPresenceLabel,
  titleFromSlug,
} from "../arcade-profile-page-helpers.mjs";
import {
  normalizeProfileMetricsRecord,
} from "../platform/metrics/metrics.mjs";
import {
  normalizeProfileRelationshipsRecord,
} from "../platform/relationships/relationships.mjs";
import {
  buildPlayerThoughtFeed,
  buildThoughtCardItems,
} from "../platform/thoughts/thoughts.mjs";

const DEFAULT_PROFILE_PICTURE_SRC = "../images/default/profile-picture/default.png";

function resolveOwnerPresence(_presence) {
  return "online";
}

export function buildMePageViewModel(profile, options = {}) {
  const publicView = buildPlayerProfileView(profile, options);
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : [];
  const playerThoughtFeed = buildPlayerThoughtFeed(thoughtFeed, publicView.playerId);
  const thoughtItems = buildThoughtCardItems(playerThoughtFeed, {
    placeholderId: "me-thought-placeholder",
    placeholderTitle: "No posts yet",
    placeholderSummary: "Share your first thought using the composer above.",
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
  const friendNavigatorItems = buildFriendNavigatorItems(publicView, relationshipsRecord);

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
    heroStats: buildHeroStats(publicView, resolvedThoughtCount, metricsRecord, relationshipsRecord),
    avatarAssetId: publicView.avatarAssetId,
    backgroundImageUrl: publicView.backgroundImageUrl,
    backgroundStyle: publicView.backgroundStyle || 'blend',
    identityLinkItems,
    favoriteGameItems,
    rankingItems,
    friendItems,
    friendNavigator: {
      triggerLabel: `Friends (${friendNavigatorItems.length})`,
      helperText: friendNavigatorItems.length > 0
        ? "Open your full friend list, then search by name or player id."
        : "Add a friend by code to start building your linked player list.",
      emptyText: "No linked friends yet. Use your friend code panel to add someone first.",
      searchPlaceholder: "Search your friends",
      items: friendNavigatorItems,
    },
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
