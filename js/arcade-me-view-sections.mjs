import { escapeHtml } from "./profile-social/social-view.mjs";

export function renderRailPanel(container, title, items, renderItem) {
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

export function renderFriendCodePanel(container, title, model) {
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

export function renderFavoritePanel(container, title, item) {
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

export function renderFriendNavigatorPanel(container, title, navigator, options = {}) {
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

export function renderSupportPanel(container, title, items) {
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

export function renderAboutPanel(container, title, text) {
  if (!container) return;

  container.innerHTML = `
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    <p class="me-about-copy">${escapeHtml(text)}</p>
  `;
}

export function renderBadgesPanel(container, title, items) {
  if (!container) return;

  const badgesHtml = items[0]?.isPlaceholder
    ? `<p class="me-badge-empty">${escapeHtml(items[0].label)}</p>`
    : `<div class="me-badge-list">${items.map((item) => `<span class="me-badge-chip">${escapeHtml(item.label)}</span>`).join("")}</div>`;

  container.innerHTML = `
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    ${badgesHtml}
  `;
}
