import { createAuthApiClient } from "./platform/api/auth-api.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { clearPlatformStorage, getDefaultPlatformStorage } from "./platform/storage/storage.mjs";
import { initNotificationBell } from "./arcade-notifications.mjs";

const auth = createAuthApiClient();
const SIGNED_OUT_QUERY_KEY = "signedOut";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
      <span class="session-nav__name">${escapeHtml(displayName)}</span>
      <button class="session-nav__signout grid-stage__portal" type="button">Sign Out</button>
    `;

    containerEl.querySelector(".session-nav__signout").addEventListener("click", async () => {
      await auth.logout();
      clearPlatformStorage(getDefaultPlatformStorage());
      window.location.href = buildLogoutRedirectUrl(homeOnLogout, globalThis.location?.href || "");
    });

    void initNotificationBell(containerEl, session.playerId);
  } else {
    containerEl.innerHTML = `
      <a class="session-nav__link grid-stage__portal" href="${signInPath}">Sign In</a>
      <a class="session-nav__link grid-stage__portal" href="${signUpPath}">Create Account</a>
    `;
  }

  return session;
}
