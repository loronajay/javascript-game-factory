import { loadActivityFeed } from "./platform/activity/activity.mjs";

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

function formatActivityDate(value) {
  const timestamp = Date.parse(value || "");
  if (!timestamp) return "Signal pending";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatVisibilityLabel(value) {
  const label = String(value || "").trim().toLowerCase();
  if (!label) return "Friends";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatCountLabel(count) {
  return `${count} SIGNAL${count === 1 ? "" : "S"}`;
}

export function buildActivityPageViewModel(activityFeed = loadActivityFeed()) {
  const items = Array.isArray(activityFeed) ? activityFeed : [];

  return {
    heroTitle: "ARCADE ACTIVITY",
    heroKicker: "FLOOR AFTERGLOW",
    heroSummary: "Platform-owned activity keeps game results and shared floor signals in one feed without letting individual cabinets invent their own long-term social history.",
    heroCountLabel: formatCountLabel(items.length),
    items: items.length > 0
      ? items.map((item) => ({
          id: item.id,
          title: item.actorDisplayName || "ARCADE SIGNAL",
          summary: item.summary || "Fresh cabinet afterglow incoming.",
          gameLabel: titleFromSlug(item.gameSlug) || "Arcade Floor",
          visibilityLabel: formatVisibilityLabel(item.visibility),
          publishedLabel: formatActivityDate(item.createdAt),
          isPlaceholder: false,
        }))
      : [{
          id: "activity-placeholder",
          title: "Feed Warming Up",
          summary: "The activity board is still warming up. Shared game results and platform-floor signals will appear here once more cabinets publish into the common feed.",
          gameLabel: "Arcade Floor",
          visibilityLabel: "Standby",
          publishedLabel: "Soon",
          isPlaceholder: true,
        }],
  };
}

function renderHeroCard(container, model) {
  if (!container) return;

  container.innerHTML = `
    <div class="activity-hero-card__copy">
      <p class="activity-hero-card__kicker">${escapeHtml(model.heroKicker)}</p>
      <h2 class="activity-hero-card__title">${escapeHtml(model.heroTitle)}</h2>
      <p class="activity-hero-card__summary">${escapeHtml(model.heroSummary)}</p>
    </div>
    <div class="activity-hero-card__meta">
      <div class="activity-meta-block">
        <span class="activity-meta-block__label">Feed Status</span>
        <span class="activity-meta-block__value">${escapeHtml(model.heroCountLabel)}</span>
      </div>
    </div>
  `;
}

function renderActivityCard(item) {
  const cardClass = item.isPlaceholder ? "activity-card activity-card--placeholder" : "activity-card";

  return `
    <article class="${cardClass}">
      <div class="activity-card__topline">
        <span class="activity-card__visibility">${escapeHtml(item.visibilityLabel)}</span>
        <span class="activity-card__date">${escapeHtml(item.publishedLabel)}</span>
      </div>
      <h2 class="activity-card__title">${escapeHtml(item.title)}</h2>
      <p class="activity-card__summary">${escapeHtml(item.summary)}</p>
      <p class="activity-card__meta">${escapeHtml(item.gameLabel)}</p>
    </article>
  `;
}

export function renderActivityPage(doc = globalThis.document, activityFeed = loadActivityFeed()) {
  if (!doc?.getElementById) return null;

  const model = buildActivityPageViewModel(activityFeed);
  renderHeroCard(doc.getElementById("activityHeroCard"), model);

  const feed = doc.getElementById("activityFeed");
  if (feed) {
    feed.innerHTML = model.items.map(renderActivityCard).join("");
  }

  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  renderActivityPage(doc);
}
