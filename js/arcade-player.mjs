import { initArcadeProfilePanel } from "./arcade-profile.mjs";
import { loadFactoryProfile, saveFactoryProfile } from "./platform/identity/factory-profile.mjs";
import {
  incrementProfileViewCountWithApi,
  loadProfileMetricsRecord,
  normalizeProfileMetricsRecord,
  saveProfileMetricsRecord,
  syncThoughtPostCountWithApi,
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
  createFriendshipBetweenPlayers,
  loadProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
  saveProfileRelationshipsRecord,
} from "./platform/relationships/relationships.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
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

const DEFAULT_PROFILE_PICTURE_SRC = "../images/default/profile-picture/default.png";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizePlayerId(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeCssUrl(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function buildShareReference(item) {
  if (item?.quotedThought) {
    return item.quotedThought;
  }

  return item
    ? {
        title: item.title,
        summary: item.summary,
        authorLabel: item.authorLabel,
        publishedLabel: item.publishedLabel,
      }
    : null;
}

function renderQuotedThought(reference, mode = "card") {
  if (!reference) return "";

  const className = mode === "share-sheet"
    ? "thought-card__quoted-thought thought-card__quoted-thought--sheet"
    : "thought-card__quoted-thought";

  return `
    <div class="${className}">
      <p class="thought-card__quoted-kicker">Shared Post</p>
      <div class="thought-card__quoted-meta">
        <span class="thought-card__quoted-author">${escapeHtml(reference.authorLabel || "Arcade Pilot")}</span>
        <span class="thought-card__quoted-date">${escapeHtml(reference.publishedLabel || "Signal pending")}</span>
      </div>
      <p class="thought-card__quoted-title">${escapeHtml(reference.title || "Arcade Signal")}</p>
      <p class="thought-card__quoted-summary">${escapeHtml(reference.summary || "Shared arcade signal.")}</p>
    </div>
  `;
}

function formatCommentDate(value) {
  return value || "Signal pending";
}

function renderCommentSheet(item, commentPanelState = {}) {
  if (item.isPlaceholder || item.id !== commentPanelState?.cardId) {
    return "";
  }

  const comments = Array.isArray(commentPanelState.comments) ? commentPanelState.comments : [];
  const reference = buildShareReference(item);

  return `
    <div class="thought-card__comment-sheet">
      <div class="thought-card__comment-header">
        <p class="thought-card__comment-kicker">Comments</p>
        <button class="thought-card__comment-dismiss" type="button" data-close-comment-sheet="${escapeHtml(item.id)}">Close</button>
      </div>
      ${renderQuotedThought(reference, "share-sheet")}
      <div class="thought-card__comment-thread">
        ${comments.length > 0
          ? comments.map((comment) => `
            <article class="thought-card__comment">
              <div class="thought-card__comment-meta">
                <span class="thought-card__comment-author">${escapeHtml(comment.authorDisplayName || "Arcade Pilot")}</span>
                <span class="thought-card__comment-date">${escapeHtml(formatCommentDate(comment.createdAt))}</span>
              </div>
              <p class="thought-card__comment-body">${escapeHtml(comment.text || "")}</p>
            </article>
          `).join("")
          : `<p class="thought-card__comment-empty">No comments yet. Start the thread.</p>`}
      </div>
      <form class="thought-card__comment-form" data-comment-form="${escapeHtml(item.commentTargetId || item.id)}" data-comment-card-id="${escapeHtml(item.id)}">
        <label class="thought-card__share-label" for="player-comment-body-${escapeHtml(item.id)}">Write a comment</label>
        <textarea
          id="player-comment-body-${escapeHtml(item.id)}"
          class="thought-card__share-input"
          rows="3"
          maxlength="500"
          placeholder="Write your reply."
          data-comment-input="${escapeHtml(item.id)}"
        >${escapeHtml(commentPanelState.text || "")}</textarea>
        <div class="thought-card__share-actions">
          <button class="thought-card__share-button thought-card__share-button--primary" type="submit">Post Comment</button>
          <button class="thought-card__share-button" type="button" data-close-comment-sheet="${escapeHtml(item.id)}">Cancel</button>
        </div>
      </form>
    </div>
  `;
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
    disabled: alreadyFriends,
    label: alreadyFriends ? "Friends Linked" : "Add Friend",
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
  const isOwnerView = !requestedPlayerId || requestedPlayerId === localProfile.playerId;
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

  return {
    requestedPlayerId,
    isOwnerView,
    thoughtFeed,
    profile,
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
      }, 0, options?.metricsRecord),
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
        placeholderTitle: "Player Feed Warming Up",
        placeholderSummary: "No public player thoughts are cached for this pilot yet.",
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
    placeholderTitle: "Player Feed Warming Up",
    placeholderSummary: "No public player thoughts are cached for this pilot yet.",
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
    heroStats: buildHeroStats(publicView, resolvedThoughtCount, metricsRecord),
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
    aboutText: heroBio,
    badgeItems,
  };
}

function renderPageHeader(doc, model) {
  if (!doc?.getElementById) return;

  const title = doc.getElementById("playerStageTitle");
  const subtitle = doc.getElementById("playerStageSubtitle");

  if (title) title.textContent = model.pageTitle;
  if (subtitle) subtitle.textContent = model.pageSubtitle;
  if (doc?.title) {
    doc.title = `${model.pageTitle} | Jay's Javascript Arcade`;
  }
  globalThis.PixelText?.render?.(title);
}

function renderHeroCard(container, model) {
  if (!container) return;

  const linksHtml = model.identityLinkItems.map((item) => {
    const itemClass = item.isPlaceholder ? "player-identity-link player-identity-link--placeholder" : "player-identity-link";
    const labelHtml = item.isPlaceholder ? "" : `<span class="player-identity-link__label">${escapeHtml(item.label)}</span>`;
    const valueHtml = item.isPlaceholder
      ? `<p class="player-identity-link__value">${escapeHtml(item.value)}</p>`
      : `<a class="player-identity-link__value" href="${escapeHtml(item.value)}" target="_blank" rel="noreferrer">${escapeHtml(item.value)}</a>`;

    return `
      <article class="${itemClass}">
        ${labelHtml}
        ${valueHtml}
      </article>
    `;
  }).join("");

  const rankingHtml = model.rankingItems.map((item) => `
    <article class="${item.isPlaceholder ? "player-hero-card__rail-item player-hero-card__rail-item--placeholder" : "player-hero-card__rail-item"}">
      ${item.isPlaceholder ? "" : `<p class="player-hero-card__rail-title">${escapeHtml(item.title || item.label)}</p>`}
      <div class="player-hero-card__rail-value-row">
        <p class="player-hero-card__rail-value">${escapeHtml(item.value)}</p>
        ${item.meta ? `<span class="player-hero-card__rail-meta">${escapeHtml(item.meta)}</span>` : ""}
      </div>
    </article>
  `).join("");

  const friendHtml = model.friendItems.map((item) => `
    <article class="${item.isPlaceholder ? "player-hero-card__friend-card player-hero-card__friend-card--placeholder" : "player-hero-card__friend-card"}">
      <div class="player-hero-card__friend-avatar" aria-hidden="true">
        <span class="player-hero-card__friend-avatar-text">${escapeHtml(item.avatarInitials || "??")}</span>
      </div>
      <div class="player-hero-card__friend-copy">
        <p class="player-hero-card__friend-label">${escapeHtml(item.title || "Friend Slot")}</p>
        <p class="player-hero-card__friend-name">${escapeHtml(item.value)}</p>
        <p class="player-hero-card__friend-points">${escapeHtml(item.meta || "Friendship points pending")}</p>
      </div>
    </article>
  `).join("");
  const statsHtml = (Array.isArray(model.heroStats) ? model.heroStats : []).map((item) => `
    <article class="player-hero-card__metrics-stat">
      <p class="player-hero-card__metrics-stat-label">${escapeHtml(item.label)}</p>
      <p class="player-hero-card__metrics-stat-value">${escapeHtml(item.value)}</p>
    </article>
  `).join("");

  const factoryId = model.heroMeta.find((item) => item.label === "Factory ID")?.value || "PENDING-ID";
  const realNameValue = model.heroRealName || "Not shared";
  const pageViewCount = model.pageViewCount || "0";
  const friendActionHtml = model.friendAction?.enabled
    ? `
      <div class="player-hero-card__social-action">
        <button
          class="${model.friendAction.disabled ? "player-hero-card__friend-action player-hero-card__friend-action--linked" : "player-hero-card__friend-action"}"
          type="button"
          data-add-friend="${escapeHtml(model.friendAction.playerId || "")}"
          ${model.friendAction.disabled ? "disabled" : ""}
        >${escapeHtml(model.friendAction.label || "Add Friend")}</button>
        <p class="player-hero-card__friend-flash" aria-live="polite">${escapeHtml(model.friendAction.flashMessage || "")}</p>
      </div>
    `
    : "";

  container.innerHTML = `
    <div class="player-hero-card__backdrop" aria-hidden="true"></div>
    <section class="player-hero-card__portrait-panel">
      <div class="player-hero-card__portrait" aria-hidden="true">
        <div class="player-hero-card__portrait-shell">
          <div class="player-hero-card__portrait-frame">
            <div class="player-hero-card__portrait-fallback">${escapeHtml(model.avatarInitials)}</div>
            <img
              class="player-hero-card__portrait-image"
              src="${escapeHtml(model.avatarSrc)}"
              alt="${escapeHtml(model.avatarAlt)}"
            >
          </div>
        </div>
      </div>
    </section>
    <section class="player-hero-card__metrics-panel">
      <div class="player-hero-card__section-topline">
        <h3 class="player-hero-card__section-title">Profile Metrics</h3>
      </div>
      <div class="player-hero-card__metrics-grid">
        ${statsHtml}
      </div>
    </section>
    <section class="player-hero-card__identity-panel">
      <p class="player-hero-card__kicker">${escapeHtml(model.heroChipLabel)}</p>
      <div class="player-hero-card__identity-field">
        <span class="player-hero-card__identity-field-label">Name</span>
        <div class="player-hero-card__identity-field-value-row">
          <span class="player-hero-card__identity-field-value">${escapeHtml(realNameValue)}</span>
          <span class="player-presence-dot player-presence-dot--${escapeHtml(model.presenceToneClass || "offline")}" title="${escapeHtml(model.presenceLabel || "Offline")}"></span>
        </div>
      </div>
      <div class="player-hero-card__identity-field player-hero-card__identity-field--stack">
        <span class="player-hero-card__identity-field-label">Page Views</span>
        <span class="player-hero-card__identity-field-value">${escapeHtml(pageViewCount)}</span>
      </div>
      <div class="player-hero-card__identity-field player-hero-card__identity-field--stack">
        <span class="player-hero-card__identity-field-label">Factory ID</span>
        <span class="player-hero-card__identity-field-value player-hero-card__identity-field-value--mono">${escapeHtml(factoryId)}</span>
      </div>
      <div class="player-hero-card__identity-field player-hero-card__identity-field--stack">
        <span class="player-hero-card__identity-field-label">Social Links</span>
        <div class="player-identity-links">
          ${linksHtml}
        </div>
      </div>
      ${friendActionHtml}
    </section>
    <section class="player-hero-card__rankings-panel">
      <div class="player-hero-card__section-topline">
        <h3 class="player-hero-card__section-title">Top Ladder Rankings</h3>
      </div>
      <div class="player-hero-card__rail-list">
        ${rankingHtml}
      </div>
    </section>
    <section class="player-hero-card__friends-panel">
      <div class="player-hero-card__section-topline">
        <h3 class="player-hero-card__section-title">Top Friends</h3>
      </div>
      <div class="player-hero-card__rail-list">
        ${friendHtml}
      </div>
    </section>
  `;

  const backdrop = container.querySelector(".player-hero-card__backdrop");
  const hasCustomBackdrop = !!model.backgroundImageUrl;
  if (backdrop) {
    if (hasCustomBackdrop) {
      backdrop.style.setProperty("--player-profile-backdrop-image", `url("${escapeCssUrl(model.backgroundImageUrl)}")`);
    } else {
      backdrop.style.removeProperty("--player-profile-backdrop-image");
    }
  }

  container.classList.toggle("player-hero-card--default-backdrop", !hasCustomBackdrop);
  container.classList.toggle("player-hero-card--custom-backdrop", hasCustomBackdrop);

  const hasCustomAvatar = !!model.avatarSrc && model.avatarSrc !== DEFAULT_PROFILE_PICTURE_SRC;
  container.classList.toggle("player-hero-card--default-avatar", !hasCustomAvatar);
  container.classList.toggle("player-hero-card--custom-avatar", hasCustomAvatar);

  const portraitImage = container.querySelector(".player-hero-card__portrait-image");
  if (!portraitImage) return;

  function showFallback() {
    container.classList.add("player-hero-card--avatar-fallback");
  }

  function showImage() {
    container.classList.remove("player-hero-card--avatar-fallback");
  }

  portraitImage.addEventListener("error", showFallback, { once: true });
  portraitImage.addEventListener("load", showImage, { once: true });

  if (portraitImage.complete) {
    if (portraitImage.naturalWidth > 0) {
      showImage();
    } else {
      showFallback();
    }
  } else {
    showFallback();
  }
}

function renderPanel(container, title, items, formatter) {
  if (!container) return;

  const itemsHtml = items.map(formatter).join("");

  container.innerHTML = `
    <div class="player-panel__header"><h2 class="player-panel__title">${escapeHtml(title)}</h2></div>
    ${itemsHtml}
  `;
}

function renderCardItem(item) {
  const itemClass = item.isPlaceholder ? "player-card-item player-card-item--placeholder" : "player-card-item";
  const titleHtml = item.isPlaceholder ? "" : `<p class="player-card-item__title">${escapeHtml(item.title || item.label)}</p>`;
  const valueHtml = item.href
    ? `<a class="player-card-item__link" href="${escapeHtml(item.href)}">${escapeHtml(item.linkLabel || item.value)}</a>`
    : `<p class="player-card-item__value">${escapeHtml(item.value)}</p>`;
  const metaHtml = item.meta ? `<p class="player-card-item__meta">${escapeHtml(item.meta)}</p>` : "";

  return `
    <article class="${itemClass}">
      ${titleHtml}
      ${valueHtml}
      ${metaHtml}
    </article>
  `;
}

function renderFavoritePanel(container, title, item) {
  if (!container) return;

  const favorite = item || {};
  const cardHtml = favorite.isPlaceholder
    ? `
      <article class="game-card featured player-featured-cabinet__card game-card--placeholder" aria-disabled="true">
        <div class="game-card-preview">
          <div class="game-thumb player-featured-cabinet__thumb player-featured-cabinet__thumb--placeholder"></div>
          <div class="game-card-copy game-card-copy--placeholder">
            <h3 class="game-title">PIN A FAVORITE</h3>
          </div>
        </div>
      </article>
    `
    : `
      <a class="game-card featured player-featured-cabinet__card" href="${escapeHtml(favorite.href)}">
        <div class="game-card-preview">
          <div class="game-thumb player-featured-cabinet__thumb">
            <img class="player-featured-cabinet__image" src="${escapeHtml(favorite.previewSrc || "")}" alt="${escapeHtml(favorite.title || "Favorite cabinet preview")}">
          </div>
          <div class="game-card-copy">
            <h3 class="game-title">${escapeHtml(favorite.title || "Favorite Cabinet")}</h3>
          </div>
        </div>
      </a>
    `;

  container.innerHTML = `
    <div class="player-panel__header"><h2 class="player-panel__title">${escapeHtml(title)}</h2></div>
    <div class="player-featured-cabinet">
      ${cardHtml}
    </div>
  `;
}

function renderThoughtItem(item, openReactionThoughtId = "", sharePanelState = {}, commentPanelState = {}) {
  const cardClass = item.isPlaceholder ? "thought-card thought-card--placeholder" : "thought-card";
  const actionItems = Array.isArray(item.actionItems) && item.actionItems.length > 0
    ? item.actionItems
    : [
        { label: "Comments" },
        { label: "Share" },
        { label: "React" },
      ];
  const isReactionPickerOpen = !item.isPlaceholder && item.id === openReactionThoughtId;
  const isShareSheetOpen = !item.isPlaceholder && item.id === sharePanelState?.cardId;
  const isShareCaptionOpen = isShareSheetOpen && sharePanelState?.mode === "caption";
  const isCommentSheetOpen = !item.isPlaceholder && item.id === commentPanelState?.cardId;
  const shareReference = buildShareReference(item);
  const actionsHtml = actionItems.map((action) => {
    if (action.id === "comment" && !item.isPlaceholder) {
      return `
        <button
          class="${isCommentSheetOpen ? "thought-card__action thought-card__action--active" : "thought-card__action"}"
          type="button"
          data-comment-thought-id="${escapeHtml(item.commentTargetId || item.id)}"
          data-comment-card-id="${escapeHtml(item.id)}"
        >${escapeHtml(action.label)}</button>
      `;
    }

    if (action.id === "share" && !item.isPlaceholder) {
      return `
        <button
          class="${action.isActive ? "thought-card__action thought-card__action--active" : "thought-card__action"}"
          type="button"
          data-share-thought-id="${escapeHtml(item.shareTargetId || item.id)}"
          data-share-card-id="${escapeHtml(item.id)}"
        >${escapeHtml(action.label)}</button>
      `;
    }

    if (action.id === "react" && !item.isPlaceholder) {
      return `
        <button
          class="${isReactionPickerOpen ? "thought-card__action thought-card__action--active" : "thought-card__action"}"
          type="button"
          data-toggle-thought-reactions="${escapeHtml(item.id)}"
          aria-expanded="${isReactionPickerOpen ? "true" : "false"}"
        >${escapeHtml(action.label)}</button>
      `;
    }

    return `
      <span class="thought-card__action">${escapeHtml(action.label)}</span>
    `;
  }).join("");
  const deleteHtml = item.canDelete
    ? `<button class="thought-card__delete" type="button" data-delete-id="${escapeHtml(item.id)}" aria-label="Delete thought">Delete</button>`
    : "";
  const reactionPickerHtml = item.isPlaceholder
    ? ""
    : `
      <div class="${isReactionPickerOpen ? "thought-card__reaction-picker" : "thought-card__reaction-picker thought-card__reaction-picker--hidden"}">
        ${item.reactionPickerItems.map((reaction) => `
          <button
            class="${reaction.isSelected ? "thought-card__reaction-chip thought-card__reaction-chip--selected" : "thought-card__reaction-chip"}"
            type="button"
            data-react-thought-id="${escapeHtml(item.id)}"
            data-thought-reaction-id="${escapeHtml(reaction.id)}"
            aria-pressed="${reaction.isSelected ? "true" : "false"}"
            title="${escapeHtml(reaction.label)}"
          >
            <span class="thought-card__reaction-glyph" aria-hidden="true">${escapeHtml(reaction.glyph || reaction.label)}</span>
            <span class="thought-card__reaction-count">${escapeHtml(String(reaction.count || 0))}</span>
          </button>
        `).join("")}
      </div>
    `;
  const shareSheetHtml = item.isPlaceholder || !isShareSheetOpen
    ? ""
    : `
      <div class="thought-card__share-sheet">
        ${item.actionItems.find((action) => action.id === "share")?.isActive
          ? `
            <div class="thought-card__share-actions">
              <button class="thought-card__share-button thought-card__share-button--danger" type="button" data-share-now-thought-id="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">Remove Share</button>
              <button class="thought-card__share-button" type="button" data-close-share-sheet="${escapeHtml(item.id)}">Done</button>
            </div>
          `
          : `
            <div class="thought-card__share-actions">
              <button class="thought-card__share-button thought-card__share-button--primary" type="button" data-share-now-thought-id="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">Share Now</button>
              <button class="thought-card__share-button" type="button" data-open-share-caption="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">Write Caption</button>
            </div>
          `}
        ${isShareCaptionOpen
          ? `
            <form class="thought-card__share-composer" data-share-caption-form="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">
              <label class="thought-card__share-label" for="player-share-caption-${escapeHtml(item.id)}">Add your caption</label>
              <textarea
                id="player-share-caption-${escapeHtml(item.id)}"
                class="thought-card__share-input"
                rows="4"
                maxlength="500"
                placeholder="Say something about this post."
                data-share-caption-input="${escapeHtml(item.id)}"
              >${escapeHtml(sharePanelState?.caption || "")}</textarea>
              <div class="thought-card__share-actions">
                <button class="thought-card__share-button thought-card__share-button--primary" type="submit">Share With Caption</button>
                <button class="thought-card__share-button" type="button" data-close-share-sheet="${escapeHtml(item.id)}">Cancel</button>
              </div>
              ${renderQuotedThought(shareReference, "share-sheet")}
            </form>
          `
          : ""}
      </div>
    `;
  const quotedThoughtHtml = item.quotedThought
    ? renderQuotedThought(item.quotedThought)
    : "";
  const commentSheetHtml = renderCommentSheet(item, commentPanelState);

  return `
    <article class="${cardClass}">
      <div class="thought-card__signal-line">
        <span class="thought-card__author">${escapeHtml(item.authorLabel)}</span>
        <span class="thought-card__date">${escapeHtml(item.publishedLabel)}</span>
        ${deleteHtml}
      </div>
      <div class="thought-card__topline">
        <div class="thought-card__title-block">
          <span class="thought-card__topic-kicker">Topic</span>
          <h2 class="thought-card__title">${escapeHtml(item.title)}</h2>
        </div>
        <div class="thought-card__reactions">
          <span>${escapeHtml(item.reactionLabel)}</span>
          <span>${escapeHtml(item.shareLabel)}</span>
        </div>
      </div>
      <p class="thought-card__summary">${escapeHtml(item.summary)}</p>
      <div class="thought-card__actions">
        ${actionsHtml}
      </div>
      ${commentSheetHtml}
      ${shareSheetHtml}
      ${reactionPickerHtml}
      ${quotedThoughtHtml}
    </article>
  `;
}

function renderThoughtsPanel(container, title, items, composer = null, options = {}) {
  if (!container) return;

  const composerHtml = composer?.enabled
    ? `
      <form id="playerThoughtComposer" class="thought-composer thought-composer--owner">
        <input
          id="playerThoughtSubject"
          class="thought-composer__subject"
          name="subject"
          type="text"
          maxlength="80"
          placeholder="${escapeHtml(composer.subjectPlaceholder || "Optional headline")}"
        >
        <textarea
          id="playerThoughtBody"
          class="thought-composer__body"
          name="text"
          rows="4"
          maxlength="500"
          placeholder="${escapeHtml(composer.textPlaceholder || "Share a thought.")}"
        ></textarea>
        <div class="thought-composer__actions">
          <button class="thought-composer__submit" type="submit">${escapeHtml(composer.submitLabel || "Post Thought")}</button>
          <p id="playerThoughtComposerFlash" class="thought-composer__flash" aria-live="polite">${escapeHtml(composer.flashMessage || "")}</p>
        </div>
      </form>
    `
    : "";

  container.innerHTML = `
    <div class="player-panel__header"><h2 class="player-panel__title">${escapeHtml(title)}</h2></div>
    ${composerHtml}
    <div class="player-thoughts-feed thoughts-feed">
      ${items.map((item) => renderThoughtItem(
        item,
        options?.openReactionThoughtId || "",
        options?.sharePanelState || {},
        options?.commentPanelState || {},
      )).join("")}
    </div>
  `;
}

function renderAboutPanel(container, title, text) {
  if (!container) return;

  container.innerHTML = `
    <div class="player-panel__header"><h2 class="player-panel__title">${escapeHtml(title)}</h2></div>
    <p class="player-about-copy">${escapeHtml(text)}</p>
  `;
}

function renderBadgesPanel(container, title, items) {
  if (!container) return;

  const badgesHtml = items[0]?.isPlaceholder
    ? `<p class="player-badge-empty">${escapeHtml(items[0].label)}</p>`
    : `<div class="player-badge-list">${items.map((item) => `<span class="player-badge-chip">${escapeHtml(item.label)}</span>`).join("")}</div>`;

  container.innerHTML = `
    <div class="player-panel__header"><h2 class="player-panel__title">${escapeHtml(title)}</h2></div>
    ${badgesHtml}
  `;
}

export function renderPlayerPage(doc = globalThis.document, options = {}) {
  if (!doc?.getElementById) return null;

  const params = new URLSearchParams(options.search || globalThis.location?.search || "");
  const requestedPlayerId = sanitizePlayerId(params.get("id"));
  const storage = options.storage || getDefaultPlatformStorage();
  const localProfile = loadFactoryProfile(storage);
  const isOwnerView = !requestedPlayerId || requestedPlayerId === localProfile.playerId;
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
    metricsRecord = incrementProfileViewCountWithApi(
      profile.playerId,
      { source: "direct" },
      storage,
      options?.apiClient || createPlatformApiClient(options),
    ) || metricsRecord;
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
  });

  const editButton = doc.getElementById("playerProfileButton");
  if (editButton) {
    editButton.hidden = !model.showEditProfileButton;
  }

  renderPageHeader(doc, model);
  renderHeroCard(doc.getElementById("playerHeroCard"), model);
  renderThoughtsPanel(
    doc.getElementById("playerThoughtsPanel"),
    "Player Feed",
    model.thoughtItems,
    model.thoughtComposer,
    {
      openReactionThoughtId: options?.openReactionThoughtId || "",
      sharePanelState: options?.sharePanelState || {},
      commentPanelState: options?.commentPanelState || {},
    },
  );
  renderFavoritePanel(doc.getElementById("playerFavoritePanel"), "Favorite Game", model.favoriteGameItems[0]);
  const rankingsPanel = doc.getElementById("playerRankingsPanel");
  if (rankingsPanel) {
    rankingsPanel.hidden = true;
    rankingsPanel.innerHTML = "";
  }
  const friendsPanel = doc.getElementById("playerFriendsPanel");
  if (friendsPanel) {
    friendsPanel.hidden = true;
    friendsPanel.innerHTML = "";
  }
  renderAboutPanel(doc.getElementById("playerAboutPanel"), "About Me", model.aboutText);
  renderBadgesPanel(doc.getElementById("playerBadgesPanel"), "Badges", model.badgeItems);
  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  const storage = getDefaultPlatformStorage();
  const apiClient = createPlatformApiClient();
  const profilePanel = initArcadeProfilePanel({ doc, storage });
  renderPlayerPage(doc);
  let currentPageData = null;
  let openReactionThoughtId = "";
  let sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
  let commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };

  const rerender = async (thoughtComposerFlash = "", disableProfileViewTracking = true) => {
    const pageData = await loadPlayerPageData({ storage, apiClient });
    currentPageData = pageData;
    profilePanel?.render?.("");
    renderPlayerPage(doc, {
      ...pageData,
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
    commentPanelState = {
      ...commentPanelState,
      comments: remoteComments,
    };
    await rerender();
  };

  void rerender("", false);

  doc.getElementById("playerProfileForm")?.addEventListener("submit", () => {
    queueMicrotask(() => {
      void rerender();
    });
  });

  doc.getElementById("playerProfileClear")?.addEventListener("click", () => {
    queueMicrotask(() => {
      void rerender();
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
    syncThoughtPostCountWithApi(
      currentProfile.playerId,
      updatedThoughtCount,
      storage,
      apiClient,
    );
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
      renderPlayerPage(doc, {
        ...currentPageData,
        relationshipFlash: result.awarded ? "Friend linked." : "Already linked as friends.",
        disableProfileViewTracking: true,
        sharePanelState,
      });
      return;
    }

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
      const pageData = currentPageData || await loadPlayerPageData({ storage, apiClient });
      currentPageData = pageData;
      profilePanel?.render?.("");
      renderPlayerPage(doc, {
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
        const pageData = currentPageData || await loadPlayerPageData({ storage, apiClient });
        currentPageData = pageData;
        profilePanel?.render?.("");
        renderPlayerPage(doc, {
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
        const pageData = currentPageData || await loadPlayerPageData({ storage, apiClient });
        currentPageData = pageData;
        profilePanel?.render?.("");
        renderPlayerPage(doc, {
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
        const pageData = currentPageData || await loadPlayerPageData({ storage, apiClient });
        currentPageData = pageData;
        profilePanel?.render?.("");
        renderPlayerPage(doc, {
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
