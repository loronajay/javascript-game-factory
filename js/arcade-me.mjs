import { initArcadeProfilePanel } from "./arcade-profile.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { buildPlayerProfileView } from "./platform/profile/profile.mjs";

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
  const favoriteTitleResolver = typeof options?.favoriteTitleResolver === "function"
    ? options.favoriteTitleResolver
    : titleFromSlug;
  const favoriteGameItems = buildFavoriteGameItem(publicView, favoriteTitleResolver);
  const rankingItems = buildRankingItems(publicView, favoriteTitleResolver);
  const friendItems = buildFriendItems(publicView);

  const heroName = publicView.profileName || "UNNAMED PILOT";
  const heroTagline = publicView.tagline || "Arcade card warming up under the neon glass.";
  const heroBio = publicView.bio || "This shared player page will grow into your public home base across the arcade as more platform features come online.";
  const heroChipLabel = publicView.profileName ? "RETURNING PILOT" : "FACTORY PILOT";

  const linkItems = publicView.links.length > 0
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

  const activityItems = publicView.recentActivity.length > 0
    ? publicView.recentActivity.map((entry, index) => ({
        label: typeof entry.label === "string" && entry.label.trim() ? entry.label.trim() : `Activity ${index + 1}`,
        value: typeof entry.summary === "string" && entry.summary.trim()
          ? entry.summary.trim()
          : (typeof entry.value === "string" && entry.value.trim() ? entry.value.trim() : "Arcade floor signal logged."),
        isPlaceholder: false,
      }))
    : [{
        label: "Floor Activity",
        value: "Shared thoughts and friend activity are still warming up.",
        isPlaceholder: true,
      }];

  return {
    heroName,
    heroTagline,
    heroBio,
    heroChipLabel,
    avatarSrc: DEFAULT_PROFILE_PICTURE_SRC,
    avatarAlt: `${heroName} portrait`,
    avatarInitials: buildProfileInitials(heroName),
    heroMeta: [
      { label: "Factory ID", value: publicView.playerId || "PENDING-ID" },
      { label: "Status", value: formatPresenceLabel(publicView.presence) },
      { label: "Badges", value: String(publicView.badgeIds.length) },
      { label: "Thoughts", value: String(publicView.thoughtCount) },
    ],
    avatarAssetId: publicView.avatarAssetId,
    backgroundImageUrl: publicView.backgroundImageUrl,
    linkItems,
    favoriteGameItems,
    rankingItems,
    friendItems,
    activityItems,
  };
}

function renderHeroCard(container, model) {
  if (!container) return;

  const metaHtml = model.heroMeta.map((item) => `
    <div class="me-meta-block">
      <span class="me-meta-block__label">${escapeHtml(item.label)}</span>
      <span class="me-meta-block__value">${escapeHtml(item.value)}</span>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="me-hero-card__copy">
      <p class="me-hero-card__kicker">${escapeHtml(model.heroChipLabel)}</p>
      <h2 class="me-hero-card__name">${escapeHtml(model.heroName)}</h2>
      <p class="me-hero-card__tagline">${escapeHtml(model.heroTagline)}</p>
      <p class="me-hero-card__bio">${escapeHtml(model.heroBio)}</p>
    </div>
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
        <p class="me-hero-card__portrait-caption">Default arcade portrait</p>
      </div>
    </div>
    <div class="me-hero-card__meta">${metaHtml}</div>
  `;

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

function renderPanel(container, title, subtitle, items, formatter) {
  if (!container) return;

  const itemsHtml = items.map(formatter).join("");

  container.innerHTML = `
    <div class="me-panel__topline">
      <p class="me-panel__eyebrow">${escapeHtml(subtitle)}</p>
      <h2 class="me-panel__title">${escapeHtml(title)}</h2>
    </div>
    ${itemsHtml}
  `;
}

function renderLinkItem(item) {
  const itemClass = item.isPlaceholder ? "me-link me-link--placeholder" : "me-link";
  const valueHtml = item.isPlaceholder
    ? `<p class="me-link__url">${escapeHtml(item.value)}</p>`
    : `<a class="me-link__url" href="${escapeHtml(item.value)}" target="_blank" rel="noreferrer">${escapeHtml(item.value)}</a>`;

  return `
    <article class="${itemClass}">
      <div class="me-link__topline">
        <span class="me-link__label">${escapeHtml(item.label)}</span>
        <span class="me-link__kind">${escapeHtml(item.kind)}</span>
      </div>
      ${valueHtml}
    </article>
  `;
}

function renderCardItem(item) {
  const itemClass = item.isPlaceholder ? "me-card-item me-card-item--placeholder" : "me-card-item";
  const valueHtml = item.href
    ? `<a class="me-card-item__link" href="${escapeHtml(item.href)}">${escapeHtml(item.linkLabel || item.value)}</a>`
    : `<p class="me-card-item__value">${escapeHtml(item.value)}</p>`;
  const metaHtml = item.meta ? `<p class="me-card-item__meta">${escapeHtml(item.meta)}</p>` : "";

  return `
    <article class="${itemClass}">
      <p class="me-card-item__title">${escapeHtml(item.title || item.label)}</p>
      ${valueHtml}
      ${metaHtml}
    </article>
  `;
}

export function renderMePage(doc = globalThis.document, profile = loadFactoryProfile()) {
  if (!doc?.getElementById) return null;

  const model = buildMePageViewModel(profile);
  renderHeroCard(doc.getElementById("meHeroCard"), model);
  renderPanel(doc.getElementById("meLinksPanel"), "Link Ports", "Signal Board", model.linkItems, renderLinkItem);
  renderPanel(doc.getElementById("meFavoriteGamePanel"), "Favorite Cabinet", "Grid Anchor", model.favoriteGameItems, renderCardItem);
  renderPanel(doc.getElementById("meRankingsPanel"), "Top Ladder Rankings", "Scoreboard Echo", model.rankingItems, renderCardItem);
  renderPanel(doc.getElementById("meFriendsPanel"), "Top Friends", "Social Orbit", model.friendItems, renderCardItem);
  renderPanel(doc.getElementById("meActivityPanel"), "Recent Floor Activity", "Afterglow", model.activityItems, renderCardItem);
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
