import { buildPublicBulletinFeed } from "./platform/bulletins/bulletins.mjs";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatBulletinDate(value) {
  const timestamp = Date.parse(value || "");
  if (!timestamp) return "Date pending";

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function formatStatusLabel(status) {
  if (!status) return "Draft";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function buildBulletinsPageViewModel(bulletins = buildPublicBulletinFeed()) {
  const items = Array.isArray(bulletins) ? bulletins : [];

  return {
    heroTitle: "ARCADE BULLETINS",
    heroKicker: "SYSTEM NOTICEBOARD",
    heroSummary: "Platform notices, event calls, and cabinet-floor updates can land here without games taking ownership of the social layer.",
    heroCountLabel: `${items.length} LIVE`,
    items: items.length > 0
      ? items.map((bulletin) => ({
          id: bulletin.id,
          title: bulletin.title,
          summary: bulletin.summary || bulletin.body || "Fresh noticeboard signal incoming.",
          body: bulletin.body,
          publishedLabel: formatBulletinDate(bulletin.publishedAt),
          statusLabel: formatStatusLabel(bulletin.status),
          createdByLabel: bulletin.createdBy || "system",
          isPlaceholder: false,
        }))
      : [{
          id: "bulletin-placeholder",
          title: "Noticeboard Warming Up",
          summary: "The bulletin board is still warming up. Public notices will appear here once more platform surfaces come online.",
          body: "",
          publishedLabel: "Soon",
          statusLabel: "Standby",
          createdByLabel: "system",
          isPlaceholder: true,
        }],
  };
}

function renderHeroCard(container, model) {
  if (!container) return;

  container.innerHTML = `
    <div class="bulletins-hero-card__copy">
      <p class="bulletins-hero-card__kicker">${escapeHtml(model.heroKicker)}</p>
      <h2 class="bulletins-hero-card__title">${escapeHtml(model.heroTitle)}</h2>
      <p class="bulletins-hero-card__summary">${escapeHtml(model.heroSummary)}</p>
    </div>
    <div class="bulletins-hero-card__meta">
      <div class="bulletins-meta-block">
        <span class="bulletins-meta-block__label">Board Status</span>
        <span class="bulletins-meta-block__value">${escapeHtml(model.heroCountLabel)}</span>
      </div>
    </div>
  `;
}

function renderBulletinCard(item) {
  const cardClass = item.isPlaceholder ? "bulletin-card bulletin-card--placeholder" : "bulletin-card";

  return `
    <article class="${cardClass}">
      <div class="bulletin-card__topline">
        <span class="bulletin-card__status">${escapeHtml(item.statusLabel)}</span>
        <span class="bulletin-card__date">${escapeHtml(item.publishedLabel)}</span>
      </div>
      <h2 class="bulletin-card__title">${escapeHtml(item.title)}</h2>
      <p class="bulletin-card__summary">${escapeHtml(item.summary)}</p>
      <p class="bulletin-card__meta">Posted by ${escapeHtml(item.createdByLabel)}</p>
    </article>
  `;
}

export function renderBulletinsPage(doc = globalThis.document, bulletins = buildPublicBulletinFeed()) {
  if (!doc?.getElementById) return null;

  const model = buildBulletinsPageViewModel(bulletins);
  renderHeroCard(doc.getElementById("bulletinsHeroCard"), model);

  const feed = doc.getElementById("bulletinsFeed");
  if (feed) {
    feed.innerHTML = model.items.map(renderBulletinCard).join("");
  }

  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  renderBulletinsPage(doc);
}
