import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { buildPlayerProfileView } from "./platform/profile/profile.mjs";
import { getDefaultPlatformStorage } from "./platform/storage/storage.mjs";

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

function normalizeStringList(value) {
  if (!Array.isArray(value)) return [];

  const seen = new Set();
  const normalized = [];

  for (const entry of value) {
    const item = typeof entry === "string" ? entry.trim() : "";
    if (!item || seen.has(item)) continue;
    seen.add(item);
    normalized.push(item);
  }

  return normalized;
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

function buildActivityItems(publicView, profile) {
  if (publicView.recentActivity.length > 0) {
    return publicView.recentActivity.map((entry, index) => ({
      label: typeof entry.label === "string" && entry.label.trim()
        ? entry.label.trim()
        : `Activity ${index + 1}`,
      value: typeof entry.summary === "string" && entry.summary.trim()
        ? entry.summary.trim()
        : (typeof entry.value === "string" && entry.value.trim() ? entry.value.trim() : "Arcade floor signal logged."),
      isPlaceholder: false,
    }));
  }

  const recentPartners = normalizeStringList(profile?.recentPartners);
  if (recentPartners.length > 0) {
    return recentPartners.map((name) => ({
      label: "Recent Partner",
      value: name,
      isPlaceholder: false,
    }));
  }

  return [{
    label: "Floor Activity",
    value: "Recent public activity is not cached on this cabinet yet.",
    isPlaceholder: true,
  }];
}

export function loadRequestedPlayerProfile(storage = getDefaultPlatformStorage(), requestedPlayerId = "") {
  const cachedProfile = loadFactoryProfile(storage);
  const routePlayerId = sanitizePlayerId(requestedPlayerId);

  if (!routePlayerId || routePlayerId === cachedProfile.playerId) {
    return cachedProfile;
  }

  return null;
}

export function buildPlayerPageViewModel(profile, options = {}) {
  const requestedPlayerId = sanitizePlayerId(options.requestedPlayerId);
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
        { label: "Featured Cabinets", value: "0" },
        { label: "Thought Count", value: "0" },
      ],
      linkItems: [{
        label: "Link Ports",
        value: "No public links are cached for this player yet.",
        kind: "placeholder",
        isPlaceholder: true,
      }],
      featuredItems: [{
        title: "Featured Cabinets",
        value: "Public cabinet picks will appear here once player discovery is wired in.",
        isPlaceholder: true,
      }],
      activityItems: [{
        label: "Floor Activity",
        value: "Recent public activity is not cached on this cabinet yet.",
        isPlaceholder: true,
      }],
    };
  }

  const publicView = buildPlayerProfileView(profile, options);
  const featuredGames = publicView.featuredGames.length > 0
    ? publicView.featuredGames
    : normalizeStringList(profile?.favorites);
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
  const featuredItems = featuredGames.length > 0
    ? featuredGames.map((slug) => ({
        title: favoriteTitleResolver(slug),
        value: slug,
        isPlaceholder: false,
      }))
    : [{
        title: "Featured Cabinets",
        value: "No featured cabinets are pinned on this player file yet.",
        isPlaceholder: true,
      }];
  const activityItems = buildActivityItems(publicView, profile);
  const heroName = publicView.profileName || "UNNAMED PILOT";
  const heroTagline = publicView.tagline || "Public player file humming under the neon skyline.";
  const heroBio = publicView.bio || "This public player file is running in local-first mode while broader arcade profile discovery comes online.";

  return {
    state: "ready",
    heroName,
    heroTagline,
    heroBio,
    heroChipLabel: "PUBLIC PLAYER PROFILE",
    avatarSrc: publicView.avatarUrl || DEFAULT_PROFILE_PICTURE_SRC,
    avatarAlt: `${heroName} portrait`,
    avatarInitials: buildProfileInitials(heroName),
    heroMeta: [
      { label: "Factory ID", value: publicView.playerId || requestedPlayerId || "PENDING-ID" },
      { label: "Featured Cabinets", value: String(featuredGames.length) },
      { label: "Thought Count", value: String(publicView.thoughtCount) },
    ],
    linkItems,
    featuredItems,
    activityItems,
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
    <div class="player-hero-card__copy">
      <p class="player-hero-card__kicker">${escapeHtml(model.heroChipLabel)}</p>
      <h2 class="player-hero-card__name">${escapeHtml(model.heroName)}</h2>
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

  return `
    <article class="${itemClass}">
      <p class="player-card-item__title">${escapeHtml(item.title || item.label)}</p>
      <p class="player-card-item__value">${escapeHtml(item.value)}</p>
    </article>
  `;
}

export function renderPlayerPage(doc = globalThis.document, options = {}) {
  if (!doc?.getElementById) return null;

  const params = new URLSearchParams(options.search || globalThis.location?.search || "");
  const requestedPlayerId = sanitizePlayerId(params.get("id"));
  const storage = options.storage || getDefaultPlatformStorage();
  const profile = options.profile ?? loadRequestedPlayerProfile(storage, requestedPlayerId);
  const model = buildPlayerPageViewModel(profile, { requestedPlayerId });

  renderHeroCard(doc.getElementById("playerHeroCard"), model);
  renderPanel(doc.getElementById("playerLinksPanel"), "Link Ports", "Signal Board", model.linkItems, renderLinkItem);
  renderPanel(doc.getElementById("playerFeaturedPanel"), "Featured Cabinets", "Public Lineup", model.featuredItems, renderCardItem);
  renderPanel(doc.getElementById("playerActivityPanel"), "Recent Floor Activity", "Afterglow", model.activityItems, renderCardItem);
  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  renderPlayerPage(doc);
}
