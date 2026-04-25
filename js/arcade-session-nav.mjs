import { createAuthApiClient } from "./platform/api/auth-api.mjs";
import { loadFactoryProfile } from "./platform/identity/factory-profile.mjs";
import { initNotificationBell } from "./arcade-notifications.mjs";

const auth = createAuthApiClient();

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function initSessionNav(containerEl, {
  signInPath = "sign-in/index.html",
  signUpPath = "sign-up/index.html",
  homeOnLogout = "index.html",
  preloadedSession = null,
} = {}) {
  if (!containerEl) return;

  let session = preloadedSession || null;
  if (!session) {
    try {
      session = await auth.getSession();
    } catch {
      // network down — treat as logged out
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
      window.location.href = homeOnLogout;
    });

    // attach notification bell before the name
    void initNotificationBell(containerEl, session.playerId);
  } else {
    containerEl.innerHTML = `
      <a class="session-nav__link grid-stage__portal" href="${signInPath}">Sign In</a>
      <a class="session-nav__link grid-stage__portal" href="${signUpPath}">Create Account</a>
    `;
  }
}
