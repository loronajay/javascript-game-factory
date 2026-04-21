import { buildPublicEventFeed } from "./platform/events/events.mjs";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatShortDate(value) {
  const timestamp = Date.parse(value || "");
  if (!timestamp) return "Date pending";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function formatStatusLabel(status) {
  if (!status) return "Scheduled";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function buildEventsPageViewModel(events = buildPublicEventFeed()) {
  const items = Array.isArray(events) ? events : [];

  return {
    heroTitle: "ARCADE EVENTS",
    heroKicker: "FLOOR CALENDAR",
    heroSummary: "Shared event pages let the platform announce upcoming sessions without pushing scheduling logic down into individual games.",
    heroCountLabel: `${items.length} LISTED`,
    items: items.length > 0
      ? items.map((event) => ({
          id: event.id,
          title: event.title,
          summary: event.summary || event.body || "Fresh floor session incoming.",
          dateLabel: formatShortDate(event.startsAt),
          statusLabel: formatStatusLabel(event.status),
          relatedGamesLabel: `${event.relatedGames.length} game${event.relatedGames.length === 1 ? "" : "s"}`,
          href: `../event/index.html?slug=${encodeURIComponent(event.slug)}`,
          isPlaceholder: false,
        }))
      : [{
          id: "event-placeholder",
          title: "Calendar Warming Up",
          summary: "The event board is still warming up. Upcoming floor sessions will appear here once more platform scheduling surfaces come online.",
          dateLabel: "Soon",
          statusLabel: "Standby",
          relatedGamesLabel: "0 games",
          href: "#",
          isPlaceholder: true,
        }],
  };
}

function renderHeroCard(container, model) {
  if (!container) return;

  container.innerHTML = `
    <div class="events-hero-card__copy">
      <p class="events-hero-card__kicker">${escapeHtml(model.heroKicker)}</p>
      <h2 class="events-hero-card__title">${escapeHtml(model.heroTitle)}</h2>
      <p class="events-hero-card__summary">${escapeHtml(model.heroSummary)}</p>
    </div>
    <div class="events-hero-card__meta">
      <div class="events-meta-block">
        <span class="events-meta-block__label">Calendar Status</span>
        <span class="events-meta-block__value">${escapeHtml(model.heroCountLabel)}</span>
      </div>
    </div>
  `;
}

function renderEventCard(item) {
  const cardClass = item.isPlaceholder ? "event-card event-card--placeholder" : "event-card";
  const content = `
    <div class="event-card__topline">
      <span class="event-card__status">${escapeHtml(item.statusLabel)}</span>
      <span class="event-card__date">${escapeHtml(item.dateLabel)}</span>
    </div>
    <h2 class="event-card__title">${escapeHtml(item.title)}</h2>
    <p class="event-card__summary">${escapeHtml(item.summary)}</p>
    <p class="event-card__meta">${escapeHtml(item.relatedGamesLabel)}</p>
  `;

  if (item.isPlaceholder) {
    return `<article class="${cardClass}">${content}</article>`;
  }

  return `<a class="${cardClass}" href="${escapeHtml(item.href)}">${content}</a>`;
}

export function renderEventsPage(doc = globalThis.document, events = buildPublicEventFeed()) {
  if (!doc?.getElementById) return null;

  const model = buildEventsPageViewModel(events);
  renderHeroCard(doc.getElementById("eventsHeroCard"), model);

  const feed = doc.getElementById("eventsFeed");
  if (feed) {
    feed.innerHTML = model.items.map(renderEventCard).join("");
  }

  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  renderEventsPage(doc);
}
