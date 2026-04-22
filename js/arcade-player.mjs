import { initArcadeProfilePanel } from "./arcade-profile.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { buildPlayerProfileView } from "./platform/profile/profile.mjs";
import { getDefaultPlatformStorage } from "./platform/storage/storage.mjs";
import {
  buildPlayerThoughtFeed,
  buildThoughtCardItems,
  deleteThoughtPost,
  loadThoughtFeed,
  publishThoughtPost,
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

function sanitizePlayerId(value) {
  return typeof value === "string" ? value.trim() : "";
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

export function loadRequestedPlayerProfile(storage = getDefaultPlatformStorage(), requestedPlayerId = "", options = {}) {
  const cachedProfile = loadFactoryProfile(storage);
  const routePlayerId = sanitizePlayerId(requestedPlayerId);
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : [];

  if (!routePlayerId || routePlayerId === cachedProfile.playerId) {
    return cachedProfile;
  }

  return buildThoughtBackedProfile(thoughtFeed, routePlayerId);
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
      avatarSrc: DEFAULT_PROFILE_PICTURE_SRC,
      avatarAlt: "Unknown pilot portrait",
      avatarInitials: "??",
      heroMeta: [
        { label: "Requested ID", value: requestedPlayerId || "NO-ID" },
        { label: "Status", value: "Offline" },
        { label: "Badges", value: "0" },
        { label: "Thoughts", value: "0" },
      ],
      identityLinkItems: [{
        label: "Link Ports",
        value: "No public links are cached for this player yet.",
        kind: "placeholder",
        isPlaceholder: true,
      }],
      favoriteGameItems: [{
        title: "Favorite Cabinet",
        value: "A favorite game link will appear here once profile favorites are wired in.",
        isPlaceholder: true,
      }],
      rankingItems: [{
        title: "Top Ladder Rankings",
        value: "Rank snapshots are not cached for this player yet.",
        isPlaceholder: true,
      }],
      friendItems: [{
        title: "Top Friends",
        value: "Friend preview data is not cached for this player yet.",
        isPlaceholder: true,
      }],
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
  const identityLinkItems = publicView.links.length > 0
    ? publicView.links.map((link) => ({
        label: link.label,
        value: link.url,
        kind: link.kind,
        isPlaceholder: false,
      }))
    : [{
        label: "Link Ports",
        value: "This player has not pinned any public links yet.",
        kind: "placeholder",
        isPlaceholder: true,
      }];
  const favoriteSlug = publicView.favoriteGameSlug || publicView.featuredGames[0] || "";
  const favoriteGameItems = favoriteSlug
    ? [{
        title: favoriteTitleResolver(favoriteSlug),
        value: favoriteSlug,
        href: gameHrefFromSlug(favoriteSlug),
        previewSrc: gamePreviewSrcFromSlug(favoriteSlug),
        linkLabel: "Launch Cabinet",
        isPlaceholder: false,
      }]
    : [{
        title: "Favorite Cabinet",
        value: "No favorite cabinet is pinned on this player file yet.",
        isPlaceholder: true,
      }];
  const rankingItems = publicView.ladderPlacements.length > 0
    ? publicView.ladderPlacements.map((placement) => ({
        title: favoriteTitleResolver(placement.gameSlug),
        value: placement.ratingLabel || `Rank #${placement.rank}`,
        meta: `Rank #${placement.rank}`,
        isPlaceholder: false,
      }))
    : [{
        title: "Top Ladder Rankings",
        value: "No shared ranking snapshots are attached to this player file yet.",
        isPlaceholder: true,
      }];
  const friendItems = [];
  if (publicView.mainSqueeze) {
    friendItems.push({
      title: "Main Squeeze",
      value: publicView.mainSqueeze.profileName,
      meta: `${publicView.mainSqueeze.friendPoints} friendship points`,
      isPlaceholder: false,
    });
  }
  publicView.friendsPreview.forEach((friend) => {
    friendItems.push({
      title: formatPresenceLabel(friend.presence),
      value: friend.profileName,
      meta: `${friend.friendPoints} friendship points`,
      isPlaceholder: false,
    });
  });
  if (friendItems.length === 0) {
    friendItems.push({
      title: "Top Friends",
      value: "No friend preview is cached on this player file yet.",
      isPlaceholder: true,
    });
  }
  const heroName = publicView.profileName || "UNNAMED PILOT";
  const heroRealName = publicView.realName || "";
  const heroTagline = publicView.tagline || "No tagline set yet.";
  const heroBio = publicView.bio || "This public player file is running in local-first mode while broader arcade profile discovery comes online.";
  const resolvedPresence = resolveProfilePresence(publicView.presence, isOwnerView);
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
    avatarSrc: publicView.avatarUrl || DEFAULT_PROFILE_PICTURE_SRC,
    avatarAlt: `${heroName} portrait`,
    avatarInitials: buildProfileInitials(heroName),
    heroMeta: [
      { label: "Factory ID", value: publicView.playerId || requestedPlayerId || "PENDING-ID" },
      { label: "Status", value: formatPresenceLabel(resolvedPresence) },
      { label: "Badges", value: String(publicView.badgeIds.length) },
      { label: "Thoughts", value: String(resolvedThoughtCount) },
    ],
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
    <article class="${item.isPlaceholder ? "player-hero-card__rail-item player-hero-card__rail-item--placeholder" : "player-hero-card__rail-item"}">
      ${item.isPlaceholder ? "" : `<p class="player-hero-card__rail-title">${escapeHtml(item.title || item.label)}</p>`}
      <div class="player-hero-card__rail-value-row">
        <p class="player-hero-card__rail-value">${escapeHtml(item.value)}</p>
        ${item.meta ? `<span class="player-hero-card__rail-meta">${escapeHtml(item.meta)}</span>` : ""}
      </div>
    </article>
  `).join("");

  const factoryId = model.heroMeta.find((item) => item.label === "Factory ID")?.value || "PENDING-ID";
  const realNameValue = model.heroRealName || "Not shared";

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
        <span class="player-hero-card__identity-field-label">Factory ID</span>
        <span class="player-hero-card__identity-field-value player-hero-card__identity-field-value--mono">${escapeHtml(factoryId)}</span>
      </div>
      <div class="player-hero-card__identity-field player-hero-card__identity-field--stack">
        <span class="player-hero-card__identity-field-label">Social Links</span>
        <div class="player-identity-links">
          ${linksHtml}
        </div>
      </div>
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
  if (backdrop) {
    backdrop.style.backgroundImage = model.backgroundImageUrl
      ? `url("${model.backgroundImageUrl}")`
      : "";
  }

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
    <h2 class="player-panel__title">${escapeHtml(title)}</h2>
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
    <h2 class="player-panel__title">${escapeHtml(title)}</h2>
    <div class="player-featured-cabinet">
      ${cardHtml}
    </div>
  `;
}

function renderThoughtItem(item) {
  const cardClass = item.isPlaceholder ? "thought-card thought-card--placeholder" : "thought-card";
  const actionItems = Array.isArray(item.actionItems) && item.actionItems.length > 0
    ? item.actionItems
    : [
        { label: "Comments" },
        { label: "Share" },
        { label: "React" },
      ];
  const actionsHtml = actionItems.map((action) => `
    <span class="thought-card__action">${escapeHtml(action.label)}</span>
  `).join("");
  const deleteHtml = item.canDelete
    ? `<button class="thought-card__delete" type="button" data-delete-id="${escapeHtml(item.id)}" aria-label="Delete thought">Delete</button>`
    : "";

  return `
    <article class="${cardClass}">
      <div class="thought-card__signal-line">
        <span class="thought-card__author">${escapeHtml(item.authorLabel)}</span>
        <span class="thought-card__date">${escapeHtml(item.publishedLabel)}</span>
        ${deleteHtml}
      </div>
      <div class="thought-card__topline">
        <h2 class="thought-card__title">${escapeHtml(item.title)}</h2>
        <div class="thought-card__reactions">
          <span>${escapeHtml(item.reactionLabel)}</span>
          <span>${escapeHtml(item.shareLabel)}</span>
        </div>
      </div>
      <p class="thought-card__summary">${escapeHtml(item.summary)}</p>
      <div class="thought-card__actions">
        ${actionsHtml}
      </div>
    </article>
  `;
}

function renderThoughtsPanel(container, title, items, composer = null) {
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
    <h2 class="player-panel__title">${escapeHtml(title)}</h2>
    ${composerHtml}
    <div class="player-thoughts-feed thoughts-feed">
      ${items.map(renderThoughtItem).join("")}
    </div>
  `;
}

function renderAboutPanel(container, title, text) {
  if (!container) return;

  container.innerHTML = `
    <h2 class="player-panel__title">${escapeHtml(title)}</h2>
    <p class="player-about-copy">${escapeHtml(text)}</p>
  `;
}

function renderBadgesPanel(container, title, items) {
  if (!container) return;

  const badgesHtml = items[0]?.isPlaceholder
    ? `<p class="player-badge-empty">${escapeHtml(items[0].label)}</p>`
    : `<div class="player-badge-list">${items.map((item) => `<span class="player-badge-chip">${escapeHtml(item.label)}</span>`).join("")}</div>`;

  container.innerHTML = `
    <h2 class="player-panel__title">${escapeHtml(title)}</h2>
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
  const model = buildPlayerPageViewModel(profile, {
    requestedPlayerId,
    thoughtFeed,
    isOwnerView,
    thoughtComposerFlash: options?.thoughtComposerFlash || "",
  });

  const editButton = doc.getElementById("playerProfileButton");
  if (editButton) {
    editButton.hidden = !model.showEditProfileButton;
  }

  renderPageHeader(doc, model);
  renderHeroCard(doc.getElementById("playerHeroCard"), model);
  renderThoughtsPanel(doc.getElementById("playerThoughtsPanel"), "Player Feed", model.thoughtItems, model.thoughtComposer);
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
  const profilePanel = initArcadeProfilePanel({ doc });
  renderPlayerPage(doc);

  const rerender = (thoughtComposerFlash = "") => {
    profilePanel?.render?.("");
    renderPlayerPage(doc, { thoughtComposerFlash });
  };

  doc.getElementById("playerProfileForm")?.addEventListener("submit", () => {
    queueMicrotask(rerender);
  });

  doc.getElementById("playerProfileClear")?.addEventListener("click", () => {
    queueMicrotask(rerender);
  });

  doc.addEventListener("submit", (event) => {
    const form = event.target;
    if (!form || typeof form !== "object" || form.id !== "playerThoughtComposer") {
      return;
    }

    event.preventDefault();

    const storage = getDefaultPlatformStorage();
    const currentProfile = loadFactoryProfile(storage);
    const subjectInput = doc.getElementById("playerThoughtSubject");
    const bodyInput = doc.getElementById("playerThoughtBody");
    const saved = publishThoughtPost({
      authorPlayerId: currentProfile.playerId,
      authorDisplayName: currentProfile.profileName || "UNNAMED PILOT",
      subject: subjectInput?.value || "",
      text: bodyInput?.value || "",
      visibility: "public",
    }, storage);

    if (!saved) {
      rerender("Write a thought before posting.");
      return;
    }

    rerender("Thought posted.");
  });

  doc.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-id]");
    if (!button) return;

    const id = button.dataset.deleteId;
    if (!id) return;

    deleteThoughtPost(id, getDefaultPlatformStorage());
    rerender();
  });
}
