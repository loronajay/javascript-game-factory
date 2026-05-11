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
} from "../arcade-profile-page-helpers.mjs";
import {
  buildFriendAction,
  buildGestureAction,
  buildMessageAction,
} from "./actions-view-model.mjs";
import { sanitizePlayerId } from "./loader.mjs";
import { normalizeProfileMetricsRecord } from "../platform/metrics/metrics.mjs";
import { buildPlayerProfileView } from "../platform/profile/profile.mjs";
import { normalizeProfileRelationshipsRecord } from "../platform/relationships/relationships.mjs";
import {
  buildPlayerThoughtFeed,
  buildThoughtCardItems,
} from "../platform/thoughts/thoughts.mjs";

const DEFAULT_PROFILE_PICTURE_SRC = "../images/default/profile-picture/default.png";

function resolveProfilePresence(presence, isOwnerView) {
  const normalized = String(presence || "").trim().toLowerCase();
  if (isOwnerView) {
    return "online";
  }
  return normalized || "offline";
}

export function buildPlayerPageViewModel(profile, options = {}) {
  const requestedPlayerId = sanitizePlayerId(options.requestedPlayerId);
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : [];
  const isOwnerView = !!options?.isOwnerView;
  const favoriteTitleResolver = typeof options?.favoriteTitleResolver === "function"
    ? options.favoriteTitleResolver
    : titleFromSlug;

  if (!profile) {
    return {
      state: "missing",
      pageTitle: "UNKNOWN PILOT",
      pageSubtitle: "Signal not present on this local cabinet.",
      heroName: "UNKNOWN PILOT",
      heroRealName: "",
      heroTagline: "Signal not present on this local cabinet.",
      heroBio: "This public player file is not available in the local arcade cache yet. Open the Me page to inspect the current local profile or load this player from a future shared source.",
      heroChipLabel: "PLAYER PROFILE",
      pageViewCount: "0",
      avatarSrc: DEFAULT_PROFILE_PICTURE_SRC,
      avatarAlt: "Unknown pilot portrait",
      avatarInitials: "??",
      heroMeta: [
        { label: "Requested ID", value: requestedPlayerId || "NO-ID" },
        { label: "Status", value: "Offline" },
        { label: "Badges", value: "0" },
        { label: "Thoughts", value: "0" },
      ],
      heroStats: buildHeroStats({
        playerId: requestedPlayerId,
        friendsPreview: [],
        mainSqueeze: null,
      }, 0, options?.metricsRecord, options?.relationshipsRecord),
      identityLinkItems: [{
        label: "Link Ports",
        value: "No public links are cached for this player yet.",
        kind: "placeholder",
        isPlaceholder: true,
      }],
      favoriteGameItems: buildFavoriteGameItems({
        favoriteGameSlug: "",
        featuredGames: [],
      }, titleFromSlug, {
        emptyValue: "A favorite game link will appear here once profile favorites are wired in.",
      }),
      rankingItems: buildRankingItems({
        ladderPlacements: [],
      }, titleFromSlug, {
        emptyValue: "Rank snapshots are not cached for this player yet.",
      }),
      friendItems: buildFriendItems({
        playerId: requestedPlayerId,
        friendsPreview: [],
        mainSqueeze: null,
      }, options?.relationshipsRecord),
      thoughtItems: buildThoughtCardItems([], {
        placeholderId: "player-thought-placeholder",
        placeholderTitle: "No posts yet",
        placeholderSummary: "This player hasn't shared any thoughts yet.",
      }),
      thoughtComposer: {
        enabled: false,
        subjectPlaceholder: "Optional headline",
        textPlaceholder: "Share a thought from your profile lane.",
        submitLabel: "Post Thought",
        flashMessage: "",
      },
      friendAction: {
        enabled: false,
        disabled: true,
        label: "Add Friend",
        flashMessage: "",
        playerId: requestedPlayerId,
      },
      messageAction: { enabled: false, playerId: requestedPlayerId, profileName: "" },
      aboutText: "This player has not filled out an about block in the local arcade cache yet.",
      badgeItems: [{
        label: "Badge case still empty",
        isPlaceholder: true,
      }],
    };
  }

  const publicView = buildPlayerProfileView(profile, options);
  const playerThoughtFeed = buildPlayerThoughtFeed(thoughtFeed, publicView.playerId || requestedPlayerId);
  const thoughtItems = buildThoughtCardItems(playerThoughtFeed, {
    placeholderId: "player-thought-placeholder",
    placeholderTitle: "No posts yet",
    placeholderSummary: isOwnerView ? "Share your first thought using the composer above." : "This player hasn't shared any thoughts yet.",
    isOwner: isOwnerView,
  });
  const resolvedThoughtCount = Math.max(publicView.thoughtCount, playerThoughtFeed.length);
  const metricsRecord = options?.metricsRecord?.playerId
    ? normalizeProfileMetricsRecord(options.metricsRecord)
    : normalizeProfileMetricsRecord({ playerId: publicView.playerId || requestedPlayerId });
  const relationshipsRecord = options?.relationshipsRecord?.playerId
    ? normalizeProfileRelationshipsRecord(options.relationshipsRecord)
    : normalizeProfileRelationshipsRecord({ playerId: publicView.playerId || requestedPlayerId });
  const identityLinkItems = buildIdentityLinkItems(publicView.links, "This player has not pinned any public links yet.");
  const favoriteGameItems = buildFavoriteGameItems(publicView, favoriteTitleResolver, {
    emptyValue: "No favorite cabinet is pinned on this player file yet.",
  });
  const rankingItems = buildRankingItems(publicView, favoriteTitleResolver, {
    emptyValue: "No shared ranking snapshots are attached to this player file yet.",
  });
  const friendItems = buildFriendItems(publicView, relationshipsRecord);
  const heroName = publicView.profileName || "UNNAMED PILOT";
  const heroRealName = publicView.realName || "";
  const heroTagline = publicView.tagline || "No tagline set yet.";
  const heroBio = publicView.bio || "This public player file is running in local-first mode while broader arcade profile discovery comes online.";
  const resolvedPresence = resolveProfilePresence(publicView.presence, isOwnerView);
  const badgeItems = buildBadgeItems(publicView.badgeIds);
  const friendAction = buildFriendAction(
    options?.viewerPlayerId,
    publicView.playerId || requestedPlayerId,
    options?.viewerRelationshipsRecord,
    isOwnerView,
    options?.relationshipFlash || "",
  );
  const gestureAction = buildGestureAction(
    options?.viewerPlayerId,
    publicView.playerId || requestedPlayerId,
    isOwnerView,
    options?.authSessionPlayerId || "",
    options?.gestureFlash || "",
    options?.challengePickerOpen || false,
  );
  const messageAction = buildMessageAction(
    options?.viewerPlayerId,
    publicView.playerId || requestedPlayerId,
    publicView.profileName || heroName,
    isOwnerView,
    options?.authSessionPlayerId || "",
  );

  return {
    state: "ready",
    pageTitle: heroName,
    pageSubtitle: heroTagline,
    heroName,
    heroRealName,
    heroTagline,
    heroBio,
    heroChipLabel: "PLAYER PROFILE",
    presenceLabel: formatPresenceLabel(resolvedPresence),
    presenceToneClass: buildPresenceToneClass(resolvedPresence),
    pageViewCount: String(metricsRecord.profileViewCount),
    avatarSrc: publicView.avatarUrl || DEFAULT_PROFILE_PICTURE_SRC,
    avatarAlt: `${heroName} portrait`,
    avatarInitials: buildProfileInitials(heroName),
    heroMeta: [
      { label: "Factory ID", value: publicView.playerId || requestedPlayerId || "PENDING-ID" },
      { label: "Status", value: formatPresenceLabel(resolvedPresence) },
      { label: "Badges", value: String(publicView.badgeIds.length) },
      { label: "Thoughts", value: String(resolvedThoughtCount) },
    ],
    heroStats: buildHeroStats(publicView, resolvedThoughtCount, metricsRecord, relationshipsRecord),
    backgroundImageUrl: publicView.backgroundImageUrl,
    backgroundStyle: publicView.backgroundStyle || 'blend',
    identityLinkItems,
    favoriteGameItems,
    rankingItems,
    friendItems,
    thoughtItems,
    thoughtComposer: {
      enabled: isOwnerView,
      subjectPlaceholder: "Optional headline",
      textPlaceholder: "Share a thought from your profile lane.",
      submitLabel: "Post Thought",
      flashMessage: typeof options?.thoughtComposerFlash === "string" ? options.thoughtComposerFlash : "",
    },
    friendAction,
    gestureAction,
    messageAction,
    aboutText: heroBio,
    badgeItems,
  };
}
