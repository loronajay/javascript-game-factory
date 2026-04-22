import {
  buildThoughtCardItems,
  loadThoughtFeed,
  syncThoughtFeedFromApi,
} from "./platform/thoughts/thoughts.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
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

export function buildThoughtsPageViewModel(thoughtFeed = loadThoughtFeed()) {
  const items = Array.isArray(thoughtFeed) ? thoughtFeed : [];

  return {
    heroTitle: "ARCADE THOUGHTS",
    heroKicker: "STATUS FEED",
    heroSummary: "This is the first scaffold for the future player-status feed: short posts, visible engagement counts, and a scrollable social lane that can later grow comments and sharing.",
    heroCountLabel: formatCountLabel(items.length),
    items: buildThoughtCardItems(items, {
      placeholderTitle: "Feed Warming Up",
      placeholderSummary: "The thoughts feed is still warming up. Player status posts will appear here once more social surfaces come online.",
    }),
  };
}

export async function loadThoughtsPageData(options = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options.apiClient || createPlatformApiClient(options);
  const thoughtFeed = Array.isArray(options?.thoughtFeed)
    ? options.thoughtFeed
    : await syncThoughtFeedFromApi(storage, apiClient);

  return {
    storage,
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

function renderThoughtCard(item) {
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
    </article>
  `;
}

export function renderThoughtsPage(doc = globalThis.document, thoughtFeed = loadThoughtFeed()) {
  if (!doc?.getElementById) return null;

  const model = buildThoughtsPageViewModel(thoughtFeed);
  renderHeroCard(doc.getElementById("thoughtsHeroCard"), model);

  const feed = doc.getElementById("thoughtsFeed");
  if (feed) {
    feed.innerHTML = model.items.map(renderThoughtCard).join("");
  }

  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  renderThoughtsPage(doc);
  void loadThoughtsPageData().then(({ thoughtFeed }) => {
    renderThoughtsPage(doc, thoughtFeed);
  });
}
