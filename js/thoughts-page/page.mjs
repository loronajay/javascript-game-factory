import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { loadFactoryProfile } from "../platform/identity/factory-profile.mjs";
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
  void initSessionNav(doc.getElementById("thoughtsAuthNav"), {
    signInPath: "../sign-in/index.html",
    signUpPath: "../sign-up/index.html",
    homeOnLogout: "../index.html",
  });

  const storage = getDefaultPlatformStorage();
  const apiClient = createPlatformApiClient();

  const rerender = async (thoughtFeedOverride = null) => {
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
      return loadFactoryProfile(storage);
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
