import { loadActivityFeed, syncActivityFeed } from "./platform/activity/activity.mjs";
import { createPlatformApiClient } from "./platform/api/platform-api.mjs";
import { getDefaultPlatformStorage } from "./platform/storage/storage.mjs";
import { initSessionNav, renderPrimaryAppNav } from "./arcade-session-nav.mjs";

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function titleFromSlug(slug: unknown): string {
  return String(slug || "")
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatActivityDate(value: any): string {
  const timestamp = Date.parse(value || "");
  if (!timestamp) return "Signal pending";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatVisibilityLabel(value: unknown): string {
  const label = String(value || "").trim().toLowerCase();
  if (!label) return "Friends";
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatCountLabel(count: number): string {
  return `${count} SIGNAL${count === 1 ? "" : "S"}`;
}

const EMPTY_FEED_MESSAGE = "No signals yet. Finish a run on any cabinet and it lands here.";
const OFFLINE_FEED_MESSAGE = "Can't reach the arcade right now. Showing what's saved on this device.";

function buildEmptyStateMessage(status: string, isOffline: boolean): string {
  return isOffline || status === "offline" ? OFFLINE_FEED_MESSAGE : EMPTY_FEED_MESSAGE;
}

function buildPendingNotice(pendingCount: number): string {
  if (pendingCount < 1) return "";
  return pendingCount === 1
    ? "1 signal is saved on this device and will upload once you're signed in and back online."
    : `${pendingCount} signals are saved on this device and will upload once you're signed in and back online.`;
}

export function buildActivityPageViewModel(activityFeed: any = loadActivityFeed(), options: any = {}) {
  const items = Array.isArray(activityFeed) ? activityFeed : [];
  const status = String(options?.status || "synced");
  const isOffline = status === "offline";
  const pendingCount = Number.isFinite(options?.pendingCount)
    ? Number(options.pendingCount)
    : items.filter((item: any) => item?.pendingSync).length;

  return {
    heroTitle: "ARCADE ACTIVITY",
    heroKicker: "FLOOR AFTERGLOW",
    heroSummary: "Platform-owned activity keeps game results and shared floor signals in one feed without letting individual cabinets invent their own long-term social history.",
    heroCountLabel: isOffline ? "OFFLINE" : formatCountLabel(items.length),
    isOffline,
    pendingCount,
    pendingNotice: buildPendingNotice(pendingCount),
    emptyMessage: items.length ? "" : buildEmptyStateMessage(status, isOffline),
    items: items.map((item: any) => ({
      id: item.id,
      title: item.actorDisplayName || "ARCADE SIGNAL",
      summary: item.summary || "Fresh cabinet afterglow incoming.",
      gameLabel: titleFromSlug(item.gameSlug) || "Arcade Floor",
      visibilityLabel: formatVisibilityLabel(item.visibility),
      publishedLabel: formatActivityDate(item.createdAt),
      isPending: item.pendingSync === true,
    })),
  };
}

export async function loadActivityPageData(options: any = {}) {
  const storage = options.storage || getDefaultPlatformStorage();
  const apiClient = options.apiClient || createPlatformApiClient(options);

  if (Array.isArray(options?.activityFeed)) {
    return {
      storage,
      activityFeed: options.activityFeed,
      status: "synced",
      pendingCount: options.activityFeed.filter((item: any) => item?.pendingSync).length,
    };
  }

  const { items, status, pendingCount } = await syncActivityFeed(storage, apiClient);

  return {
    storage,
    activityFeed: items,
    status,
    pendingCount,
  };
}

function renderHeroCard(container: HTMLElement | null, model: any): void {
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
      ${model.pendingNotice
        ? `<p class="activity-hero-card__notice">${escapeHtml(model.pendingNotice)}</p>`
        : ""}
    </div>
  `;
}

function renderEmptyState(message: string, isOffline: boolean): string {
  return `
    <p class="activity-empty${isOffline ? " activity-empty--offline" : ""}" role="status">
      ${escapeHtml(message)}
    </p>
  `;
}

function renderActivityCard(item: any): string {
  return `
    <article class="activity-card${item.isPending ? " activity-card--pending" : ""}">
      <div class="activity-card__topline">
        <span class="activity-card__visibility">${escapeHtml(item.visibilityLabel)}</span>
        ${item.isPending ? '<span class="activity-card__pending">Not uploaded yet</span>' : ""}
        <span class="activity-card__date">${escapeHtml(item.publishedLabel)}</span>
      </div>
      <h2 class="activity-card__title">${escapeHtml(item.title)}</h2>
      <p class="activity-card__summary">${escapeHtml(item.summary)}</p>
      <p class="activity-card__meta">${escapeHtml(item.gameLabel)}</p>
    </article>
  `;
}

export function renderActivityPage(
  doc: Document = globalThis.document,
  activityFeed: any = loadActivityFeed(),
  options: any = {},
) {
  if (!doc?.getElementById) return null;

  const model = buildActivityPageViewModel(activityFeed, options);
  renderHeroCard(doc.getElementById("activityHeroCard"), model);

  const feed = doc.getElementById("activityFeed");
  if (feed) {
    feed.innerHTML = model.items.length
      ? model.items.map(renderActivityCard).join("")
      : renderEmptyState(model.emptyMessage, model.isOffline);
  }

  return model;
}

const doc = globalThis.document;

if (typeof doc?.getElementById === "function") {
  renderPrimaryAppNav(doc.getElementById("activityPrimaryNav"), {
    basePath: "../",
    currentPage: "activity",
    linkClass: "activity-stage__portal",
    sessionNavId: "activityAuthNav",
  });
  void initSessionNav(doc.getElementById("activityAuthNav"), {
    signInPath: "../sign-in/index.html",
    signUpPath: "../sign-up/index.html",
    homeOnLogout: "../index.html",
  });

  renderActivityPage(doc);
  void loadActivityPageData().then(({ activityFeed, status, pendingCount }) => {
    renderActivityPage(doc, activityFeed, { status, pendingCount });
  });
}
