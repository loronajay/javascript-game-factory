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
  createFriendshipBetweenPlayers,
  loadProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
  resolveProfileFriendSlots,
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

const DEFAULT_PROFILE_PICTURE_SRC = "../images/default/profile-picture/default.png";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function titleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function gameHrefFromSlug(slug = "") {
  const normalized = String(slug || "").trim();
  return normalized ? `../games/${encodeURIComponent(normalized)}/index.html` : "../grid.html";
}

function gamePreviewSrcFromSlug(slug = "") {
  const normalized = String(slug || "").trim();
  return normalized ? `../grid-previews/${encodeURIComponent(normalized)}.png` : "";
}

function buildProfileInitials(name) {
  const tokens = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length >= 2) {
    return `${tokens[0][0] || ""}${tokens[1][0] || ""}`.toUpperCase();
  }

  if (tokens.length === 1) {
    return tokens[0].slice(0, 2).toUpperCase();
  }

  return "??";
}

function formatPresenceLabel(presence) {
  const normalized = String(presence || "").trim().toLowerCase();
  if (!normalized) return "Offline";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function humanizeToken(value) {
  return String(value || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildPresenceToneClass(presence) {
  const normalized = String(presence || "").trim().toLowerCase();
  return normalized || "offline";
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
        <label class="thought-card__share-label" for="me-comment-body-${escapeHtml(item.id)}">Write a comment</label>
        <textarea
          id="me-comment-body-${escapeHtml(item.id)}"
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

function resolveOwnerPresence(presence) {
  return "online";
}

function buildFavoriteGameItem(publicView, favoriteTitleResolver) {
  const favoriteSlug = publicView.favoriteGameSlug
    || publicView.featuredGames[0]
    || "";

  if (!favoriteSlug) {
    return [{
      title: "Favorite Cabinet",
      value: "Pin a go-to cabinet once favorites are wired into the shared player profile.",
      isPlaceholder: true,
    }];
  }

  return [{
    title: favoriteTitleResolver(favoriteSlug),
    value: favoriteSlug,
    href: gameHrefFromSlug(favoriteSlug),
    previewSrc: gamePreviewSrcFromSlug(favoriteSlug),
    linkLabel: "Launch Cabinet",
    isPlaceholder: false,
  }];
}

function buildRankingItems(publicView, favoriteTitleResolver) {
  if (publicView.ladderPlacements.length > 0) {
    return publicView.ladderPlacements.map((placement) => ({
      title: favoriteTitleResolver(placement.gameSlug),
      value: placement.ratingLabel || `Rank #${placement.rank}`,
      meta: `Rank #${placement.rank}`,
      isPlaceholder: false,
    }));
  }

  return [{
    title: "Top Ladder Rankings",
    value: "Rank snapshots will appear here once shared standings come online.",
    isPlaceholder: true,
  }];
}

function createFriendCardItem({ title, value, meta, isPlaceholder = false }) {
  return {
    title,
    value,
    meta,
    isPlaceholder,
    avatarInitials: buildProfileInitials(value),
  };
}

function buildFriendItems(publicView, relationshipsRecord) {
  const normalizedRelationships = relationshipsRecord?.playerId
    ? normalizeProfileRelationshipsRecord(relationshipsRecord)
    : normalizeProfileRelationshipsRecord({ playerId: publicView.playerId });
  const resolvedSlots = resolveProfileFriendSlots(publicView, normalizedRelationships);

  const mainSqueezeItem = resolvedSlots.mainSqueeze
    ? createFriendCardItem({
        title: "Main Squeeze",
        value: resolvedSlots.mainSqueeze.profileName,
        meta: `${resolvedSlots.mainSqueeze.resolvedFriendPoints} friendship points`,
      })
    : createFriendCardItem({
        title: "Main Squeeze",
        value: "Awaiting Main Squeeze",
        meta: "Friendship points pending",
        isPlaceholder: true,
      });

  const friendPreviewItems = resolvedSlots.friendSlots.map((friend) => (
    friend
      ? createFriendCardItem({
          title: formatPresenceLabel(friend.presence),
          value: friend.profileName,
          meta: `${friend.resolvedFriendPoints} friendship points`,
        })
      : createFriendCardItem({
          title: "Friend Slot",
          value: "Awaiting Arcade Friend",
          meta: "Friendship points pending",
          isPlaceholder: true,
        })
  ));

  return [mainSqueezeItem, ...friendPreviewItems];
}

function buildHeroStats(publicView, resolvedThoughtCount, metricsRecord) {
  const normalizedMetrics = metricsRecord?.playerId
    ? normalizeProfileMetricsRecord(metricsRecord)
    : normalizeProfileMetricsRecord({ playerId: publicView.playerId });
  const derivedFriendCount = publicView.friendsPreview.length + (publicView.mainSqueeze ? 1 : 0);

  return [
    { label: "Thoughts", value: String(Math.max(resolvedThoughtCount, normalizedMetrics.thoughtPostCount)) },
    { label: "Friends", value: String(Math.max(derivedFriendCount, normalizedMetrics.friendCount)) },
    { label: "Sessions", value: String(normalizedMetrics.totalPlaySessionCount) },
    { label: "Events", value: String(normalizedMetrics.eventParticipationCount) },
  ];
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
  const favoriteGameItems = buildFavoriteGameItem(publicView, favoriteTitleResolver);
  const rankingItems = buildRankingItems(publicView, favoriteTitleResolver);
  const friendItems = buildFriendItems(publicView, relationshipsRecord);

  const heroName = publicView.profileName || "UNNAMED PILOT";
  const heroRealName = publicView.realName || "";
  const heroTagline = publicView.tagline || "No tagline set yet.";
  const heroBio = publicView.bio || "This shared player page will grow into your public home base across the arcade as more platform features come online.";
  const sessionPresence = resolveOwnerPresence(publicView.presence);
  const friendCodeValue = publicView.friendCode || "";

  const identityLinkItems = publicView.links.length > 0
    ? publicView.links.map((link) => ({
        label: link.label,
        value: link.url,
        kind: link.kind,
        isPlaceholder: false,
      }))
    : [{
        label: "Link Ports",
        value: "Profile links are not wired in yet.",
        kind: "placeholder",
        isPlaceholder: true,
      }];

  const badgeItems = publicView.badgeIds.length > 0
    ? publicView.badgeIds.map((badgeId) => ({
        label: humanizeToken(badgeId) || "Arcade Badge",
        isPlaceholder: false,
      }))
    : [{
        label: "Badge case still empty",
        isPlaceholder: true,
      }];

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

function renderPageHeader(doc, model) {
  if (!doc?.getElementById) return;

  const title = doc.getElementById("meStageTitle");
  const subtitle = doc.getElementById("meStageSubtitle");

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
    const itemClass = item.isPlaceholder ? "me-identity-link me-identity-link--placeholder" : "me-identity-link";
    const labelHtml = item.isPlaceholder ? "" : `<span class="me-identity-link__label">${escapeHtml(item.label)}</span>`;
    const valueHtml = item.isPlaceholder
      ? `<p class="me-identity-link__value">${escapeHtml(item.value)}</p>`
      : `<a class="me-identity-link__value" href="${escapeHtml(item.value)}" target="_blank" rel="noreferrer">${escapeHtml(item.value)}</a>`;

    return `
      <article class="${itemClass}">
        ${labelHtml}
        ${valueHtml}
      </article>
    `;
  }).join("");

  const rankingHtml = model.rankingItems.map((item) => `
    <article class="${item.isPlaceholder ? "me-hero-card__rail-item me-hero-card__rail-item--placeholder" : "me-hero-card__rail-item"}">
      ${item.isPlaceholder ? "" : `<p class="me-hero-card__rail-title">${escapeHtml(item.title || item.label)}</p>`}
      <div class="me-hero-card__rail-value-row">
        <p class="me-hero-card__rail-value">${escapeHtml(item.value)}</p>
        ${item.meta ? `<span class="me-hero-card__rail-meta">${escapeHtml(item.meta)}</span>` : ""}
      </div>
    </article>
  `).join("");

  const friendHtml = model.friendItems.map((item) => `
    <article class="${item.isPlaceholder ? "me-hero-card__friend-card me-hero-card__friend-card--placeholder" : "me-hero-card__friend-card"}">
      <div class="me-hero-card__friend-avatar" aria-hidden="true">
        <span class="me-hero-card__friend-avatar-text">${escapeHtml(item.avatarInitials || "??")}</span>
      </div>
      <div class="me-hero-card__friend-copy">
        <p class="me-hero-card__friend-label">${escapeHtml(item.title || "Friend Slot")}</p>
        <p class="me-hero-card__friend-name">${escapeHtml(item.value)}</p>
        <p class="me-hero-card__friend-points">${escapeHtml(item.meta || "Friendship points pending")}</p>
      </div>
    </article>
  `).join("");
  const statsHtml = (Array.isArray(model.heroStats) ? model.heroStats : []).map((item) => `
    <article class="me-hero-card__metrics-stat">
      <p class="me-hero-card__metrics-stat-label">${escapeHtml(item.label)}</p>
      <p class="me-hero-card__metrics-stat-value">${escapeHtml(item.value)}</p>
    </article>
  `).join("");

  const factoryId = model.heroMeta.find((item) => item.label === "Factory ID")?.value || "PENDING-ID";
  const realNameValue = model.heroRealName || "Not shared";
  const pageViewCount = model.pageViewCount || "0";

  container.innerHTML = `
    <div class="me-hero-card__backdrop" aria-hidden="true"></div>
    <section class="me-hero-card__portrait-panel">
      <div class="me-hero-card__portrait" aria-hidden="true">
        <div class="me-hero-card__portrait-shell">
          <div class="me-hero-card__portrait-frame">
            <div class="me-hero-card__portrait-fallback">${escapeHtml(model.avatarInitials)}</div>
            <img
              class="me-hero-card__portrait-image"
              src="${escapeHtml(model.avatarSrc)}"
              alt="${escapeHtml(model.avatarAlt)}"
            >
          </div>
        </div>
      </div>
    </section>
    <section class="me-hero-card__metrics-panel">
      <div class="me-hero-card__section-topline">
        <h3 class="me-hero-card__section-title">Profile Metrics</h3>
      </div>
      <div class="me-hero-card__metrics-grid">
        ${statsHtml}
      </div>
    </section>
    <section class="me-hero-card__identity-panel">
      <p class="me-hero-card__kicker">${escapeHtml(model.heroChipLabel)}</p>
      <div class="me-hero-card__identity-field">
        <span class="me-hero-card__identity-field-label">Name</span>
        <div class="me-hero-card__identity-field-value-row">
          <span class="me-hero-card__identity-field-value">${escapeHtml(realNameValue)}</span>
          <span class="me-presence-dot me-presence-dot--${escapeHtml(model.presenceToneClass)}" title="${escapeHtml(model.presenceLabel)}"></span>
        </div>
      </div>
      <div class="me-hero-card__identity-field me-hero-card__identity-field--stack">
        <span class="me-hero-card__identity-field-label">Page Views</span>
        <span class="me-hero-card__identity-field-value">${escapeHtml(pageViewCount)}</span>
      </div>
      <div class="me-hero-card__identity-field me-hero-card__identity-field--stack">
        <span class="me-hero-card__identity-field-label">Factory ID</span>
        <span class="me-hero-card__identity-field-value me-hero-card__identity-field-value--mono">${escapeHtml(factoryId)}</span>
      </div>
      <div class="me-hero-card__identity-field me-hero-card__identity-field--stack">
        <span class="me-hero-card__identity-field-label">Social Links</span>
        <div class="me-identity-links">
          ${linksHtml}
        </div>
      </div>
    </section>
    <section class="me-hero-card__rankings-panel">
      <div class="me-hero-card__section-topline">
        <h3 class="me-hero-card__section-title">Top Ladder Rankings</h3>
      </div>
      <div class="me-hero-card__rail-list">
        ${rankingHtml}
      </div>
    </section>
    <section class="me-hero-card__friends-panel">
      <div class="me-hero-card__section-topline">
        <h3 class="me-hero-card__section-title">Top Friends</h3>
      </div>
      <div class="me-hero-card__rail-list">
        ${friendHtml}
      </div>
    </section>
  `;

  const backdrop = container.querySelector(".me-hero-card__backdrop");
  const hasCustomBackdrop = !!model.backgroundImageUrl;
  if (backdrop) {
    if (hasCustomBackdrop) {
      backdrop.style.setProperty("--me-profile-backdrop-image", `url("${escapeCssUrl(model.backgroundImageUrl)}")`);
    } else {
      backdrop.style.removeProperty("--me-profile-backdrop-image");
    }
  }

  container.classList.toggle("me-hero-card--default-backdrop", !hasCustomBackdrop);
  container.classList.toggle("me-hero-card--custom-backdrop", hasCustomBackdrop);

  const hasCustomAvatar = !!model.avatarSrc && model.avatarSrc !== DEFAULT_PROFILE_PICTURE_SRC;
  container.classList.toggle("me-hero-card--default-avatar", !hasCustomAvatar);
  container.classList.toggle("me-hero-card--custom-avatar", hasCustomAvatar);

  const portraitImage = container.querySelector(".me-hero-card__portrait-image");
  if (!portraitImage) return;

  function showFallback() {
    container.classList.add("me-hero-card--avatar-fallback");
  }

  function showImage() {
    container.classList.remove("me-hero-card--avatar-fallback");
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
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    ${itemsHtml}
  `;
}

function renderFriendCodePanel(container, title, model) {
  if (!container) return;

  container.innerHTML = `
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    <div class="friend-code-card">
      <p class="friend-code-card__label">Your Friend Code</p>
      <p class="friend-code-card__value">${escapeHtml(model.friendCodeDisplay || "PENDING")}</p>
      <p class="friend-code-card__helper">Share this code so friends can link with you directly.</p>
      <form id="meFriendCodeForm" class="friend-code-form">
        <label class="friend-code-form__label" for="meFriendCodeInput">Add Friend By Code</label>
        <div class="friend-code-form__row">
          <input
            id="meFriendCodeInput"
            class="friend-code-form__input"
            name="friendCode"
            type="text"
            inputmode="text"
            maxlength="9"
            placeholder="ABCD-1234"
            spellcheck="false"
          >
          <button class="friend-code-form__submit" type="submit">Add Friend</button>
        </div>
        <p id="meFriendCodeFlash" class="friend-code-form__flash" aria-live="polite">${escapeHtml(model.friendCodeFlashMessage || "")}</p>
      </form>
    </div>
  `;
}

function renderCardItem(item) {
  const itemClass = item.isPlaceholder ? "me-card-item me-card-item--placeholder" : "me-card-item";
  const titleHtml = item.isPlaceholder ? "" : `<p class="me-card-item__title">${escapeHtml(item.title || item.label)}</p>`;
  const valueHtml = item.href
    ? `<a class="me-card-item__link" href="${escapeHtml(item.href)}">${escapeHtml(item.linkLabel || item.value)}</a>`
    : `<p class="me-card-item__value">${escapeHtml(item.value)}</p>`;
  const metaHtml = item.meta ? `<p class="me-card-item__meta">${escapeHtml(item.meta)}</p>` : "";

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
      <article class="game-card featured me-featured-cabinet__card game-card--placeholder" aria-disabled="true">
        <div class="game-card-preview">
          <div class="game-thumb me-featured-cabinet__thumb me-featured-cabinet__thumb--placeholder"></div>
          <div class="game-card-copy game-card-copy--placeholder">
            <h3 class="game-title">PIN A FAVORITE</h3>
          </div>
        </div>
      </article>
    `
    : `
      <a class="game-card featured me-featured-cabinet__card" href="${escapeHtml(favorite.href)}">
        <div class="game-card-preview">
          <div class="game-thumb me-featured-cabinet__thumb">
            <img class="me-featured-cabinet__image" src="${escapeHtml(favorite.previewSrc || "")}" alt="${escapeHtml(favorite.title || "Favorite cabinet preview")}">
          </div>
          <div class="game-card-copy">
            <h3 class="game-title">${escapeHtml(favorite.title || "Favorite Cabinet")}</h3>
          </div>
        </div>
      </a>
    `;

  container.innerHTML = `
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    <div class="me-featured-cabinet">
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
              <label class="thought-card__share-label" for="me-share-caption-${escapeHtml(item.id)}">Add your caption</label>
              <textarea
                id="me-share-caption-${escapeHtml(item.id)}"
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
      <form id="meThoughtComposer" class="thought-composer thought-composer--owner">
        <input
          id="meThoughtSubject"
          class="thought-composer__subject"
          name="subject"
          type="text"
          maxlength="80"
          placeholder="${escapeHtml(composer.subjectPlaceholder || "Optional headline")}"
        >
        <textarea
          id="meThoughtBody"
          class="thought-composer__body"
          name="text"
          rows="4"
          maxlength="500"
          placeholder="${escapeHtml(composer.textPlaceholder || "Share a thought.")}"
        ></textarea>
        <div class="thought-composer__actions">
          <button class="thought-composer__submit" type="submit">${escapeHtml(composer.submitLabel || "Post Thought")}</button>
          <p id="meThoughtComposerFlash" class="thought-composer__flash" aria-live="polite">${escapeHtml(composer.flashMessage || "")}</p>
        </div>
      </form>
    `
    : "";

  container.innerHTML = `
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    ${composerHtml}
    <div class="me-thoughts-feed thoughts-feed">
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
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    <p class="me-about-copy">${escapeHtml(text)}</p>
  `;
}

function renderBadgesPanel(container, title, items) {
  if (!container) return;

  const badgesHtml = items[0]?.isPlaceholder
    ? `<p class="me-badge-empty">${escapeHtml(items[0].label)}</p>`
    : `<div class="me-badge-list">${items.map((item) => `<span class="me-badge-chip">${escapeHtml(item.label)}</span>`).join("")}</div>`;

  container.innerHTML = `
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    ${badgesHtml}
  `;
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
  renderPageHeader(doc, model);
  renderHeroCard(doc.getElementById("meHeroCard"), model);
  renderThoughtsPanel(
    doc.getElementById("meThoughtsPanel"),
    "Player Feed",
    model.thoughtItems,
    model.thoughtComposer,
    {
      openReactionThoughtId: options?.openReactionThoughtId || "",
      sharePanelState: options?.sharePanelState || {},
      commentPanelState: options?.commentPanelState || {},
    },
  );
  renderFriendCodePanel(doc.getElementById("meFriendCodePanel"), "Friend Code", model);
  renderFavoritePanel(doc.getElementById("meFavoriteGamePanel"), "Favorite Game", model.favoriteGameItems[0]);
  const rankingsPanel = doc.getElementById("meRankingsPanel");
  if (rankingsPanel) {
    rankingsPanel.hidden = true;
    rankingsPanel.innerHTML = "";
  }
  const friendsPanel = doc.getElementById("meFriendsPanel");
  if (friendsPanel) {
    friendsPanel.hidden = true;
    friendsPanel.innerHTML = "";
  }
  renderAboutPanel(doc.getElementById("meAboutPanel"), "About Me", model.aboutText);
  renderBadgesPanel(doc.getElementById("meBadgesPanel"), "Badges", model.badgeItems);
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
