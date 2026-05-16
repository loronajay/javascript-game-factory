import { bindFactoryProfileToSession } from "../platform/identity/factory-profile.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import { renderMePage } from "./render.mjs";
import { wireMePage } from "./wire.mjs";
import { addFriendByCode } from "./friend-code-actions.mjs";
import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { createAuthApiClient } from "../platform/api/auth-api.mjs";
import { buildAppUrl } from "../arcade-paths.mjs";
import { fetchLayout } from "../profile-layout/layout-storage.mjs";
import { getDefaultLayout } from "../profile-layout/default-layout.mjs";
import { normalizeLayout } from "../profile-layout/normalize-layout.mjs";
import { applyMeLayout } from "./apply-layout.mjs";
import { applyMeScaling } from "./apply-scale.mjs";

const doc = globalThis.document;

if (doc?.getElementById) {
  renderPrimaryAppNav(doc.getElementById("mePrimaryNav"), {
    basePath: "../",
    currentPage: "me",
    linkClass: "grid-stage__portal",
    sessionNavId: "meAuthNav",
  });

  let session = null;
  try { session = await createAuthApiClient().getSession(); } catch { /* network down */ }

  if (!session?.ok || !session?.playerId) {
    const signInUrl = new URL(buildAppUrl("sign-in/index.html"));
    signInUrl.searchParams.set("next", "/me/index.html");
    window.location.replace(signInUrl.toString());
  } else {
    const storage = getDefaultPlatformStorage();
    bindFactoryProfileToSession(session.playerId, storage);
    const apiClient = createPlatformApiClient();
    const rawLayout = await fetchLayout(apiClient);
    const savedLayout = rawLayout ? normalizeLayout(rawLayout) : getDefaultLayout();
    renderMePage(doc);
    applyMeLayout(doc, savedLayout);
    requestAnimationFrame(() => applyMeScaling(doc, savedLayout));
    doc.querySelectorAll(".me-layout img").forEach((img) => {
      if (!img.complete) {
        img.addEventListener("load", () => applyMeScaling(doc, savedLayout), { once: true });
      }
    });
    wireMePage(doc, renderMePage, addFriendByCode, { storage, apiClient, savedLayout });
    initSessionNav(doc.getElementById("meAuthNav"), {
      signInPath: "../sign-in/index.html",
      signUpPath: "../sign-up/index.html",
      homeOnLogout: "../index.html",
      preloadedSession: session,
    });
  }
}
