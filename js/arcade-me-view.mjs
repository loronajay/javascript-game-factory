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
} from "./me-page/render-sections.mjs";
const DEFAULT_PROFILE_PICTURE_SRC = "../images/default/profile-picture/default.png";
const RANKING_CHILD_IDS = ["ranking1", "ranking2", "ranking3"];
const TOP_FRIEND_CHILD_IDS = ["mainSqueeze", "friend2", "friend3", "friend4", "friend5"];
const socialView = createProfileSocialViewRenderer({
  pageKey: "me",
  panelPrefix: "me",
  thoughtsFeedClass: "me-thoughts-feed",
  ownerGalleryEmptyText: "No photos yet. Upload one above.",
  viewerGalleryEmptyText: "No photos yet.",
});

function createTopFriendFallback(index) {
  return {
    title: index === 0 ? "Main Squeeze" : "Friend Slot",
    value: index === 0 ? "Awaiting Main Squeeze" : "Awaiting Arcade Friend",
    meta: "Friendship points pending",
    isPlaceholder: true,
    avatarSrc: DEFAULT_PROFILE_PICTURE_SRC,
  };
}

function normalizeTopFriendItems(items = []) {
  const source = Array.isArray(items) ? items : [];
  return TOP_FRIEND_CHILD_IDS.map((_, index) => source[index] || createTopFriendFallback(index));
}

function createRankingFallback(index) {
  return {
    title: index === 0 ? "Top Ladder Rankings" : `Ranking Slot ${index + 1}`,
    value: index === 0 ? "Rank snapshots will appear here once shared standings come online." : "Awaiting ladder placement",
    meta: "",
    isPlaceholder: true,
  };
}

function normalizeRankingItems(items = []) {
  const source = Array.isArray(items) ? items : [];
  return RANKING_CHILD_IDS.map((_, index) => source[index] || createRankingFallback(index));
}

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
  const body = doc.body;
  if (model.backgroundImageUrl && model.backgroundStyle === 'static') {
    body?.style.setProperty("--profile-static-bg-image", `url("${escapeCssUrl(model.backgroundImageUrl)}")`);
    body?.classList.add("me-page-shell--bg-static");
    if (stage) {
      stage.style.removeProperty("--me-stage-bg-image");
      stage.classList.remove("me-stage--custom-bg");
    }
  } else {
    body?.style.removeProperty("--profile-static-bg-image");
    body?.classList.remove("me-page-shell--bg-static");
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
}

export function renderMeHeroCard(container, model) {
  if (!container) return;

  const statsHtml = (Array.isArray(model.heroStats) ? model.heroStats : []).map((item) => `
    <article class="me-hero-card__metrics-stat">
      <p class="me-hero-card__metrics-stat-label">${escapeHtml(item.label)}</p>
      <p class="me-hero-card__metrics-stat-value">${escapeHtml(item.value)}</p>
    </article>
  `).join("");

  container.innerHTML = `
    <div class="me-hero-card__backdrop" aria-hidden="true"></div>
    <section class="me-hero-card__portrait-panel me-hero-card__child" data-profile-child-id="portrait">
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
    <section class="me-hero-card__metrics-panel me-hero-card__child" data-profile-child-id="metrics">
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

export function renderMeIdentityPanel(container, model) {
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
    <div class="me-panel__header" data-profile-child-id="title"><h2 class="me-panel__title">Player Profile</h2></div>
    <div class="me-hero-card__identity-field" data-profile-child-id="name">
      <span class="me-hero-card__identity-field-label">Name</span>
      <div class="me-hero-card__identity-field-value-row">
        <span class="me-hero-card__identity-field-value">${escapeHtml(realNameValue)}</span>
        <span class="me-presence-dot me-presence-dot--${escapeHtml(model.presenceToneClass)}" title="${escapeHtml(model.presenceLabel)}"></span>
      </div>
    </div>
    <div class="me-hero-card__identity-field me-hero-card__identity-field--stack" data-profile-child-id="pageViews">
      <span class="me-hero-card__identity-field-label">Page Views</span>
      <span class="me-hero-card__identity-field-value">${escapeHtml(pageViewCount)}</span>
    </div>
    <div class="me-hero-card__identity-field me-hero-card__identity-field--stack" data-profile-child-id="factoryId">
      <span class="me-hero-card__identity-field-label">Factory ID</span>
      <span class="me-hero-card__identity-field-value me-hero-card__identity-field-value--mono">${escapeHtml(factoryId)}</span>
    </div>
    <div class="me-hero-card__identity-field me-hero-card__identity-field--stack" data-profile-child-id="socialLinks">
      <span class="me-hero-card__identity-field-label">Social Links</span>
      <div class="me-identity-links">
        ${linksHtml}
      </div>
    </div>
  `;
}

export function renderMeGalleryPanel(container, photos = [], options = {}) {
  socialView.renderGalleryPanel(container, "Photo Gallery", photos, {
    isOwner: true,
    previewCap: 5,
    viewAllHref: options?.galleryPlayerId ? `../gallery/index.html?id=${encodeURIComponent(options.galleryPlayerId)}` : "",
  });
}

export function renderMeThoughtsPanel(container, model, options = {}) {
  socialView.renderThoughtsPanel(
    container,
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
}

export function renderMeRankingsPanel(container, model) {
  if (!container) return;

  const rankingCards = normalizeRankingItems(model.rankingItems).map((item, index) => `
    <article
      class="${item.isPlaceholder ? "me-hero-card__rail-item me-hero-card__rail-item--placeholder" : "me-hero-card__rail-item"}"
      data-profile-child-id="${escapeHtml(RANKING_CHILD_IDS[index])}"
    >
      ${item.isPlaceholder ? "" : `<p class="me-hero-card__rail-title">${escapeHtml(item.title || item.label)}</p>`}
      <div class="me-hero-card__rail-value-row">
        <p class="me-hero-card__rail-value">${escapeHtml(item.value)}</p>
        ${item.meta ? `<span class="me-hero-card__rail-meta">${escapeHtml(item.meta)}</span>` : ""}
      </div>
    </article>
  `).join("");

  container.innerHTML = `
    <div class="me-panel__header" data-profile-child-id="title"><h2 class="me-panel__title">Top Ladder Rankings</h2></div>
    ${rankingCards}
  `;
}

export function renderMeTopFriendsPanel(container, model) {
  if (!container) return;

  const friendItems = normalizeTopFriendItems(model.friendItems);
  const friendCards = friendItems.map((item, index) => {
    const childId = TOP_FRIEND_CHILD_IDS[index];
    const cardClass = item.isPlaceholder
      ? "me-hero-card__friend-card me-hero-card__friend-card--placeholder"
      : "me-hero-card__friend-card";
    const inner = `
      <div class="me-hero-card__friend-avatar" aria-hidden="true">
        <img class="me-hero-card__friend-avatar-img" src="${escapeHtml(item.avatarSrc || DEFAULT_PROFILE_PICTURE_SRC)}" alt="" loading="lazy">
      </div>
      <div class="me-hero-card__friend-copy">
        <p class="me-hero-card__friend-label">${escapeHtml(item.title || (index === 0 ? "Main Squeeze" : "Friend Slot"))}</p>
        <p class="me-hero-card__friend-name">${escapeHtml(item.value)}</p>
        <p class="me-hero-card__friend-points">${escapeHtml(item.meta || "Friendship points pending")}</p>
      </div>
    `;
    if (!item.isPlaceholder && item.playerId) {
      return `<a class="${cardClass}" data-profile-child-id="${escapeHtml(childId)}" href="../player/index.html?id=${encodeURIComponent(item.playerId)}">${inner}</a>`;
    }
    return `<article class="${cardClass}" data-profile-child-id="${escapeHtml(childId)}">${inner}</article>`;
  }).join("");

  container.hidden = false;
  container.innerHTML = `
    <div class="me-panel__header" data-profile-child-id="title"><h2 class="me-panel__title">Top Friends</h2></div>
    ${friendCards}
  `;
}

export function renderMeFriendCodePanel(container, model) {
  renderFriendCodePanel(container, "Friend Code", model);
}

export function renderMeFriendsPanel(container, model) {
  renderFriendNavigatorPanel(container, "Friends", model.friendNavigator, {
    expanded: false,
    searchQuery: "",
  });
}

export function renderMePageView(doc, model, options = {}) {
  if (!doc?.getElementById) return;

  renderPageHeader(doc, model);
  renderMeHeroCard(doc.getElementById("meHeroCard"), model);
  renderMeIdentityPanel(doc.getElementById("meIdentityPanel"), model);
  renderMeThoughtsPanel(doc.getElementById("meThoughtsPanel"), model, options);
  renderMeFriendCodePanel(doc.getElementById("meFriendCodePanel"), model);
  renderFavoritePanel(doc.getElementById("meFavoriteGamePanel"), "Favorite Game", model.favoriteGameItems[0]);
  renderMeRankingsPanel(doc.getElementById("meRankingsPanel"), model);
  renderMeTopFriendsPanel(doc.getElementById("meTopFriendsPanel"), model);
  renderFriendNavigatorPanel(doc.getElementById("meFriendsPanel"), "Friends", model.friendNavigator, {
    expanded: !!options?.friendNavigatorExpanded,
    searchQuery: options?.friendNavigatorSearchQuery || "",
  });
  renderMeGalleryPanel(doc.getElementById("meGalleryPanel"), options?.galleryPhotos || [], {
    galleryPlayerId: options?.galleryPlayerId,
  });
  renderAboutPanel(doc.getElementById("meAboutPanel"), "About Me", model.aboutText);
  renderBadgesPanel(doc.getElementById("meBadgesPanel"), "Badges", model.badgeItems);
}
