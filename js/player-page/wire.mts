import { PROFILE_UPDATED_EVENT } from "../arcade-profile.mjs";
import { loadFactoryProfile } from "../platform/identity/factory-profile.mjs";
import { syncThoughtPostCountWithApi } from "../platform/metrics/metrics.mjs";
import {
  buildPlayerThoughtFeed,
  commentOnThoughtPostWithApi,
  deleteThoughtPostWithApi,
  loadThoughtFeed,
  loadThoughtComments,
  reactToThoughtPostWithApi,
  shareThoughtPostWithApi,
  syncThoughtCommentsFromApi,
} from "../platform/thoughts/thoughts.mjs";
import type { PlatformApiClient } from "../platform/api/platform-api.mjs";
import type { StorageLike } from "../platform/storage/storage.mjs";
import { initProfileMusicPlayer } from "../profile-editor/music-player.mjs";
import { createPlayerHeroActions } from "./hero-actions.mjs";
import { createPlayerMediaActions } from "./media-actions.mjs";
import { createPlayerThoughtComposerActions } from "./thought-composer-actions.mjs";
import { createMediaComposerState } from "../profile-social/media-composer-state.mjs";
import { createProfileSocialActions } from "../profile-social/social-actions.mjs";
import { initPageGalleryViewer } from "../gallery-page/viewer.mjs";
import { applyPlayerLayout } from "../me-page/apply-layout.mjs";
import { applyPlayerScaling } from "../me-page/apply-scale.mjs";

interface WirePlayerPageConfig {
  storage: StorageLike | null;
  apiClient: PlatformApiClient;
  profilePanel: any;
  authSession: any;
  savedLayout?: any;
}

export function wirePlayerPage(
  doc: Document,
  renderPage: (doc: Document, options?: any) => any,
  loadPageData: (options?: any) => Promise<any>,
  { storage, apiClient, profilePanel, authSession, savedLayout = null }: WirePlayerPageConfig,
): void {
  let currentLayout = savedLayout;
  initPageGalleryViewer({ doc, apiClient });
  let currentPageData: any = null;
  let musicPlayer: any = null;
  let galleryPhotos: any[] = [];
  let heroActions: ReturnType<typeof createPlayerHeroActions> | null = null;
  const mediaComposer = createMediaComposerState({
    doc,
    thoughtPhotoNameId: "playerThoughtPhotoName",
    thoughtPhotoInputId: "playerThoughtPhotoInput",
  });

  const authSessionPlayerId = authSession?.playerId || "";

  const loadGallery = async (targetPlayerId: string) => {
    if (!targetPlayerId || !apiClient?.listPlayerPhotos) return;
    const isOwner = targetPlayerId === authSessionPlayerId;
    const photos = await apiClient.listPlayerPhotos(targetPlayerId, isOwner ? {} : { visibility: "public" }).catch(() => []);
    galleryPhotos = Array.isArray(photos) ? photos : [];
  };

  const buildRenderPayload = (pageData: any, overrides: any = {}) => {
    const socialViewState = socialActions.getViewState();
    return {
      ...pageData,
      authSessionPlayerId,
      challengePickerOpen: heroActions?.getChallengePickerOpen?.() || false,
      disableProfileViewTracking: true,
      openReactionThoughtId: socialViewState.openReactionThoughtId,
      sharePanelState: socialViewState.sharePanelState,
      commentPanelState: socialViewState.commentPanelState,
      galleryPhotos,
      thoughtComposerState: mediaComposer.getThoughtPhotoState(),
      galleryUploadState: mediaComposer.getGalleryUploadState(),
      isOwner: !!(pageData?.profile?.playerId && pageData.profile.playerId === authSessionPlayerId),
      galleryPlayerId: pageData?.profile?.playerId || "",
      ...overrides,
    };
  };

  const applyCurrentLayout = () => {
    if (!currentLayout) return;
    applyPlayerLayout(doc, currentLayout, { galleryPhotos });
    requestAnimationFrame(() => applyPlayerScaling(doc, currentLayout));
    doc.querySelectorAll<HTMLImageElement>(".player-layout img").forEach((img) => {
      if (!img.complete) {
        img.addEventListener("load", () => applyPlayerScaling(doc, currentLayout), { once: true });
      }
    });
  };

  const rerender = async (thoughtComposerFlash = "", disableProfileViewTracking = true) => {
    const pageData = await loadPageData({ storage, apiClient, authSessionPlayerId });
    currentPageData = pageData;
    profilePanel?.render?.("");
    renderPage(doc, buildRenderPayload(pageData, {
      thoughtComposerFlash,
      disableProfileViewTracking,
    }));
    applyCurrentLayout();
  };

  const renderCurrentPageData = async () => {
    const pageData = currentPageData || await loadPageData({ storage, apiClient, authSessionPlayerId });
    currentPageData = pageData;
    profilePanel?.render?.("");
    renderPage(doc, buildRenderPayload(pageData));
    applyCurrentLayout();
  };

  const socialActions = createProfileSocialActions({
    loadCurrentProfile() {
      return loadFactoryProfile(storage);
    },
    loadThoughtComments(thoughtId) {
      return loadThoughtComments(thoughtId, storage);
    },
    async syncThoughtComments(thoughtId) {
      return syncThoughtCommentsFromApi(thoughtId, storage, apiClient);
    },
    async commentOnThought(thoughtId, currentProfile, text) {
      return commentOnThoughtPostWithApi(thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, text, storage, { apiClient });
    },
    async shareThought(thoughtId, currentProfile, caption = "") {
      return shareThoughtPostWithApi(thoughtId, {
        playerId: currentProfile.playerId,
        profileName: currentProfile.profileName || "UNNAMED PILOT",
      }, storage, { apiClient, caption });
    },
    async reactToThought(thoughtId, reactionId, currentProfile) {
      return reactToThoughtPostWithApi(thoughtId, currentProfile.playerId, reactionId, storage, { apiClient });
    },
    async deleteThought(thoughtId) {
      return deleteThoughtPostWithApi(thoughtId, storage, { apiClient });
    },
    async rerenderView() {
      return rerender();
    },
    async rerenderPanels() {
      return renderCurrentPageData();
    },
    async afterDelete(_thoughtId, currentProfile) {
      const updatedThoughtCount = buildPlayerThoughtFeed(loadThoughtFeed(storage), currentProfile?.playerId).length;
      syncThoughtPostCountWithApi(currentProfile?.playerId, updatedThoughtCount, storage, apiClient);
    },
  });

  heroActions = createPlayerHeroActions({
    authSession,
    authSessionPlayerId,
    storage,
    apiClient,
    getCurrentPageData() {
      return currentPageData;
    },
    setCurrentPageData(nextValue) {
      currentPageData = nextValue;
    },
    loadCurrentProfile() {
      return loadFactoryProfile(storage);
    },
    renderCurrent(overrides = {}) {
      renderPage(doc, buildRenderPayload(currentPageData || {}, overrides));
      applyCurrentLayout();
    },
    profilePanel,
  });

  const mediaActions = createPlayerMediaActions({
    authSessionPlayerId,
    storage,
    apiClient,
    mediaComposer,
    rerender,
    loadGallery,
    loadCurrentProfile() {
      return loadFactoryProfile(storage);
    },
    getCurrentPageData() {
      return currentPageData;
    },
  });

  const thoughtComposerActions = createPlayerThoughtComposerActions({
    doc,
    storage,
    apiClient,
    mediaComposer,
    loadCurrentProfile() {
      return loadFactoryProfile(storage);
    },
    getCurrentPageData() {
      return currentPageData;
    },
    loadGallery,
    rerender,
  });

  void rerender("", false).then(() => {
    musicPlayer = initProfileMusicPlayer("playerMusicPanel", currentPageData?.profile?.profileMusicPlaylist || [], { doc });
    const targetId = currentPageData?.profile?.playerId || "";
    if (targetId) void loadGallery(targetId).then(() => rerender("", true));
  });

  doc.addEventListener(PROFILE_UPDATED_EVENT, (event) => {
    void rerender();
    const updatedPlaylist = (event as CustomEvent)?.detail?.profile?.profileMusicPlaylist;
    if (updatedPlaylist !== undefined) {
      musicPlayer?.destroy?.();
      musicPlayer = initProfileMusicPlayer("playerMusicPanel", updatedPlaylist, { doc });
    }
  });

  doc.addEventListener("submit", async (event) => {
    const form = event.target;
    const formEl = form as Element | null;

    if (formEl?.matches?.("[data-comment-form]") || formEl?.matches?.("[data-share-caption-form]")) {
      event.preventDefault();
      if (await socialActions.handleSubmit(form)) {
        return;
      }
      return;
    }

    if (form && typeof form === "object" && (form as HTMLElement).id === "playerGalleryUploadForm") {
      event.preventDefault();
      if (await mediaActions.handleSubmit(form)) {
        return;
      }
      return;
    }

    if (form && typeof form === "object" && (form as HTMLElement).id === "playerThoughtComposer") {
      event.preventDefault();
      if (await thoughtComposerActions.handleSubmit(form)) {
        return;
      }
      return;
    }
  });

  doc.addEventListener("click", async (event) => {
    if (await heroActions!.handleClick(event)) {
      return;
    }

    if (await socialActions.handleClick(event)) {
      return;
    }

    if (mediaActions.handleClick(event)) {
      return;
    }
  });

  doc.addEventListener("change", (event) => {
    if (mediaActions.handleChange(event)) {
      return;
    }
  });

  doc.addEventListener("input", (event) => {
    if (socialActions.handleInput(event)) return;

    if (mediaActions.handleInput(event)) {
      return;
    }
  });
}
