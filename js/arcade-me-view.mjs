import {
  createProfileSocialViewRenderer,
  escapeCssUrl,
  escapeHtml,
} from "./profile-social/social-view.mjs";
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

function renderRailPanel(container, title, items, renderItem) {
  if (!container) return;
  container.hidden = false;

  const itemsHtml = items.map(renderItem).join("");
  container.innerHTML = `
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    <div class="me-hero-card__rail-list">
      ${itemsHtml}
    </div>
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

function renderFavoritePanel(container, title, item) {
  if (!container) return;

  const favorite = item || {};
  const cardHtml = favorite.isPlaceholder
    ? `
      <button
        class="game-card featured me-featured-cabinet__card me-featured-cabinet__card--placeholder game-card--placeholder"
        type="button"
        data-open-favorite-picker
      >
        <div class="game-card-preview">
          <div class="game-thumb me-featured-cabinet__thumb me-featured-cabinet__thumb--placeholder"></div>
          <div class="game-card-copy game-card-copy--placeholder">
            <h3 class="game-title">PIN A FAVORITE</h3>
            <p class="me-featured-cabinet__placeholder-hint">Click to pin from your player card.</p>
          </div>
        </div>
      </button>
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

function renderFriendNavigatorPanel(container, title, navigator, options = {}) {
  if (!container) return;

  const items = Array.isArray(navigator?.items) ? navigator.items : [];
  const isExpanded = !!options.expanded;
  const searchValue = typeof options.searchQuery === "string" ? options.searchQuery : "";
  const hasItems = items.length > 0;
  const listHtml = items.map((item) => {
    const avatarHtml = item.avatarSrc
      ? `<img class="me-friends-navigator__avatar-img" src="${escapeHtml(item.avatarSrc)}" alt="" loading="lazy">`
      : `<span class="me-friends-navigator__avatar-text" aria-hidden="true">${escapeHtml(item.avatarInitials || "??")}</span>`;
    const cardBody = `
      <div class="me-friends-navigator__avatar" aria-hidden="true">
        ${avatarHtml}
      </div>
      <div class="me-friends-navigator__copy">
        <p class="me-friends-navigator__label">${escapeHtml(item.label || "Friend")}</p>
        <p class="me-friends-navigator__name">${escapeHtml(item.profileName || item.value || item.playerId || "Arcade Pilot")}</p>
        <p class="me-friends-navigator__meta">${escapeHtml(item.playerIdLabel || "NO-ID")}</p>
        <p class="me-friends-navigator__points">${escapeHtml(item.meta || "0 friendship points")}</p>
      </div>
    `;

    const attrs = `class="me-friends-navigator__item" data-friend-navigator-item data-friend-search-text="${escapeHtml(item.searchText || "")}"`;
    if (item.profileHref) {
      return `<a ${attrs} href="${escapeHtml(item.profileHref)}">${cardBody}</a>`;
    }
    return `<article ${attrs}>${cardBody}</article>`;
  }).join("");

  container.hidden = false;
  container.innerHTML = `
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    <div class="me-friends-navigator">
      <button
        id="meFriendsToggle"
        class="me-friends-navigator__toggle"
        type="button"
        aria-controls="meFriendsDropdown"
        aria-expanded="${isExpanded ? "true" : "false"}"
      >
        <span class="me-friends-navigator__toggle-label">${escapeHtml(navigator?.triggerLabel || "Friends")}</span>
        <span class="me-friends-navigator__toggle-helper">${escapeHtml(navigator?.helperText || "")}</span>
      </button>
      <div id="meFriendsDropdown" class="me-friends-navigator__dropdown"${isExpanded ? "" : " hidden"}>
        ${hasItems ? `
          <label class="me-friends-navigator__search" for="meFriendsSearchInput">
            <span class="me-friends-navigator__search-label">Search Friends</span>
            <input
              id="meFriendsSearchInput"
              class="me-friends-navigator__search-input"
              type="search"
              placeholder="${escapeHtml(navigator?.searchPlaceholder || "Search friends")}"
              value="${escapeHtml(searchValue)}"
              spellcheck="false"
              autocomplete="off"
            >
          </label>
          <p id="meFriendsSearchEmpty" class="me-friends-navigator__empty" hidden>No friends match your search.</p>
          <div id="meFriendsList" class="me-friends-navigator__list">
            ${listHtml}
          </div>
        ` : `
          <p class="me-friends-navigator__empty">${escapeHtml(navigator?.emptyText || "No linked friends yet.")}</p>
        `}
      </div>
    </div>
  `;
}


function renderSupportPanel(container, title, items) {
  if (!container) return;

  const itemsHtml = items.map((item) => `
    <article class="${item.isPlaceholder ? "me-card-item me-card-item--placeholder" : "me-card-item"}">
      ${item.isPlaceholder ? "" : `<p class="me-card-item__title">${escapeHtml(item.title || item.label)}</p>`}
      <p class="me-card-item__value">${escapeHtml(item.value)}</p>
      ${item.meta ? `<p class="me-card-item__meta">${escapeHtml(item.meta)}</p>` : ""}
    </article>
  `).join("");

  container.innerHTML = `
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    <div class="me-card-item-list">
      ${itemsHtml}
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
    uploadState: options?.galleryUploadState || {},
  });
  renderAboutPanel(doc.getElementById("meAboutPanel"), "About Me", model.aboutText);
  renderBadgesPanel(doc.getElementById("meBadgesPanel"), "Badges", model.badgeItems);
}
