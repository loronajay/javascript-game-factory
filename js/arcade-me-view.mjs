const DEFAULT_PROFILE_PICTURE_SRC = "../images/default/profile-picture/default.png";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeCssUrl(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function buildShareReference(item) {
  if (item?.quotedThought) {
    return item.quotedThought;
  }

  return item
    ? {
        title: item.title,
        summary: item.summary,
        authorLabel: item.authorLabel,
        publishedLabel: item.publishedLabel,
      }
    : null;
}

function renderQuotedThought(reference, mode = "card") {
  if (!reference) return "";

  const className = mode === "share-sheet"
    ? "thought-card__quoted-thought thought-card__quoted-thought--sheet"
    : "thought-card__quoted-thought";

  return `
    <div class="${className}">
      <p class="thought-card__quoted-kicker">Shared Post</p>
      <div class="thought-card__quoted-meta">
        <span class="thought-card__quoted-author">${escapeHtml(reference.authorLabel || "Arcade Pilot")}</span>
        <span class="thought-card__quoted-date">${escapeHtml(reference.publishedLabel || "Signal pending")}</span>
      </div>
      <p class="thought-card__quoted-title">${escapeHtml(reference.title || "Arcade Signal")}</p>
      <p class="thought-card__quoted-summary">${escapeHtml(reference.summary || "Shared arcade signal.")}</p>
    </div>
  `;
}

function formatCommentDate(value) {
  return value || "Signal pending";
}

function renderCommentSheet(item, commentPanelState = {}) {
  if (item.isPlaceholder || item.id !== commentPanelState?.cardId) {
    return "";
  }

  const comments = Array.isArray(commentPanelState.comments) ? commentPanelState.comments : [];
  const reference = buildShareReference(item);

  return `
    <div class="thought-card__comment-sheet">
      <div class="thought-card__comment-header">
        <p class="thought-card__comment-kicker">Comments</p>
        <button class="thought-card__comment-dismiss" type="button" data-close-comment-sheet="${escapeHtml(item.id)}">Close</button>
      </div>
      ${renderQuotedThought(reference, "share-sheet")}
      <div class="thought-card__comment-thread">
        ${comments.length > 0
          ? comments.map((comment) => `
            <article class="thought-card__comment">
              <div class="thought-card__comment-meta">
                <span class="thought-card__comment-author">${escapeHtml(comment.authorDisplayName || "Arcade Pilot")}</span>
                <span class="thought-card__comment-date">${escapeHtml(formatCommentDate(comment.createdAt))}</span>
              </div>
              <p class="thought-card__comment-body">${escapeHtml(comment.text || "")}</p>
            </article>
          `).join("")
          : `<p class="thought-card__comment-empty">No comments yet. Start the thread.</p>`}
      </div>
      <form class="thought-card__comment-form" data-comment-form="${escapeHtml(item.commentTargetId || item.id)}" data-comment-card-id="${escapeHtml(item.id)}">
        <label class="thought-card__share-label" for="me-comment-body-${escapeHtml(item.id)}">Write a comment</label>
        <textarea
          id="me-comment-body-${escapeHtml(item.id)}"
          class="thought-card__share-input"
          rows="3"
          maxlength="500"
          placeholder="Write your reply."
          data-comment-input="${escapeHtml(item.id)}"
        >${escapeHtml(commentPanelState.text || "")}</textarea>
        <div class="thought-card__share-actions">
          <button class="thought-card__share-button thought-card__share-button--primary" type="submit">Post Comment</button>
          <button class="thought-card__share-button" type="button" data-close-comment-sheet="${escapeHtml(item.id)}">Cancel</button>
        </div>
      </form>
    </div>
  `;
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
    <article class="${item.isPlaceholder ? "me-hero-card__friend-card me-hero-card__friend-card--placeholder" : "me-hero-card__friend-card"}">
      <div class="me-hero-card__friend-avatar" aria-hidden="true">
        <span class="me-hero-card__friend-avatar-text">${escapeHtml(item.avatarInitials || "??")}</span>
      </div>
      <div class="me-hero-card__friend-copy">
        <p class="me-hero-card__friend-label">${escapeHtml(item.title || "Friend Slot")}</p>
        <p class="me-hero-card__friend-name">${escapeHtml(item.value)}</p>
        <p class="me-hero-card__friend-points">${escapeHtml(item.meta || "Friendship points pending")}</p>
      </div>
    </article>
  `).join("");
  const statsHtml = (Array.isArray(model.heroStats) ? model.heroStats : []).map((item) => `
    <article class="me-hero-card__metrics-stat">
      <p class="me-hero-card__metrics-stat-label">${escapeHtml(item.label)}</p>
      <p class="me-hero-card__metrics-stat-value">${escapeHtml(item.value)}</p>
    </article>
  `).join("");

  const factoryId = model.heroMeta.find((item) => item.label === "Factory ID")?.value || "PENDING-ID";
  const realNameValue = model.heroRealName || "Not shared";
  const pageViewCount = model.pageViewCount || "0";

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
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    <div class="me-featured-cabinet">
      ${cardHtml}
    </div>
  `;
}

function renderThoughtItem(item, openReactionThoughtId = "", sharePanelState = {}, commentPanelState = {}) {
  if (item.isPlaceholder) {
    return `<p class="thought-feed__empty">${escapeHtml(item.summary || "No posts yet.")}</p>`;
  }
  const cardClass = "thought-card";
  const actionItems = Array.isArray(item.actionItems) && item.actionItems.length > 0
    ? item.actionItems
    : [
        { label: "Comments" },
        { label: "Share" },
        { label: "React" },
      ];
  const isReactionPickerOpen = !item.isPlaceholder && item.id === openReactionThoughtId;
  const isShareSheetOpen = !item.isPlaceholder && item.id === sharePanelState?.cardId;
  const isShareCaptionOpen = isShareSheetOpen && sharePanelState?.mode === "caption";
  const isCommentSheetOpen = !item.isPlaceholder && item.id === commentPanelState?.cardId;
  const shareReference = buildShareReference(item);
  const actionsHtml = actionItems.map((action) => {
    if (action.id === "comment" && !item.isPlaceholder) {
      return `
        <button
          class="${isCommentSheetOpen ? "thought-card__action thought-card__action--active" : "thought-card__action"}"
          type="button"
          data-comment-thought-id="${escapeHtml(item.commentTargetId || item.id)}"
          data-comment-card-id="${escapeHtml(item.id)}"
        >${escapeHtml(action.label)}</button>
      `;
    }

    if (action.id === "share" && !item.isPlaceholder) {
      return `
        <button
          class="${action.isActive ? "thought-card__action thought-card__action--active" : "thought-card__action"}"
          type="button"
          data-share-thought-id="${escapeHtml(item.shareTargetId || item.id)}"
          data-share-card-id="${escapeHtml(item.id)}"
        >${escapeHtml(action.label)}</button>
      `;
    }

    if (action.id === "react" && !item.isPlaceholder) {
      return `
        <button
          class="${isReactionPickerOpen ? "thought-card__action thought-card__action--active" : "thought-card__action"}"
          type="button"
          data-toggle-thought-reactions="${escapeHtml(item.id)}"
          aria-expanded="${isReactionPickerOpen ? "true" : "false"}"
        >${escapeHtml(action.label)}</button>
      `;
    }

    return `
      <span class="thought-card__action">${escapeHtml(action.label)}</span>
    `;
  }).join("");
  const deleteHtml = item.canDelete
    ? `<button class="thought-card__delete" type="button" data-delete-id="${escapeHtml(item.id)}" aria-label="Delete thought">Delete</button>`
    : "";
  const reactionPickerHtml = item.isPlaceholder
    ? ""
    : `
      <div class="${isReactionPickerOpen ? "thought-card__reaction-picker" : "thought-card__reaction-picker thought-card__reaction-picker--hidden"}">
        ${item.reactionPickerItems.map((reaction) => `
          <button
            class="${reaction.isSelected ? "thought-card__reaction-chip thought-card__reaction-chip--selected" : "thought-card__reaction-chip"}"
            type="button"
            data-react-thought-id="${escapeHtml(item.id)}"
            data-thought-reaction-id="${escapeHtml(reaction.id)}"
            aria-pressed="${reaction.isSelected ? "true" : "false"}"
            title="${escapeHtml(reaction.label)}"
          >
            <span class="thought-card__reaction-glyph" aria-hidden="true">${escapeHtml(reaction.glyph || reaction.label)}</span>
            <span class="thought-card__reaction-count">${escapeHtml(String(reaction.count || 0))}</span>
          </button>
        `).join("")}
      </div>
    `;
  const shareSheetHtml = item.isPlaceholder || !isShareSheetOpen
    ? ""
    : `
      <div class="thought-card__share-sheet">
        ${item.actionItems.find((action) => action.id === "share")?.isActive
          ? `
            <div class="thought-card__share-actions">
              <button class="thought-card__share-button thought-card__share-button--danger" type="button" data-share-now-thought-id="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">Remove Share</button>
              <button class="thought-card__share-button" type="button" data-close-share-sheet="${escapeHtml(item.id)}">Done</button>
            </div>
          `
          : `
            <div class="thought-card__share-actions">
              <button class="thought-card__share-button thought-card__share-button--primary" type="button" data-share-now-thought-id="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">Share Now</button>
              <button class="thought-card__share-button" type="button" data-open-share-caption="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">Write Caption</button>
            </div>
          `}
        ${isShareCaptionOpen
          ? `
            <form class="thought-card__share-composer" data-share-caption-form="${escapeHtml(item.shareTargetId || item.id)}" data-share-card-id="${escapeHtml(item.id)}">
              <label class="thought-card__share-label" for="me-share-caption-${escapeHtml(item.id)}">Add your caption</label>
              <textarea
                id="me-share-caption-${escapeHtml(item.id)}"
                class="thought-card__share-input"
                rows="4"
                maxlength="500"
                placeholder="Say something about this post."
                data-share-caption-input="${escapeHtml(item.id)}"
              >${escapeHtml(sharePanelState?.caption || "")}</textarea>
              <div class="thought-card__share-actions">
                <button class="thought-card__share-button thought-card__share-button--primary" type="submit">Share With Caption</button>
                <button class="thought-card__share-button" type="button" data-close-share-sheet="${escapeHtml(item.id)}">Cancel</button>
              </div>
              ${renderQuotedThought(shareReference, "share-sheet")}
            </form>
          `
          : ""}
      </div>
    `;
  const quotedThoughtHtml = item.quotedThought
    ? renderQuotedThought(item.quotedThought)
    : "";
  const commentSheetHtml = renderCommentSheet(item, commentPanelState);

  return `
    <article class="${cardClass}">
      <div class="thought-card__signal-line">
        <span class="thought-card__author">${escapeHtml(item.authorLabel)}</span>
        <span class="thought-card__date">${escapeHtml(item.publishedLabel)}</span>
        ${deleteHtml}
      </div>
      <div class="thought-card__topline">
        <div class="thought-card__title-block">
          <span class="thought-card__topic-kicker">Topic</span>
          <h2 class="thought-card__title">${escapeHtml(item.title)}</h2>
        </div>
        <div class="thought-card__reactions">
          <span>${escapeHtml(item.reactionLabel)}</span>
          <span>${escapeHtml(item.commentLabel)}</span>
          <span>${escapeHtml(item.shareLabel)}</span>
        </div>
      </div>
      <p class="thought-card__summary">${escapeHtml(item.summary)}</p>
      <div class="thought-card__actions">
        ${actionsHtml}
      </div>
      ${commentSheetHtml}
      ${shareSheetHtml}
      ${reactionPickerHtml}
      ${quotedThoughtHtml}
    </article>
  `;
}

function renderThoughtsPanel(container, title, items, composer = null, options = {}) {
  if (!container) return;

  const composerHtml = composer?.enabled
    ? `
      <form id="meThoughtComposer" class="thought-composer thought-composer--owner">
        <input
          id="meThoughtSubject"
          class="thought-composer__subject"
          name="subject"
          type="text"
          maxlength="80"
          placeholder="${escapeHtml(composer.subjectPlaceholder || "Optional headline")}"
        >
        <textarea
          id="meThoughtBody"
          class="thought-composer__body"
          name="text"
          rows="4"
          maxlength="500"
          placeholder="${escapeHtml(composer.textPlaceholder || "Share a thought.")}"
        ></textarea>
        <div class="thought-composer__actions">
          <button class="thought-composer__submit" type="submit">${escapeHtml(composer.submitLabel || "Post Thought")}</button>
          <p id="meThoughtComposerFlash" class="thought-composer__flash" aria-live="polite">${escapeHtml(composer.flashMessage || "")}</p>
        </div>
      </form>
    `
    : "";

  container.innerHTML = `
    <div class="me-panel__header"><h2 class="me-panel__title">${escapeHtml(title)}</h2></div>
    ${composerHtml}
    <div class="me-thoughts-feed thoughts-feed">
      ${items.map((item) => renderThoughtItem(
        item,
        options?.openReactionThoughtId || "",
        options?.sharePanelState || {},
        options?.commentPanelState || {},
      )).join("")}
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
  renderThoughtsPanel(
    doc.getElementById("meThoughtsPanel"),
    "Player Feed",
    model.thoughtItems,
    model.thoughtComposer,
    {
      openReactionThoughtId: options?.openReactionThoughtId || "",
      sharePanelState: options?.sharePanelState || {},
      commentPanelState: options?.commentPanelState || {},
    },
  );
  renderFriendCodePanel(doc.getElementById("meFriendCodePanel"), "Friend Code", model);
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
}
