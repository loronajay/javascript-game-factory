import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { createAuthApiClient } from "../platform/api/auth-api.mjs";
import { bindFactoryProfileToSession, loadFactoryProfile } from "../platform/identity/factory-profile.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import { createThoughtsPageActions } from "./actions.mjs";
import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { initPageGalleryViewer } from "../gallery-page/viewer.mjs";
import {
  buildThoughtsPageViewModel,
  loadThoughtsPageData,
} from "./view-model.mjs";
import { renderThoughtsPage } from "./render.mjs";

export { buildThoughtsPageViewModel, loadThoughtsPageData } from "./view-model.mjs";
export { renderThoughtsPage } from "./render.mjs";

const doc = globalThis.document;

if (doc?.getElementById) {
  initPageGalleryViewer({ doc, apiClient: createPlatformApiClient() });

  renderPrimaryAppNav(doc.getElementById("thoughtsPrimaryNav"), {
    basePath: "../",
    currentPage: "thoughts",
    linkClass: "thoughts-stage__portal",
    sessionNavId: "thoughtsAuthNav",
  });
  const storage = getDefaultPlatformStorage();
  const apiClient = createPlatformApiClient();

  // The feed is public to read, but commenting/sharing/reacting is account-holders-only,
  // so the page resolves the session up front and treats guests as read-only.
  let authSession: any = null;
  try {
    authSession = await createAuthApiClient().getSession();
  } catch { /* no session */ }

  if (authSession?.playerId) {
    bindFactoryProfileToSession(authSession.playerId, storage);
  }

  void initSessionNav(doc.getElementById("thoughtsAuthNav"), {
    signInPath: "../sign-in/index.html",
    signUpPath: "../sign-up/index.html",
    homeOnLogout: "../index.html",
    preloadedSession: authSession,
  });

  const signedInPlayerId = authSession?.playerId || "";

  const rerender = async (thoughtFeedOverride: unknown[] | null = null) => {
    const currentProfile = loadFactoryProfile(storage);
    const viewState = actions.getViewState();
    const thoughtFeed = Array.isArray(thoughtFeedOverride)
      ? thoughtFeedOverride
      : (await loadThoughtsPageData({ storage, apiClient, currentProfile })).thoughtFeed;
    renderThoughtsPage(doc, thoughtFeed, viewState);
  };

  const actions = createThoughtsPageActions({
    storage,
    apiClient,
    loadCurrentProfile() {
      return signedInPlayerId ? loadFactoryProfile(storage) : null;
    },
    rerender,
  });

  renderThoughtsPage(doc);
  void rerender();

  doc.addEventListener("click", async (event) => {
    if (await actions.handleClick(event)) {
      return;
    }
  });

  doc.addEventListener("input", (event) => {
    actions.handleInput(event);
  });

  doc.addEventListener("submit", async (event) => {
    const form = event.target;
    if (await actions.handleSubmit(form, event)) {
      return;
    }
  });
}
