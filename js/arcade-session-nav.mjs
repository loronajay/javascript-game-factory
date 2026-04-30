import { createAuthApiClient } from "./platform/api/auth-api.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { clearPlatformStorage, getDefaultPlatformStorage } from "./platform/storage/storage.mjs";
import { initNotificationBell } from "./arcade-notifications.mjs";

const auth = createAuthApiClient();
const SIGNED_OUT_QUERY_KEY = "signedOut";
const PRIMARY_APP_NAV_ITEMS = [
  { key: "home", label: "Home", path: "index.html" },
  { key: "me", label: "Me", path: "me/index.html" },
  { key: "arcade", label: "Arcade", path: "grid.html" },
  { key: "search", label: "Search", path: "search/index.html" },
  { key: "messages", label: "Messages", path: "messages/index.html" },
];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildPrimaryAppNavItems(basePath = "") {
  const normalizedBasePath = String(basePath || "");
  return PRIMARY_APP_NAV_ITEMS.map((item) => ({
    ...item,
    href: `${normalizedBasePath}${item.path}`,
  }));
}

export function buildPrimaryAppNavMarkup({
  basePath = "",
  currentPage = "",
  linkClass = "grid-stage__portal",
  sessionNavId = "",
  includeSessionNav = true,
} = {}) {
  const currentPageKey = String(currentPage || "").trim().toLowerCase();
  const linksMarkup = buildPrimaryAppNavItems(basePath).map((item) => {
    const isCurrent = item.key === currentPageKey;
    const classes = [
      "app-shell-nav__link",
      linkClass,
      isCurrent ? "app-shell-nav__link--current" : "",
    ].filter(Boolean).join(" ");
    const currentAttr = isCurrent ? ' aria-current="page"' : "";
    return `<a class="${escapeHtml(classes)}" href="${escapeHtml(item.href)}"${currentAttr}>${escapeHtml(item.label)}</a>`;
  }).join("");

  const sessionMarkup = includeSessionNav && sessionNavId
    ? `<div class="app-shell-nav__session-slot"><div id="${escapeHtml(sessionNavId)}" class="session-nav"></div></div>`
    : "";

  return `<div class="app-shell-nav"><div class="app-shell-nav__tabs">${linksMarkup}</div>${sessionMarkup}</div>`;
}

export function renderPrimaryAppNav(containerEl, options = {}) {
  if (!containerEl) return null;
  containerEl.innerHTML = buildPrimaryAppNavMarkup(options);
  const sessionNavId = typeof options?.sessionNavId === "string" ? options.sessionNavId.trim() : "";
  return sessionNavId ? containerEl.querySelector(`#${sessionNavId}`) : null;
}

export function shouldSkipSessionCheck(locationRef = globalThis.location) {
  try {
    const params = new URLSearchParams(locationRef?.search || "");
    return params.get(SIGNED_OUT_QUERY_KEY) === "1";
  } catch {
    return false;
  }
}

export function buildLogoutRedirectUrl(homeOnLogout = "index.html", currentHref = globalThis.location?.href || "") {
  try {
    const nextUrl = new URL(homeOnLogout, currentHref || "http://localhost/");
    nextUrl.searchParams.set(SIGNED_OUT_QUERY_KEY, "1");
    return nextUrl.toString();
  } catch {
    const separator = String(homeOnLogout || "").includes("?") ? "&" : "?";
    return `${homeOnLogout}${separator}${SIGNED_OUT_QUERY_KEY}=1`;
  }
}

export async function initSessionNav(containerEl, {
  signInPath = "sign-in/index.html",
  signUpPath = "sign-up/index.html",
  homeOnLogout = "index.html",
  preloadedSession = null,
  locationRef = globalThis.location,
  historyRef = globalThis.history,
} = {}) {
  if (!containerEl) return;

  let session = preloadedSession || null;
  const skipSessionCheck = !session && shouldSkipSessionCheck(locationRef);
  if (!session && !skipSessionCheck) {
    try {
      session = await auth.getSession();
    } catch {
      // Network-down path should still render the signed-out shell.
    }
  }

  if (skipSessionCheck) {
    try {
      const nextUrl = new URL(locationRef?.href || "", "http://localhost/");
      nextUrl.searchParams.delete(SIGNED_OUT_QUERY_KEY);
      historyRef?.replaceState?.(null, "", nextUrl.toString());
    } catch {
      // Best-effort cleanup only.
    }
  }

  if (session?.ok && session?.playerId) {
    const profile = loadFactoryProfile();
    const displayName = profile?.profileName || "Pilot";

    containerEl.innerHTML = `
      <div class="session-nav__identity">
        <span class="session-nav__eyebrow">Signed in as</span>
        <span class="session-nav__name">${escapeHtml(displayName)}</span>
      </div>
      <button class="session-nav__signout app-shell-nav__utility-link" type="button">Sign Out</button>
    `;

    containerEl.querySelector(".session-nav__signout").addEventListener("click", async () => {
      await auth.logout();
      clearPlatformStorage(getDefaultPlatformStorage());
      window.location.href = buildLogoutRedirectUrl(homeOnLogout, globalThis.location?.href || "");
    });

    void initNotificationBell(containerEl, session.playerId);
  } else {
    containerEl.innerHTML = `
      <a class="session-nav__link app-shell-nav__utility-link" href="${signInPath}">Sign In</a>
      <a class="session-nav__link app-shell-nav__utility-link" href="${signUpPath}">Create Account</a>
    `;
  }

  return session;
}
