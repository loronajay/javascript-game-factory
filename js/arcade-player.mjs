import { initArcadeProfilePanel } from "./arcade-profile.mjs";
import { loadFactoryProfile, saveFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { createAuthApiClient } from "./platform/api/auth-api.mjs";
import {
  incrementProfileViewCountWithApi,
  loadProfileMetricsRecord,
  normalizeProfileMetricsRecord,
  saveProfileMetricsRecord,
} from "./platform/metrics/metrics.mjs";
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
import { buildPlayerProfileView } from "./platform/profile/profile.mjs";
import {
  loadProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
  saveProfileRelationshipsRecord,
} from "./platform/relationships/relationships.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { getDefaultPlatformStorage } from "./platform/storage/storage.mjs";
import {
  buildPlayerThoughtFeed,
  buildThoughtCardItems,
  loadThoughtFeed,
  syncThoughtFeedFromApi,
} from "./platform/thoughts/thoughts.mjs";
import { renderPlayerPageView } from "./arcade-player-view.mjs";
import { wirePlayerPage } from "./arcade-player-wire.mjs";

const DEFAULT_PROFILE_PICTURE_SRC = "../images/default/profile-picture/default.png";

function sanitizePlayerId(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function enrichProfileFriendsFromApi(profile, relationshipsRecord, apiClient) {
  if (!apiClient?.loadPlayerProfile) return profile;
  const normalized = normalizeProfileRelationshipsRecord(
    relationshipsRecord?.playerId ? relationshipsRecord : { playerId: profile?.playerId || "" },
  );
  if (normalized.friendPlayerIds.length === 0) return profile;
  const knownIds = new Set((profile?.friendsPreview || []).map((f) => f.playerId).filter(Boolean));
  const missingIds = normalized.friendPlayerIds.filter((id) => !knownIds.has(id)).slice(0, 8);
  if (missingIds.length === 0) return profile;
  const fetched = await Promise.all(missingIds.map((id) => apiClient.loadPlayerProfile(id).catch(() => null)));
  const enriched = fetched.filter((p) => p?.playerId).map((p) => ({
    playerId: p.playerId,
    profileName: p.profileName || "Arcade Pilot",
    presence: p.presence || "offline",
    friendPoints: normalized.friendPointsByPlayerId[p.playerId] || 0,
    avatarUrl: p.avatarUrl || "",
  }));
  if (enriched.length === 0) return profile;
  return { ...profile, friendsPreview: [...(profile?.friendsPreview || []), ...enriched] };
}

function resolveProfilePresence(presence, isOwnerView) {
  const normalized = String(presence || "").trim().toLowerCase();
  if (isOwnerView) {
    return "online";
  }
  return normalized || "offline";
}

function buildThoughtBackedProfile(thoughtFeed = [], requestedPlayerId = "") {
  const playerThoughtFeed = buildPlayerThoughtFeed(thoughtFeed, requestedPlayerId);
  if (playerThoughtFeed.length === 0) return null;

  return {
    version: 1,
    playerId: requestedPlayerId,
    profileName: playerThoughtFeed[0].authorDisplayName,
    bio: "",
    tagline: "",
    avatarAssetId: "",
    favoriteGameSlug: "",
    ladderPlacements: [],
    friendsPreview: [],
    mainSqueeze: null,
    badgeIds: [],
    links: [],
    recentActivity: [],
    thoughtCount: playerThoughtFeed.length,
    preferences: {},
  };
}

const GESTURE_DEFINITIONS = Object.freeze([
  { type: "poke", label: "Poke 👈" },
  { type: "hug", label: "Hug 🤗" },
  { type: "kick", label: "Kick 👟" },
  { type: "blowkiss", label: "Blow Kiss 💋" },
  { type: "nudge", label: "Nudge 👇" },
]);

const CHALLENGEABLE_GAMES = Object.freeze([
  { slug: "lovers-lost", title: "Lovers Lost" },
  { slug: "battleshits", title: "Battleshits" },
]);

function buildGestureAction(viewerPlayerId, targetPlayerId, isOwnerView, authSessionPlayerId, flashMessage = "", challengePickerOpen = false) {
  const normalizedViewerPlayerId = sanitizePlayerId(viewerPlayerId);
  const normalizedTargetPlayerId = sanitizePlayerId(targetPlayerId);
  const normalizedAuthPlayerId = sanitizePlayerId(authSessionPlayerId);
  const canRender = !isOwnerView
    && !!normalizedAuthPlayerId
    && !!normalizedTargetPlayerId
    && normalizedAuthPlayerId !== normalizedTargetPlayerId;

  return {
    enabled: canRender,
    playerId: normalizedTargetPlayerId,
    gestures: GESTURE_DEFINITIONS,
    challengeableGames: CHALLENGEABLE_GAMES,
    challengePickerOpen: canRender && !!challengePickerOpen,
    flashMessage: typeof flashMessage === "string" ? flashMessage : "",
  };
}

function buildMessageAction(viewerPlayerId, targetPlayerId, targetProfileName, isOwnerView, authSessionPlayerId) {
  const normalizedViewerPlayerId = sanitizePlayerId(viewerPlayerId);
  const normalizedTargetPlayerId = sanitizePlayerId(targetPlayerId);
  const normalizedAuthPlayerId = sanitizePlayerId(authSessionPlayerId);
  const enabled = !isOwnerView
    && !!normalizedAuthPlayerId
    && !!normalizedTargetPlayerId
    && normalizedAuthPlayerId !== normalizedTargetPlayerId;
  return {
    enabled,
    playerId: normalizedTargetPlayerId,
    profileName: typeof targetProfileName === "string" ? targetProfileName : "",
  };
}

function buildFriendAction(viewerPlayerId, targetPlayerId, viewerRelationshipsRecord, isOwnerView, flashMessage = "") {
  const normalizedViewerPlayerId = sanitizePlayerId(viewerPlayerId);
  const normalizedTargetPlayerId = sanitizePlayerId(targetPlayerId);
  const canRender = !isOwnerView
    && !!normalizedViewerPlayerId
    && !!normalizedTargetPlayerId
    && normalizedViewerPlayerId !== normalizedTargetPlayerId;

  if (!canRender) {
    return {
      enabled: false,
      disabled: true,
      label: "Add Friend",
      flashMessage: "",
      playerId: normalizedTargetPlayerId,
    };
  }

  const normalizedViewerRelationships = viewerRelationshipsRecord?.playerId
    ? normalizeProfileRelationshipsRecord(viewerRelationshipsRecord)
    : normalizeProfileRelationshipsRecord({ playerId: normalizedViewerPlayerId });
  const alreadyFriends = normalizedViewerRelationships.friendPlayerIds.includes(normalizedTargetPlayerId);

  return {
    enabled: true,
    disabled: false,
    mode: alreadyFriends ? "unfriend" : "add-friend",
    label: alreadyFriends ? "Unfriend" : "Add Friend",
    flashMessage: typeof flashMessage === "string" ? flashMessage : "",
    playerId: normalizedTargetPlayerId,
  };
}

export function loadRequestedPlayerProfile(storage = getDefaultPlatformStorage(), requestedPlayerId = "", options = {}) {
  const cachedProfile = loadFactoryProfile(storage);
  const routePlayerId = sanitizePlayerId(requestedPlayerId);
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : [];

  if (!routePlayerId || routePlayerId === cachedProfile.playerId) {
    return cachedProfile;
  }

  return buildThoughtBackedProfile(thoughtFeed, routePlayerId);
}

export async function loadPlayerPageData(options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const params = new URLSearchParams(options.search || globalThis.location?.search || "");
  const requestedPlayerId = sanitizePlayerId(params.get("id"));
  const localProfile = loadFactoryProfile(storage);
  const viewerPlayerId = sanitizePlayerId(options?.authSessionPlayerId || localProfile.playerId);
  const isOwnerView = !requestedPlayerId || requestedPlayerId === viewerPlayerId;
  const apiClient = options?.apiClient || createPlatformApiClient(options);
  const thoughtFeed = Array.isArray(options?.thoughtFeed)
    ? options.thoughtFeed
    : await syncThoughtFeedFromApi(storage, apiClient, localProfile.playerId);

  let profile = options.profile ?? loadRequestedPlayerProfile(storage, requestedPlayerId, { thoughtFeed });
  const targetPlayerId = sanitizePlayerId(profile?.playerId || requestedPlayerId || localProfile.playerId);
  let metricsRecord = options?.metricsRecord?.playerId
    ? options.metricsRecord
    : loadProfileMetricsRecord(targetPlayerId, storage);
  let relationshipsRecord = options?.relationshipsRecord?.playerId
    ? options.relationshipsRecord
    : loadProfileRelationshipsRecord(targetPlayerId, storage);
  const canLoad = targetPlayerId
    && apiClient
    && typeof apiClient.loadPlayerProfile === "function"
    && typeof apiClient.loadPlayerMetrics === "function"
    && typeof apiClient.loadPlayerRelationships === "function";

  if (canLoad) {
    const [profileResult, metricsResult, relationshipsResult] = await Promise.all([
      apiClient.loadPlayerProfile(targetPlayerId).catch(() => null),
      apiClient.loadPlayerMetrics(targetPlayerId).catch(() => null),
      apiClient.loadPlayerRelationships(targetPlayerId).catch(() => null),
    ]);

    if (profileResult?.playerId === targetPlayerId) {
      profile = isOwnerView
        ? saveFactoryProfile({
            ...localProfile,
            ...profileResult,
            playerId: localProfile.playerId,
          }, storage)
        : profileResult;
    }

    if (metricsResult?.playerId === targetPlayerId) {
      metricsRecord = saveProfileMetricsRecord({
        ...metricsResult,
        playerId: targetPlayerId,
      }, storage) || metricsRecord;
    }

    if (relationshipsResult?.playerId === targetPlayerId) {
      relationshipsRecord = saveProfileRelationshipsRecord({
        ...relationshipsResult,
        playerId: targetPlayerId,
      }, storage) || relationshipsRecord;
    }
  }

  const enrichedProfile = await enrichProfileFriendsFromApi(profile, relationshipsRecord, apiClient);

  return {
    requestedPlayerId,
    isOwnerView,
    thoughtFeed,
    profile: enrichedProfile,
    metricsRecord,
    relationshipsRecord,
    storage,
  };
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
      showEditProfileButton: false,
      editButtonLabel: "Edit Profile",
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
    showEditProfileButton: isOwnerView,
    editButtonLabel: "Edit Profile",
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

export function renderPlayerPage(doc = globalThis.document, options = {}) {
  if (!doc?.getElementById) return null;

  const params = new URLSearchParams(options.search || globalThis.location?.search || "");
  const requestedPlayerId = sanitizePlayerId(params.get("id"));
  const storage = options.storage || getDefaultPlatformStorage();
  const localProfile = loadFactoryProfile(storage);
  const viewerPlayerId = sanitizePlayerId(options?.authSessionPlayerId || localProfile.playerId);
  const isOwnerView = !requestedPlayerId || requestedPlayerId === viewerPlayerId;
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : loadThoughtFeed(storage);
  const profile = options.profile ?? loadRequestedPlayerProfile(storage, requestedPlayerId, { thoughtFeed });
  let metricsRecord = options?.metricsRecord?.playerId
    ? options.metricsRecord
    : loadProfileMetricsRecord(profile?.playerId || requestedPlayerId || localProfile.playerId, storage);
  const relationshipsRecord = options?.relationshipsRecord?.playerId
    ? options.relationshipsRecord
    : loadProfileRelationshipsRecord(profile?.playerId || requestedPlayerId || localProfile.playerId, storage);
  const viewerRelationshipsRecord = options?.viewerRelationshipsRecord?.playerId
    ? options.viewerRelationshipsRecord
    : loadProfileRelationshipsRecord(localProfile.playerId, storage);

  if (!isOwnerView && profile && !options?.disableProfileViewTracking) {
    void incrementProfileViewCountWithApi(
      profile.playerId,
      { source: "direct" },
      storage,
      options?.apiClient || createPlatformApiClient(options),
    );
  }

  const model = buildPlayerPageViewModel(profile, {
    requestedPlayerId,
    thoughtFeed,
    isOwnerView,
    metricsRecord,
    relationshipsRecord,
    viewerPlayerId: localProfile.playerId,
    viewerRelationshipsRecord,
    thoughtComposerFlash: options?.thoughtComposerFlash || "",
    relationshipFlash: options?.relationshipFlash || "",
    authSessionPlayerId: options?.authSessionPlayerId || "",
    gestureFlash: options?.gestureFlash || "",
    challengePickerOpen: options?.challengePickerOpen || false,
  });

  renderPlayerPageView(doc, model, options);
  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  const storage = getDefaultPlatformStorage();
  const apiClient = createPlatformApiClient();

  let authSession = null;
  try {
    authSession = await createAuthApiClient().getSession();
  } catch { /* no session */ }

  if (authSession?.playerId) {
    saveFactoryProfile({ ...loadFactoryProfile(storage), playerId: authSession.playerId }, storage);
  }

  const profilePanel = initArcadeProfilePanel({ doc, storage });
  renderPlayerPage(doc);
  wirePlayerPage(doc, renderPlayerPage, loadPlayerPageData, { storage, apiClient, profilePanel, authSession });
}
