import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { buildPlayerProfileView } from "./platform/profile/profile.mjs";
import { getDefaultPlatformStorage } from "./platform/storage/storage.mjs";
import {
  buildPlayerThoughtFeed,
  buildThoughtCardItems,
  loadThoughtFeed,
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
  const favoriteTitleResolver = typeof options?.favoriteTitleResolver === "function"
    ? options.favoriteTitleResolver
    : titleFromSlug;

  if (!profile) {
    return {
      state: "missing",
      heroName: "UNKNOWN PILOT",
      heroTagline: "Signal not present on this local cabinet.",
      heroBio: "This public player file is not available in the local arcade cache yet. Open the Me page to inspect the current local profile or load this player from a future shared source.",
      heroChipLabel: "LOCAL CACHE ONLY",
      avatarSrc: DEFAULT_PROFILE_PICTURE_SRC,
      avatarAlt: "Unknown pilot portrait",
      avatarInitials: "??",
      heroMeta: [
        { label: "Requested ID", value: requestedPlayerId || "NO-ID" },
        { label: "Status", value: "Offline" },
        { label: "Badges", value: "0" },
        { label: "Thoughts", value: "0" },
      ],
      linkItems: [{
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
  });
  const resolvedThoughtCount = Math.max(publicView.thoughtCount, playerThoughtFeed.length);
  const linkItems = publicView.links.length > 0
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
  const heroTagline = publicView.tagline || "Public player file humming under the neon skyline.";
  const heroBio = publicView.bio || "This public player file is running in local-first mode while broader arcade profile discovery comes online.";
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
    heroName,
    heroTagline,
    heroBio,
    heroChipLabel: "PUBLIC PLAYER PROFILE",
    presenceLabel: formatPresenceLabel(publicView.presence),
    presenceToneClass: buildPresenceToneClass(publicView.presence),
    avatarSrc: publicView.avatarUrl || DEFAULT_PROFILE_PICTURE_SRC,
    avatarAlt: `${heroName} portrait`,
    avatarInitials: buildProfileInitials(heroName),
    heroMeta: [
      { label: "Factory ID", value: publicView.playerId || requestedPlayerId || "PENDING-ID" },
      { label: "Status", value: formatPresenceLabel(publicView.presence) },
      { label: "Badges", value: String(publicView.badgeIds.length) },
      { label: "Thoughts", value: String(resolvedThoughtCount) },
    ],
    backgroundImageUrl: publicView.backgroundImageUrl,
    linkItems,
    favoriteGameItems,
    rankingItems,
    friendItems,
    thoughtItems,
    aboutText: heroBio,
    badgeItems,
  };
}

function renderHeroCard(container, model) {
  if (!container) return;

  const metaHtml = model.heroMeta.map((item) => `
    <div class="player-meta-block">
      <span class="player-meta-block__label">${escapeHtml(item.label)}</span>
      <span class="player-meta-block__value">${escapeHtml(item.value)}</span>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="player-hero-card__backdrop" aria-hidden="true"></div>
    <div class="player-hero-card__copy">
      <p class="player-hero-card__kicker">${escapeHtml(model.heroChipLabel)}</p>
      <div class="player-hero-card__identity-row">
        <h2 class="player-hero-card__name">${escapeHtml(model.heroName)}</h2>
        <span class="player-presence-dot player-presence-dot--${escapeHtml(model.presenceToneClass || "offline")}" title="${escapeHtml(model.presenceLabel || "Offline")}"></span>
      </div>
      <p class="player-hero-card__tagline">${escapeHtml(model.heroTagline)}</p>
      <p class="player-hero-card__bio">${escapeHtml(model.heroBio)}</p>
    </div>
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
        <p class="player-hero-card__portrait-caption">Public player portrait</p>
      </div>
    </div>
    <div class="player-hero-card__meta">${metaHtml}</div>
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

function renderPanel(container, title, subtitle, items, formatter) {
  if (!container) return;

  const itemsHtml = items.map(formatter).join("");

  container.innerHTML = `
    <div class="player-panel__topline">
      <p class="player-panel__eyebrow">${escapeHtml(subtitle)}</p>
      <h2 class="player-panel__title">${escapeHtml(title)}</h2>
    </div>
    ${itemsHtml}
  `;
}

function renderLinkItem(item) {
  const itemClass = item.isPlaceholder ? "player-link player-link--placeholder" : "player-link";
  const valueHtml = item.isPlaceholder
    ? `<p class="player-link__url">${escapeHtml(item.value)}</p>`
    : `<a class="player-link__url" href="${escapeHtml(item.value)}" target="_blank" rel="noreferrer">${escapeHtml(item.value)}</a>`;

  return `
    <article class="${itemClass}">
      <div class="player-link__topline">
        <span class="player-link__label">${escapeHtml(item.label)}</span>
        <span class="player-link__kind">${escapeHtml(item.kind)}</span>
      </div>
      ${valueHtml}
    </article>
  `;
}

function renderCardItem(item) {
  const itemClass = item.isPlaceholder ? "player-card-item player-card-item--placeholder" : "player-card-item";
  const valueHtml = item.href
    ? `<a class="player-card-item__link" href="${escapeHtml(item.href)}">${escapeHtml(item.linkLabel || item.value)}</a>`
    : `<p class="player-card-item__value">${escapeHtml(item.value)}</p>`;
  const metaHtml = item.meta ? `<p class="player-card-item__meta">${escapeHtml(item.meta)}</p>` : "";

  return `
    <article class="${itemClass}">
      <p class="player-card-item__title">${escapeHtml(item.title || item.label)}</p>
      ${valueHtml}
      ${metaHtml}
    </article>
  `;
}

function renderThoughtItem(item) {
  const cardClass = item.isPlaceholder ? "thought-card thought-card--placeholder" : "thought-card";

  return `
    <article class="${cardClass}">
      <div class="thought-card__topline">
        <span class="thought-card__author">${escapeHtml(item.authorLabel)}</span>
        <span class="thought-card__date">${escapeHtml(item.publishedLabel)}</span>
      </div>
      <h2 class="thought-card__title">${escapeHtml(item.title)}</h2>
      <p class="thought-card__summary">${escapeHtml(item.summary)}</p>
      <div class="thought-card__meta">
        <span>${escapeHtml(item.commentLabel)}</span>
        <span>${escapeHtml(item.shareLabel)}</span>
      </div>
    </article>
  `;
}

function renderThoughtsPanel(container, title, subtitle, items) {
  if (!container) return;

  container.innerHTML = `
    <div class="player-panel__topline">
      <p class="player-panel__eyebrow">${escapeHtml(subtitle)}</p>
      <h2 class="player-panel__title">${escapeHtml(title)}</h2>
    </div>
    <div class="player-thoughts-feed thoughts-feed">
      ${items.map(renderThoughtItem).join("")}
    </div>
  `;
}

function renderAboutPanel(container, title, subtitle, text) {
  if (!container) return;

  container.innerHTML = `
    <div class="player-panel__topline">
      <p class="player-panel__eyebrow">${escapeHtml(subtitle)}</p>
      <h2 class="player-panel__title">${escapeHtml(title)}</h2>
    </div>
    <p class="player-about-copy">${escapeHtml(text)}</p>
  `;
}

function renderBadgesPanel(container, title, subtitle, items) {
  if (!container) return;

  const badgesHtml = items[0]?.isPlaceholder
    ? `<p class="player-badge-empty">${escapeHtml(items[0].label)}</p>`
    : `<div class="player-badge-list">${items.map((item) => `<span class="player-badge-chip">${escapeHtml(item.label)}</span>`).join("")}</div>`;

  container.innerHTML = `
    <div class="player-panel__topline">
      <p class="player-panel__eyebrow">${escapeHtml(subtitle)}</p>
      <h2 class="player-panel__title">${escapeHtml(title)}</h2>
    </div>
    ${badgesHtml}
  `;
}

export function renderPlayerPage(doc = globalThis.document, options = {}) {
  if (!doc?.getElementById) return null;

  const params = new URLSearchParams(options.search || globalThis.location?.search || "");
  const requestedPlayerId = sanitizePlayerId(params.get("id"));
  const storage = options.storage || getDefaultPlatformStorage();
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : loadThoughtFeed(storage);
  const profile = options.profile ?? loadRequestedPlayerProfile(storage, requestedPlayerId, { thoughtFeed });
  const model = buildPlayerPageViewModel(profile, { requestedPlayerId, thoughtFeed });

  renderHeroCard(doc.getElementById("playerHeroCard"), model);
  renderThoughtsPanel(doc.getElementById("playerThoughtsPanel"), "Player Feed", "Status Lane", model.thoughtItems);
  renderPanel(doc.getElementById("playerLinksPanel"), "Link Ports", "Signal Board", model.linkItems, renderLinkItem);
  renderPanel(doc.getElementById("playerFavoritePanel"), "Favorite Cabinet", "Grid Anchor", model.favoriteGameItems, renderCardItem);
  renderPanel(doc.getElementById("playerRankingsPanel"), "Top Ladder Rankings", "Scoreboard Echo", model.rankingItems, renderCardItem);
  renderPanel(doc.getElementById("playerFriendsPanel"), "Top Friends", "Social Orbit", model.friendItems, renderCardItem);
  renderAboutPanel(doc.getElementById("playerAboutPanel"), "About Me", "Player Bio", model.aboutText);
  renderBadgesPanel(doc.getElementById("playerBadgesPanel"), "Badges", "Cabinet Shine", model.badgeItems);
  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  renderPlayerPage(doc);
}
