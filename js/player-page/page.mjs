import { initArcadeProfilePanel } from "../arcade-profile.mjs";
import { bindFactoryProfileToSession, loadFactoryProfile } from "../platform/identity/factory-profile.mjs";
import { createAuthApiClient } from "../platform/api/auth-api.mjs";
import {
  incrementProfileViewCountWithApi,
  loadProfileMetricsRecord,
} from "../platform/metrics/metrics.mjs";
import {
  loadPlayerPageData,
  loadRequestedPlayerProfile,
  sanitizePlayerId,
} from "./loader.mjs";
import { buildPlayerPageViewModel } from "./view-model.mjs";
import { loadProfileRelationshipsRecord } from "../platform/relationships/relationships.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import { loadThoughtFeed } from "../platform/thoughts/thoughts.mjs";
import { renderPlayerPageView } from "./render.mjs";
import { wirePlayerPage } from "./wire.mjs";

export { loadPlayerPageData, loadRequestedPlayerProfile } from "./loader.mjs";
export { buildPlayerPageViewModel } from "./view-model.mjs";

export function renderPlayerPage(doc = globalThis.document, options = {}) {
  if (!doc?.getElementById) return null;

  const params = new URLSearchParams(options.search || globalThis.location?.search || "");
  const requestedPlayerId = sanitizePlayerId(params.get("id"));
  const storage = options.storage || getDefaultPlatformStorage();
  const localProfile = loadFactoryProfile(storage);
  const viewerPlayerId = sanitizePlayerId(options?.authSessionPlayerId || localProfile.playerId);
  const isOwnerView = !requestedPlayerId || requestedPlayerId === viewerPlayerId;
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : loadThoughtFeed(storage);
  const profile = options.profile ?? loadRequestedPlayerProfile(storage, requestedPlayerId, { thoughtFeed });
  const metricsRecord = options?.metricsRecord?.playerId
    ? options.metricsRecord
    : loadProfileMetricsRecord(profile?.playerId || requestedPlayerId || localProfile.playerId, storage);
  const relationshipsRecord = options?.relationshipsRecord?.playerId
    ? options.relationshipsRecord
    : loadProfileRelationshipsRecord(profile?.playerId || requestedPlayerId || localProfile.playerId, storage);
  const viewerRelationshipsRecord = options?.viewerRelationshipsRecord?.playerId
    ? options.viewerRelationshipsRecord
    : loadProfileRelationshipsRecord(localProfile.playerId, storage);

  if (!isOwnerView && profile && !options?.disableProfileViewTracking) {
    void incrementProfileViewCountWithApi(
      profile.playerId,
      { source: "direct" },
      storage,
      options?.apiClient || createPlatformApiClient(options),
    );
  }

  const model = buildPlayerPageViewModel(profile, {
    requestedPlayerId,
    thoughtFeed,
    isOwnerView,
    metricsRecord,
    relationshipsRecord,
    viewerPlayerId: localProfile.playerId,
    viewerRelationshipsRecord,
    thoughtComposerFlash: options?.thoughtComposerFlash || "",
    relationshipFlash: options?.relationshipFlash || "",
    authSessionPlayerId: options?.authSessionPlayerId || "",
    gestureFlash: options?.gestureFlash || "",
    challengePickerOpen: options?.challengePickerOpen || false,
  });

  renderPlayerPageView(doc, model, options);
  return model;
}

const doc = globalThis.document;

if (doc?.getElementById) {
  const storage = getDefaultPlatformStorage();
  const apiClient = createPlatformApiClient();

  let authSession = null;
  try {
    authSession = await createAuthApiClient().getSession();
  } catch { /* no session */ }

  if (authSession?.playerId) {
    bindFactoryProfileToSession(authSession.playerId, storage);
  }

  const profilePanel = initArcadeProfilePanel({ doc, storage });
  renderPlayerPage(doc);
  wirePlayerPage(doc, renderPlayerPage, loadPlayerPageData, { storage, apiClient, profilePanel, authSession });
}
