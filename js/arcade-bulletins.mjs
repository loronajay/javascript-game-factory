import { DEFAULT_BULLETINS, buildPublicBulletinFeed } from "./platform/bulletins/bulletins.mjs";
import { initSessionNav, renderPrimaryAppNav } from "./arcade-session-nav.mjs";
import { createContentApiClient } from "./platform/api/content-api.mjs";
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
    if (!timestamp)
        return "Date pending";
    return new Intl.DateTimeFormat("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    }).format(new Date(timestamp));
}
function formatStatusLabel(status) {
    if (!status)
        return "Draft";
    return status.charAt(0).toUpperCase() + status.slice(1);
}
export function buildBulletinsPageViewModel(bulletins = buildPublicBulletinFeed()) {
    const items = Array.isArray(bulletins) ? bulletins : [];
    return {
        heroTitle: "ARCADE BULLETINS",
        heroKicker: "SYSTEM NOTICEBOARD",
        heroSummary: "Platform notices, event calls, and cabinet-floor updates land here.",
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
    if (!container)
        return;
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
    if (!doc?.getElementById)
        return null;
    const model = buildBulletinsPageViewModel(bulletins);
    renderHeroCard(doc.getElementById("bulletinsHeroCard"), model);
    const feed = doc.getElementById("bulletinsFeed");
    if (feed) {
        feed.innerHTML = model.items.map(renderBulletinCard).join("");
    }
    return model;
}
// Resolves what the board should show.
//
// THE NULL-VS-EMPTY RULE. `listBulletins()` returns null when the platform could not be
// asked (offline, API not configured, server error) and an array when it answered. Only
// null falls back to the shipped fixtures. An empty array is a real answer — "nothing is
// published right now" — and must render the empty board, otherwise an operator who
// unpublishes everything would see demo content reappear and have no way to clear it.
export async function loadBulletinsForPage(client = createContentApiClient()) {
    const remote = await client.listBulletins();
    return buildPublicBulletinFeed(remote === null ? DEFAULT_BULLETINS : remote);
}
const doc = globalThis.document;
if (typeof doc?.getElementById === "function") {
    renderPrimaryAppNav(doc.getElementById("bulletinsPrimaryNav"), {
        basePath: "../",
        currentPage: "bulletins",
        linkClass: "bulletins-stage__portal",
        sessionNavId: "bulletinsAuthNav",
    });
    void initSessionNav(doc.getElementById("bulletinsAuthNav"), {
        signInPath: "../sign-in/index.html",
        signUpPath: "../sign-up/index.html",
        homeOnLogout: "../index.html",
    });
    // Rendered once, after the source is resolved. Painting the fixtures first and swapping
    // would flash demo content on every load for an operator who has published real
    // bulletins; the view model's built-in "Noticeboard Warming Up" placeholder already
    // reads as a loading state, so the empty first frame costs nothing.
    renderBulletinsPage(doc, []);
    void loadBulletinsForPage().then((bulletins) => renderBulletinsPage(doc, bulletins));
}
