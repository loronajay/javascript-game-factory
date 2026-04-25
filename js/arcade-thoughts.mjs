import {
  buildThoughtCardItems,
  commentOnThoughtPostWithApi,
  loadThoughtFeed,
  loadThoughtComments,
  reactToThoughtPostWithApi,
  shareThoughtPostWithApi,
  syncThoughtCommentsFromApi,
  syncThoughtFeedFromApi,
} from "./platform/thoughts/thoughts.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { getDefaultPlatformStorage } from "./platform/storage/storage.mjs";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCountLabel(count) {
  return `${count} POST${count === 1 ? "" : "S"}`;
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

function formatCommentDate(value) {
  return value || "Signal pending";
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
        <label class="thought-card__share-label" for="comment-body-${escapeHtml(item.id)}">Write a comment</label>
        <textarea
          id="comment-body-${escapeHtml(item.id)}"
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

export function buildThoughtsPageViewModel(thoughtFeed = loadThoughtFeed()) {
  const items = Array.isArray(thoughtFeed) ? thoughtFeed : [];

  return {
    heroTitle: "ARCADE THOUGHTS",
    heroKicker: "STATUS FEED",
    heroSummary: "This is the first scaffold for the future player-status feed: short posts, visible engagement counts, and a scrollable social lane that can later grow comments and sharing.",
    heroCountLabel: formatCountLabel(items.length),
    items: buildThoughtCardItems(items, {
      placeholderTitle: "No posts yet",
      placeholderSummary: "No thoughts have been shared yet. Be the first to post.",
    }),
  };
}

export async function loadThoughtsPageData(options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options.apiClient || createPlatformApiClient(options);
  const currentProfile = options.currentProfile || loadFactoryProfile(storage);
  const thoughtFeed = Array.isArray(options?.thoughtFeed)
    ? options.thoughtFeed
    : await syncThoughtFeedFromApi(storage, apiClient, currentProfile?.playerId || "");

  return {
    storage,
    currentProfile,
    apiClient,
    thoughtFeed,
  };
}

function renderHeroCard(container, model) {
  if (!container) return;

  container.innerHTML = `
    <div class="thoughts-hero-card__copy">
      <p class="thoughts-hero-card__kicker">${escapeHtml(model.heroKicker)}</p>
      <h2 class="thoughts-hero-card__title">${escapeHtml(model.heroTitle)}</h2>
      <p class="thoughts-hero-card__summary">${escapeHtml(model.heroSummary)}</p>
    </div>
    <div class="thoughts-hero-card__meta">
      <div class="thoughts-meta-block">
        <span class="thoughts-meta-block__label">Feed Status</span>
        <span class="thoughts-meta-block__value">${escapeHtml(model.heroCountLabel)}</span>
      </div>
    </div>
  `;
}

function renderThoughtCard(item, openReactionThoughtId = "", sharePanelState = {}, commentPanelState = {}) {
  const cardClass = item.isPlaceholder ? "thought-card thought-card--placeholder" : "thought-card";
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
              <label class="thought-card__share-label" for="share-caption-${escapeHtml(item.id)}">Add your caption</label>
              <textarea
                id="share-caption-${escapeHtml(item.id)}"
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
      </div>
      <div class="thought-card__topline">
        <div class="thought-card__title-block">
          <span class="thought-card__topic-kicker">Topic</span>
          <h2 class="thought-card__title">${escapeHtml(item.title)}</h2>
        </div>
        <div class="thought-card__reactions">
          <span>${escapeHtml(item.reactionLabel)}</span>
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

export function renderThoughtsPage(doc = globalThis.document, thoughtFeed = loadThoughtFeed(), options = {}) {
  if (!doc?.getElementById) return null;

  const model = buildThoughtsPageViewModel(thoughtFeed);
  renderHeroCard(doc.getElementById("thoughtsHeroCard"), model);

  const feed = doc.getElementById("thoughtsFeed");
  if (feed) {
    feed.innerHTML = model.items
      .map((item) => renderThoughtCard(
        item,
        options?.openReactionThoughtId || "",
        options?.sharePanelState || {},
        options?.commentPanelState || {},
      ))
      .join("");
  }

  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  const storage = getDefaultPlatformStorage();
  const apiClient = createPlatformApiClient();
  let currentProfile = loadFactoryProfile(storage);
  let openReactionThoughtId = "";
  let sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
  let commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };

  const rerender = async (thoughtFeedOverride = null) => {
    currentProfile = loadFactoryProfile(storage);
    const thoughtFeed = Array.isArray(thoughtFeedOverride)
      ? thoughtFeedOverride
      : (await loadThoughtsPageData({ storage, apiClient, currentProfile })).thoughtFeed;
    renderThoughtsPage(doc, thoughtFeed, { openReactionThoughtId, sharePanelState, commentPanelState });
  };

  const openCommentSheet = async (cardId, thoughtId) => {
    commentPanelState = {
      cardId,
      thoughtId,
      text: "",
      comments: loadThoughtComments(thoughtId, storage),
    };
    openReactionThoughtId = "";
    sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
    await rerender(loadThoughtFeed(storage));

    const remoteComments = await syncThoughtCommentsFromApi(thoughtId, storage, apiClient);
    if (commentPanelState.cardId !== cardId || commentPanelState.thoughtId !== thoughtId) {
      return;
    }

    commentPanelState = {
      ...commentPanelState,
      comments: remoteComments,
    };
    await rerender(loadThoughtFeed(storage));
  };

  renderThoughtsPage(doc);
  void rerender();

  doc.addEventListener("click", async (event) => {
    const commentButton = event.target.closest("[data-comment-thought-id]");
    if (commentButton) {
      const thoughtId = commentButton.dataset.commentThoughtId || "";
      const cardId = commentButton.dataset.commentCardId || "";
      if (!thoughtId || !currentProfile?.playerId) return;

      if (commentPanelState.cardId === cardId) {
        commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
        void rerender(loadThoughtFeed(storage));
        return;
      }

      void openCommentSheet(cardId, thoughtId);
      return;
    }

    const shareButton = event.target.closest("[data-share-thought-id]");
    if (shareButton) {
      const thoughtId = shareButton.dataset.shareThoughtId;
      const cardId = shareButton.dataset.shareCardId || "";
      if (!thoughtId || !currentProfile?.playerId) return;

      openReactionThoughtId = "";
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      sharePanelState = sharePanelState.cardId === cardId
        ? { cardId: "", thoughtId: "", mode: "", caption: "" }
        : { cardId, thoughtId, mode: "", caption: "" };
      void rerender(loadThoughtFeed(storage));
      return;
    }

    const shareNowButton = event.target.closest("[data-share-now-thought-id]");
    if (shareNowButton) {
      const thoughtId = shareNowButton.dataset.shareNowThoughtId;
      if (!thoughtId || !currentProfile?.playerId) return;

      await shareThoughtPostWithApi(thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, storage, {
        apiClient,
      });
      openReactionThoughtId = "";
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender(loadThoughtFeed(storage));
      return;
    }

    const openShareCaptionButton = event.target.closest("[data-open-share-caption]");
    if (openShareCaptionButton) {
      const thoughtId = openShareCaptionButton.dataset.openShareCaption || "";
      const cardId = openShareCaptionButton.dataset.shareCardId || "";
      sharePanelState = {
        cardId,
        thoughtId,
        mode: "caption",
        caption: sharePanelState.thoughtId === thoughtId ? sharePanelState.caption : "",
      };
      openReactionThoughtId = "";
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender(loadThoughtFeed(storage));
      return;
    }

    const closeShareSheetButton = event.target.closest("[data-close-share-sheet]");
    if (closeShareSheetButton) {
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      void rerender(loadThoughtFeed(storage));
      return;
    }

    const closeCommentSheetButton = event.target.closest("[data-close-comment-sheet]");
    if (closeCommentSheetButton) {
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender(loadThoughtFeed(storage));
      return;
    }

    const toggleButton = event.target.closest("[data-toggle-thought-reactions]");
    if (toggleButton) {
      const thoughtId = toggleButton.dataset.toggleThoughtReactions || "";
      openReactionThoughtId = openReactionThoughtId === thoughtId ? "" : thoughtId;
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender(loadThoughtFeed(storage));
      return;
    }

    const reactionButton = event.target.closest("[data-react-thought-id]");
    if (reactionButton) {
      const thoughtId = reactionButton.dataset.reactThoughtId;
      const reactionId = reactionButton.dataset.thoughtReactionId;
      if (!thoughtId || !reactionId || !currentProfile?.playerId) return;

      await reactToThoughtPostWithApi(thoughtId, currentProfile.playerId, reactionId, storage, {
        apiClient,
      });
      openReactionThoughtId = "";
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender(loadThoughtFeed(storage));
      return;
    }

    if (!event.target.closest(".thought-card__reaction-picker") && openReactionThoughtId) {
      openReactionThoughtId = "";
      void rerender(loadThoughtFeed(storage));
      return;
    }

    if (!event.target.closest(".thought-card__share-sheet") && sharePanelState.cardId) {
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      void rerender(loadThoughtFeed(storage));
      return;
    }

    if (!event.target.closest(".thought-card__comment-sheet") && commentPanelState.cardId) {
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender(loadThoughtFeed(storage));
    }
  });

  doc.addEventListener("input", (event) => {
    const captionInput = event.target.closest("[data-share-caption-input]");
    if (captionInput) {
      sharePanelState = {
        ...sharePanelState,
        caption: captionInput.value || "",
      };
      return;
    }

    const commentInput = event.target.closest("[data-comment-input]");
    if (!commentInput) return;
    commentPanelState = {
      ...commentPanelState,
      text: commentInput.value || "",
    };
  });

  doc.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!form || typeof form !== "object") {
      return;
    }

    if (form.matches?.("[data-share-caption-form]")) {
      event.preventDefault();
      if (!sharePanelState.thoughtId || !currentProfile?.playerId) {
        return;
      }

      await shareThoughtPostWithApi(sharePanelState.thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, storage, {
        apiClient,
        caption: sharePanelState.caption,
      });
      sharePanelState = { cardId: "", thoughtId: "", mode: "", caption: "" };
      commentPanelState = { cardId: "", thoughtId: "", text: "", comments: [] };
      void rerender(loadThoughtFeed(storage));
      return;
    }

    if (!form.matches?.("[data-comment-form]")) {
      return;
    }

    event.preventDefault();
    if (!commentPanelState.thoughtId || !currentProfile?.playerId || !commentPanelState.text.trim()) {
      return;
    }

    await commentOnThoughtPostWithApi(commentPanelState.thoughtId, {
      playerId: currentProfile.playerId,
      profileName: currentProfile.profileName || "UNNAMED PILOT",
    }, commentPanelState.text, storage, {
      apiClient,
    });
    commentPanelState = {
      ...commentPanelState,
      text: "",
      comments: loadThoughtComments(commentPanelState.thoughtId, storage),
    };
    void rerender(loadThoughtFeed(storage));
  });
}
