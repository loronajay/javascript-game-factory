import { resolvePublicEventBySlug } from "./platform/events/events.mjs";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function sanitizeSlug(value) {
  return typeof value === "string" ? value.trim() : "";
}

function titleFromSlug(slug) {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatShortDate(value) {
  const timestamp = Date.parse(value || "");
  if (!timestamp) return "Date pending";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function formatStatusLabel(status) {
  if (!status) return "Scheduled";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function buildEventDetailViewModel(event, options = {}) {
  const requestedSlug = sanitizeSlug(options.requestedSlug);

  if (!event) {
    return {
      state: "missing",
      heroKicker: "EVENT DETAIL",
      heroTitle: "EVENT NOT FOUND",
      heroSummary: "This event is not present on the local event board yet. Return to the calendar for the sessions that are currently cached on this cabinet.",
      body: "The local-first event board only knows about the events currently bundled into the platform surface.",
      metaItems: [
        { label: "Requested Slug", value: requestedSlug || "NO-SLUG" },
        { label: "Status", value: "Missing" },
        { label: "Window", value: "Unknown" },
      ],
      relatedItems: [{
        title: "Related Games",
        value: "No linked games are cached for this event yet.",
        isPlaceholder: true,
      }],
      bulletinItems: [{
        title: "Related Bulletins",
        value: "No linked bulletins are cached for this event yet.",
        isPlaceholder: true,
      }],
    };
  }

  return {
    state: "ready",
    heroKicker: "EVENT DETAIL",
    heroTitle: event.title,
    heroSummary: event.summary || "Public event brief from the arcade calendar.",
    body: event.body || "Extended event notes are still warming up for this listing.",
    metaItems: [
      { label: "Status", value: formatStatusLabel(event.status) },
      { label: "Starts", value: formatShortDate(event.startsAt) },
      { label: "Ends", value: formatShortDate(event.endsAt) },
    ],
    relatedItems: event.relatedGames.length > 0
      ? event.relatedGames.map((slug) => ({
          title: titleFromSlug(slug),
          value: slug,
          isPlaceholder: false,
        }))
      : [{
          title: "Related Games",
          value: "No cabinet links are attached to this event yet.",
          isPlaceholder: true,
        }],
    bulletinItems: event.bulletinIds.length > 0
      ? event.bulletinIds.map((id) => ({
          title: "Related Bulletin",
          value: id,
          isPlaceholder: false,
        }))
      : [{
          title: "Related Bulletins",
          value: "No linked bulletins are attached to this event yet.",
          isPlaceholder: true,
        }],
  };
}

function renderHeroCard(container, model) {
  if (!container) return;

  const metaHtml = model.metaItems.map((item) => `
    <div class="event-meta-block">
      <span class="event-meta-block__label">${escapeHtml(item.label)}</span>
      <span class="event-meta-block__value">${escapeHtml(item.value)}</span>
    </div>
  `).join("");

  container.innerHTML = `
    <div class="event-hero-card__copy">
      <p class="event-hero-card__kicker">${escapeHtml(model.heroKicker)}</p>
      <h2 class="event-hero-card__title">${escapeHtml(model.heroTitle)}</h2>
      <p class="event-hero-card__summary">${escapeHtml(model.heroSummary)}</p>
      <p class="event-hero-card__body">${escapeHtml(model.body)}</p>
    </div>
    <div class="event-hero-card__meta">${metaHtml}</div>
  `;
}

function renderPanel(container, title, subtitle, items) {
  if (!container) return;

  const itemsHtml = items.map((item) => {
    const itemClass = item.isPlaceholder ? "event-card-item event-card-item--placeholder" : "event-card-item";
    return `
      <article class="${itemClass}">
        <p class="event-card-item__title">${escapeHtml(item.title)}</p>
        <p class="event-card-item__value">${escapeHtml(item.value)}</p>
      </article>
    `;
  }).join("");

  container.innerHTML = `
    <div class="event-panel__topline">
      <p class="event-panel__eyebrow">${escapeHtml(subtitle)}</p>
      <h2 class="event-panel__title">${escapeHtml(title)}</h2>
    </div>
    ${itemsHtml}
  `;
}

export function renderEventDetailPage(doc = globalThis.document, options = {}) {
  if (!doc?.getElementById) return null;

  const params = new URLSearchParams(options.search || globalThis.location?.search || "");
  const requestedSlug = sanitizeSlug(params.get("slug"));
  const event = options.event ?? resolvePublicEventBySlug(options.source, requestedSlug);
  const model = buildEventDetailViewModel(event, { requestedSlug });

  renderHeroCard(doc.getElementById("eventHeroCard"), model);
  renderPanel(doc.getElementById("eventRelatedPanel"), "Related Cabinets", "Floor Links", model.relatedItems);
  renderPanel(doc.getElementById("eventBulletinsPanel"), "Related Bulletins", "Noticeboard Crossfeed", model.bulletinItems);
  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  renderEventDetailPage(doc);
}
