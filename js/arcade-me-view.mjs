import {
  createProfileSocialViewRenderer,
  escapeCssUrl,
  escapeHtml,
} from "./profile-social/social-view.mjs";
import {
  renderAboutPanel,
  renderBadgesPanel,
  renderFavoritePanel,
  renderFriendCodePanel,
  renderFriendNavigatorPanel,
  renderRailPanel,
} from "./me-page/render-sections.mjs";
const DEFAULT_PROFILE_PICTURE_SRC = "../images/default/profile-picture/default.png";
const socialView = createProfileSocialViewRenderer({
  pageKey: "me",
  panelPrefix: "me",
  thoughtsFeedClass: "me-thoughts-feed",
  ownerGalleryEmptyText: "No photos yet. Upload one above.",
  viewerGalleryEmptyText: "No photos yet.",
});

function renderPageHeader(doc, model) {
  if (!doc?.getElementById) return;

  const title = doc.getElementById("meStageTitle");
  const subtitle = doc.getElementById("meStageSubtitle");

  if (title) title.textContent = model.pageTitle;
  if (subtitle) subtitle.textContent = model.pageSubtitle;
  if (doc && "title" in doc) {
    doc.title = `${model.pageTitle} | Jay's Javascript Arcade`;
  }
  globalThis.PixelText?.render?.(title);

  const stage = doc.querySelector?.(".me-stage");
  if (stage) {
    if (model.backgroundImageUrl) {
      stage.style.setProperty("--me-stage-bg-image", `url("${escapeCssUrl(model.backgroundImageUrl)}")`);
      stage.classList.add("me-stage--custom-bg");
    } else {
      stage.style.removeProperty("--me-stage-bg-image");
      stage.classList.remove("me-stage--custom-bg");
    }
  }
}

function renderHeroCard(container, model) {
  if (!container) return;

  const statsHtml = (Array.isArray(model.heroStats) ? model.heroStats : []).map((item) => `
    <article class="me-hero-card__metrics-stat">
      <p class="me-hero-card__metrics-stat-label">${escapeHtml(item.label)}</p>
      <p class="me-hero-card__metrics-stat-value">${escapeHtml(item.value)}</p>
    </article>
  `).join("");

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

function renderIdentityPanel(container, model) {
  if (!container) return;

  const factoryId = model.heroMeta.find((item) => item.label === "Factory ID")?.value || "PENDING-ID";
  const realNameValue = model.heroRealName || "Not shared";
  const pageViewCount = model.pageViewCount || "0";

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

  container.innerHTML = `
    <div class="me-panel__header"><h2 class="me-panel__title">Player Profile</h2></div>
    <div class="me-identity-panel__fields">
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
    </div>
  `;
}

export function renderMePageView(doc, model, options = {}) {
  if (!doc?.getElementById) return;

  renderPageHeader(doc, model);
  renderHeroCard(doc.getElementById("meHeroCard"), model);
  renderIdentityPanel(doc.getElementById("meIdentityPanel"), model);
  socialView.renderThoughtsPanel(
    doc.getElementById("meThoughtsPanel"),
    "Player Feed",
    model.thoughtItems,
    model.thoughtComposer,
    {
      openReactionThoughtId: options?.openReactionThoughtId || "",
      sharePanelState: options?.sharePanelState || {},
      commentPanelState: options?.commentPanelState || {},
      composerState: options?.thoughtComposerState || {},
    },
  );
  renderFriendCodePanel(doc.getElementById("meFriendCodePanel"), "Friend Code", model);
  renderFavoritePanel(doc.getElementById("meFavoriteGamePanel"), "Favorite Game", model.favoriteGameItems[0]);
  renderRailPanel(
    doc.getElementById("meRankingsPanel"),
    "Top Ladder Rankings",
    model.rankingItems,
    (item) => `
      <article class="${item.isPlaceholder ? "me-hero-card__rail-item me-hero-card__rail-item--placeholder" : "me-hero-card__rail-item"}">
        ${item.isPlaceholder ? "" : `<p class="me-hero-card__rail-title">${escapeHtml(item.title || item.label)}</p>`}
        <div class="me-hero-card__rail-value-row">
          <p class="me-hero-card__rail-value">${escapeHtml(item.value)}</p>
          ${item.meta ? `<span class="me-hero-card__rail-meta">${escapeHtml(item.meta)}</span>` : ""}
        </div>
      </article>
    `,
  );
  renderRailPanel(
    doc.getElementById("meTopFriendsPanel"),
    "Top Friends",
    model.friendItems,
    (item) => {
      const cardClass = item.isPlaceholder
        ? "me-hero-card__friend-card me-hero-card__friend-card--placeholder"
        : "me-hero-card__friend-card";
      const inner = `
        <div class="me-hero-card__friend-avatar" aria-hidden="true">
          <img class="me-hero-card__friend-avatar-img" src="${escapeHtml(item.avatarSrc || DEFAULT_PROFILE_PICTURE_SRC)}" alt="" loading="lazy">
        </div>
        <div class="me-hero-card__friend-copy">
          <p class="me-hero-card__friend-label">${escapeHtml(item.title || "Friend Slot")}</p>
          <p class="me-hero-card__friend-name">${escapeHtml(item.value)}</p>
          <p class="me-hero-card__friend-points">${escapeHtml(item.meta || "Friendship points pending")}</p>
        </div>
      `;
      if (!item.isPlaceholder && item.playerId) {
        return `<a class="${cardClass}" href="../player/index.html?id=${encodeURIComponent(item.playerId)}">${inner}</a>`;
      }
      return `<article class="${cardClass}">${inner}</article>`;
    },
  );
  renderFriendNavigatorPanel(doc.getElementById("meFriendsPanel"), "Friends", model.friendNavigator, {
    expanded: !!options?.friendNavigatorExpanded,
    searchQuery: options?.friendNavigatorSearchQuery || "",
  });
  socialView.renderGalleryPanel(doc.getElementById("meGalleryPanel"), "Photo Gallery", options?.galleryPhotos || [], {
    isOwner: true,
    previewCap: 5,
    viewAllHref: options?.galleryPlayerId ? `../gallery/index.html?id=${encodeURIComponent(options.galleryPlayerId)}` : "",
  });
  renderAboutPanel(doc.getElementById("meAboutPanel"), "About Me", model.aboutText);
  renderBadgesPanel(doc.getElementById("meBadgesPanel"), "Badges", model.badgeItems);
}
