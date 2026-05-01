import {
  createProfileSocialViewRenderer,
  escapeCssUrl,
  escapeHtml,
} from "../profile-social/social-view.mjs";
const DEFAULT_PROFILE_PICTURE_SRC = "../images/default/profile-picture/default.png";
const socialView = createProfileSocialViewRenderer({
  pageKey: "player",
  panelPrefix: "player",
  thoughtsFeedClass: "player-thoughts-feed",
  ownerGalleryEmptyText: "No photos yet.",
  viewerGalleryEmptyText: "No photos yet.",
});

function renderPageHeader(doc, model) {
  if (!doc?.getElementById) return;

  const title = doc.getElementById("playerStageTitle");
  const subtitle = doc.getElementById("playerStageSubtitle");

  if (title) title.textContent = model.pageTitle;
  if (subtitle) subtitle.textContent = model.pageSubtitle;
  if (doc && "title" in doc) {
    doc.title = `${model.pageTitle} | Jay's Javascript Arcade`;
  }
  globalThis.PixelText?.render?.(title);
}

function renderHeroCard(container, model) {
  if (!container) return;

  const statsHtml = (Array.isArray(model.heroStats) ? model.heroStats : []).map((item) => `
    <article class="player-hero-card__metrics-stat">
      <p class="player-hero-card__metrics-stat-label">${escapeHtml(item.label)}</p>
      <p class="player-hero-card__metrics-stat-value">${escapeHtml(item.value)}</p>
    </article>
  `).join("");

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

function renderIdentityPanel(container, model) {
  if (!container) return;

  const factoryId = model.heroMeta.find((item) => item.label === "Factory ID")?.value || "PENDING-ID";
  const realNameValue = model.heroRealName || "Not shared";
  const pageViewCount = model.pageViewCount || "0";
  const isUnfriendMode = model.friendAction?.mode === "unfriend";

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

  const friendActionHtml = model.friendAction?.enabled
    ? `
      <div class="player-hero-card__social-action">
        <button
          class="${isUnfriendMode ? "player-hero-card__friend-action player-hero-card__friend-action--unfriend" : "player-hero-card__friend-action"}"
          type="button"
          ${isUnfriendMode
            ? `data-unfriend="${escapeHtml(model.friendAction.playerId || "")}"`
            : `data-add-friend="${escapeHtml(model.friendAction.playerId || "")}"`
          }
        >${escapeHtml(model.friendAction.label || "Add Friend")}</button>
        <p class="player-hero-card__friend-flash" aria-live="polite">${escapeHtml(model.friendAction.flashMessage || "")}</p>
      </div>
    `
    : "";

  const challengePickerHtml = model.gestureAction?.challengePickerOpen
    ? `
      <div class="player-hero-card__challenge-picker">
        <p class="player-hero-card__challenge-picker-label">Choose a game to challenge them to:</p>
        <div class="player-hero-card__challenge-games">
          ${(model.gestureAction.challengeableGames || []).map((g) => `
            <button
              class="player-hero-card__challenge-game-btn"
              type="button"
              data-challenge-game="${escapeHtml(g.slug)}"
              data-challenge-game-title="${escapeHtml(g.title)}"
              data-challenge-target="${escapeHtml(model.gestureAction.playerId || "")}"
            >${escapeHtml(g.title)}</button>
          `).join("")}
        </div>
        <button class="player-hero-card__challenge-cancel" type="button" data-challenge-picker-cancel>Cancel</button>
      </div>
    `
    : "";

  const messageActionHtml = model.messageAction?.enabled
    ? `
      <div class="player-hero-card__social-action">
        <button
          class="player-hero-card__friend-action player-hero-card__friend-action--message"
          type="button"
          data-message="${escapeHtml(model.messageAction.playerId || "")}"
          data-message-name="${escapeHtml(model.messageAction.profileName || "")}"
        >Message 💬</button>
      </div>
    `
    : "";

  const gestureActionHtml = model.gestureAction?.enabled
    ? `
      <div class="player-hero-card__gesture-rail">
        <p class="player-hero-card__gesture-label">Send a gesture</p>
        <div class="player-hero-card__gesture-buttons">
          ${(model.gestureAction.gestures || []).map((g) => `
            <button
              class="player-hero-card__gesture-btn"
              type="button"
              data-gesture="${escapeHtml(g.type)}"
              data-gesture-target="${escapeHtml(model.gestureAction.playerId || "")}"
            >${escapeHtml(g.label)}</button>
          `).join("")}
          <button
            class="player-hero-card__gesture-btn player-hero-card__gesture-btn--challenge${model.gestureAction.challengePickerOpen ? " player-hero-card__gesture-btn--active" : ""}"
            type="button"
            data-gesture-challenge="${escapeHtml(model.gestureAction.playerId || "")}"
          >Challenge 🎮</button>
        </div>
        ${challengePickerHtml}
        <p class="player-hero-card__gesture-flash" aria-live="polite">${escapeHtml(model.gestureAction.flashMessage || "")}</p>
      </div>
    `
    : "";

  container.innerHTML = `
    <div class="player-panel__header"><h2 class="player-panel__title">Player Profile</h2></div>
    <div class="player-identity-panel__fields">
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
    </div>
    ${friendActionHtml}
    ${messageActionHtml}
    ${gestureActionHtml}
  `;
}

function renderRailPanel(container, title, items, renderItem) {
  if (!container) return;
  container.hidden = false;

  const itemsHtml = items.map(renderItem).join("");
  container.innerHTML = `
    <div class="player-panel__header"><h2 class="player-panel__title">${escapeHtml(title)}</h2></div>
    <div class="player-hero-card__rail-list">
      ${itemsHtml}
    </div>
  `;
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

export function renderPlayerPageView(doc, model, options = {}) {
  if (!doc?.getElementById) return;

  const editButton = doc.getElementById("playerProfileButton");
  if (editButton) {
    editButton.hidden = !model.showEditProfileButton;
  }

  renderPageHeader(doc, model);
  renderHeroCard(doc.getElementById("playerHeroCard"), model);
  renderIdentityPanel(doc.getElementById("playerIdentityPanel"), model);
  socialView.renderThoughtsPanel(
    doc.getElementById("playerThoughtsPanel"),
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
  renderFavoritePanel(doc.getElementById("playerFavoritePanel"), "Favorite Game", model.favoriteGameItems[0]);
  renderRailPanel(
    doc.getElementById("playerRankingsPanel"),
    "Top Ladder Rankings",
    model.rankingItems,
    (item) => `
      <article class="${item.isPlaceholder ? "player-hero-card__rail-item player-hero-card__rail-item--placeholder" : "player-hero-card__rail-item"}">
        ${item.isPlaceholder ? "" : `<p class="player-hero-card__rail-title">${escapeHtml(item.title || item.label)}</p>`}
        <div class="player-hero-card__rail-value-row">
          <p class="player-hero-card__rail-value">${escapeHtml(item.value)}</p>
          ${item.meta ? `<span class="player-hero-card__rail-meta">${escapeHtml(item.meta)}</span>` : ""}
        </div>
      </article>
    `,
  );
  renderRailPanel(
    doc.getElementById("playerFriendsPanel"),
    "Top Friends",
    model.friendItems,
    (item) => {
      const cardClass = item.isPlaceholder
        ? "player-hero-card__friend-card player-hero-card__friend-card--placeholder"
        : "player-hero-card__friend-card";
      const inner = `
        <div class="player-hero-card__friend-avatar" aria-hidden="true">
          <img class="player-hero-card__friend-avatar-img" src="${escapeHtml(item.avatarSrc || DEFAULT_PROFILE_PICTURE_SRC)}" alt="" loading="lazy">
        </div>
        <div class="player-hero-card__friend-copy">
          <p class="player-hero-card__friend-label">${escapeHtml(item.title || "Friend Slot")}</p>
          <p class="player-hero-card__friend-name">${escapeHtml(item.value)}</p>
          <p class="player-hero-card__friend-points">${escapeHtml(item.meta || "Friendship points pending")}</p>
        </div>
      `;
      if (!item.isPlaceholder && item.playerId) {
        return `<a class="${cardClass}" href="../player/index.html?id=${encodeURIComponent(item.playerId)}">${inner}</a>`;
      }
      return `<article class="${cardClass}">${inner}</article>`;
    },
  );
  socialView.renderGalleryPanel(doc.getElementById("playerGalleryPanel"), "Photo Gallery", options?.galleryPhotos || [], {
    isOwner: !!options?.isOwner,
    uploadState: options?.galleryUploadState || {},
  });
  renderAboutPanel(doc.getElementById("playerAboutPanel"), "About Me", model.aboutText);
  renderBadgesPanel(doc.getElementById("playerBadgesPanel"), "Badges", model.badgeItems);
}
