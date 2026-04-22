import { initArcadeProfilePanel } from "./arcade-profile.mjs";
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

function buildFriendItems(publicView) {
  const items = [];

  if (publicView.mainSqueeze) {
    items.push({
      title: "Main Squeeze",
      value: publicView.mainSqueeze.profileName,
      meta: `${publicView.mainSqueeze.friendPoints} friendship points`,
      isPlaceholder: false,
    });
  }

  if (publicView.friendsPreview.length > 0) {
    publicView.friendsPreview.forEach((friend) => {
      items.push({
        title: formatPresenceLabel(friend.presence),
        value: friend.profileName,
        meta: `${friend.friendPoints} friendship points`,
        isPlaceholder: false,
      });
    });
  }

  if (items.length > 0) {
    return items;
  }

  return [{
    title: "Top Friends",
    value: "Friends preview and main-squeeze slots are still warming up.",
    isPlaceholder: true,
  }];
}

export function buildMePageViewModel(profile, options = {}) {
  const publicView = buildPlayerProfileView(profile, options);
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : [];
  const playerThoughtFeed = buildPlayerThoughtFeed(thoughtFeed, publicView.playerId);
  const thoughtItems = buildThoughtCardItems(playerThoughtFeed, {
    placeholderId: "me-thought-placeholder",
    placeholderTitle: "Player Feed Warming Up",
    placeholderSummary: "Your player feed is waiting for the first shared thought. Status posts will land here once personal posting flows come online.",
  });
  const resolvedThoughtCount = Math.max(publicView.thoughtCount, playerThoughtFeed.length);
  const favoriteTitleResolver = typeof options?.favoriteTitleResolver === "function"
    ? options.favoriteTitleResolver
    : titleFromSlug;
  const favoriteGameItems = buildFavoriteGameItem(publicView, favoriteTitleResolver);
  const rankingItems = buildRankingItems(publicView, favoriteTitleResolver);
  const friendItems = buildFriendItems(publicView);

  const heroName = publicView.profileName || "UNNAMED PILOT";
  const heroRealName = publicView.realName || "";
  const heroTagline = publicView.tagline || "No tagline set yet.";
  const heroBio = publicView.bio || "This shared player page will grow into your public home base across the arcade as more platform features come online.";
  const sessionPresence = resolveOwnerPresence(publicView.presence);

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
    avatarSrc: DEFAULT_PROFILE_PICTURE_SRC,
    avatarAlt: `${heroName} portrait`,
    avatarInitials: buildProfileInitials(heroName),
    heroMeta: [
      { label: "Factory ID", value: publicView.playerId || "PENDING-ID" },
      { label: "Status", value: formatPresenceLabel(sessionPresence) },
      { label: "Badges", value: String(publicView.badgeIds.length) },
      { label: "Thoughts", value: String(resolvedThoughtCount) },
    ],
    avatarAssetId: publicView.avatarAssetId,
    backgroundImageUrl: publicView.backgroundImageUrl,
    identityLinkItems,
    favoriteGameItems,
    rankingItems,
    friendItems,
    thoughtItems,
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
    <article class="${item.isPlaceholder ? "me-hero-card__rail-item me-hero-card__rail-item--placeholder" : "me-hero-card__rail-item"}">
      ${item.isPlaceholder ? "" : `<p class="me-hero-card__rail-title">${escapeHtml(item.title || item.label)}</p>`}
      <div class="me-hero-card__rail-value-row">
        <p class="me-hero-card__rail-value">${escapeHtml(item.value)}</p>
        ${item.meta ? `<span class="me-hero-card__rail-meta">${escapeHtml(item.meta)}</span>` : ""}
      </div>
    </article>
  `).join("");

  const factoryId = model.heroMeta.find((item) => item.label === "Factory ID")?.value || "PENDING-ID";
  const realNameValue = model.heroRealName || "Not shared";

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
          <p class="me-hero-card__portrait-caption">Profile Pic</p>
        </div>
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
  if (backdrop) {
    backdrop.style.backgroundImage = model.backgroundImageUrl
      ? `url("${model.backgroundImageUrl}")`
      : "";
  }

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
    <h2 class="me-panel__title">${escapeHtml(title)}</h2>
    ${itemsHtml}
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
    <h2 class="me-panel__title">${escapeHtml(title)}</h2>
    <div class="me-featured-cabinet">
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

  return `
    <article class="${cardClass}">
      <div class="thought-card__signal-line">
        <span class="thought-card__author">${escapeHtml(item.authorLabel)}</span>
        <span class="thought-card__date">${escapeHtml(item.publishedLabel)}</span>
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

function renderThoughtsPanel(container, title, items) {
  if (!container) return;

  container.innerHTML = `
    <h2 class="me-panel__title">${escapeHtml(title)}</h2>
    <div class="me-thoughts-feed thoughts-feed">
      ${items.map(renderThoughtItem).join("")}
    </div>
  `;
}

function renderAboutPanel(container, title, text) {
  if (!container) return;

  container.innerHTML = `
    <h2 class="me-panel__title">${escapeHtml(title)}</h2>
    <p class="me-about-copy">${escapeHtml(text)}</p>
  `;
}

function renderBadgesPanel(container, title, items) {
  if (!container) return;

  const badgesHtml = items[0]?.isPlaceholder
    ? `<p class="me-badge-empty">${escapeHtml(items[0].label)}</p>`
    : `<div class="me-badge-list">${items.map((item) => `<span class="me-badge-chip">${escapeHtml(item.label)}</span>`).join("")}</div>`;

  container.innerHTML = `
    <h2 class="me-panel__title">${escapeHtml(title)}</h2>
    ${badgesHtml}
  `;
}

export function renderMePage(doc = globalThis.document, profile = loadFactoryProfile(), options = {}) {
  if (!doc?.getElementById) return null;

  const storage = options.storage || getDefaultPlatformStorage();
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : loadThoughtFeed(storage);
  const model = buildMePageViewModel(profile, { thoughtFeed });
  renderPageHeader(doc, model);
  renderHeroCard(doc.getElementById("meHeroCard"), model);
  renderThoughtsPanel(doc.getElementById("meThoughtsPanel"), "Player Feed", model.thoughtItems);
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
  const profilePanel = initArcadeProfilePanel();
  renderMePage(doc);

  const rerender = () => {
    profilePanel?.render?.("");
    renderMePage(doc);
  };

  doc.getElementById("playerProfileForm")?.addEventListener("submit", () => {
    queueMicrotask(rerender);
  });

  doc.getElementById("playerProfileClear")?.addEventListener("click", () => {
    queueMicrotask(rerender);
  });
}
