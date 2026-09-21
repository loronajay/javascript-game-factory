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
import type { PlayerPageViewModel } from "./view-model.mjs";
import { loadProfileRelationshipsRecord } from "../platform/relationships/relationships.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import { loadThoughtFeed } from "../platform/thoughts/thoughts.mjs";
import { renderPlayerPageView } from "./render.mjs";
import { wirePlayerPage } from "./wire.mjs";
import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { getPlayerDefaultLayout } from "../profile-layout/default-layout.mjs";
import { normalizeLayout } from "../profile-layout/normalize-layout.mjs";
import { applyPlayerLayout } from "../me-page/apply-layout.mjs";
import { applyPlayerScaling } from "../me-page/apply-scale.mjs";

export { loadPlayerPageData, loadRequestedPlayerProfile } from "./loader.mjs";
export { buildPlayerPageViewModel } from "./view-model.mjs";

export function renderPlayerPage(doc: Document = globalThis.document, options: any = {}): PlayerPageViewModel | null {
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
    ladderPlacements: Array.isArray(options?.ladderPlacements) ? options.ladderPlacements : [],
    viewerPlayerId: localProfile.playerId,
    viewerRelationshipsRecord,
    thoughtComposerFlash: options?.thoughtComposerFlash || "",
    relationshipFlash: options?.relationshipFlash || "",
    authSessionPlayerId: options?.authSessionPlayerId || "",
    gestureFlash: options?.gestureFlash || "",
    challengePickerOpen: options?.challengePickerOpen || false,
  });

  const galleryPlayerId = requestedPlayerId || profile?.playerId || "";
  renderPlayerPageView(doc, model, { ...options, galleryPlayerId });
  return model;
}

/**
 * The chip that opens this player's 3D arcade room. Their own room when the page
 * is the viewer's, otherwise a visit to the room under `?id=` — the same seam the
 * room page reads, so the two never disagree about whose room it is.
 */
export function wirePlayerArcadeLink(
  doc: Document,
  ids: { requestedPlayerId: string; viewerPlayerId: string },
): void {
  wirePlayerSpaceLink(doc, { linkId: "playerArcadeLink", labelId: "playerArcadeLinkLabel", path: "../room/", ownLabel: "My Arcade", visitLabel: "Visit Arcade" }, ids);
}

/** The farm chip: the same seam as the arcade's, pointed at `/farm/`. */
export function wirePlayerFarmLink(
  doc: Document,
  ids: { requestedPlayerId: string; viewerPlayerId: string },
): void {
  wirePlayerSpaceLink(doc, { linkId: "playerFarmLink", labelId: "playerFarmLinkLabel", path: "../farm/", ownLabel: "My Farm", visitLabel: "Visit Farm" }, ids);
}

type SpaceLinkSpec = { linkId: string; labelId: string; path: string; ownLabel: string; visitLabel: string };

function wirePlayerSpaceLink(
  doc: Document,
  spec: SpaceLinkSpec,
  { requestedPlayerId, viewerPlayerId }: { requestedPlayerId: string; viewerPlayerId: string },
): void {
  const link = doc.getElementById(spec.linkId) as HTMLAnchorElement | null;
  const label = doc.getElementById(spec.labelId);
  if (!link) return;
  const targetId = requestedPlayerId || viewerPlayerId;
  if (!targetId) {
    link.hidden = true;
    return;
  }
  const isOwn = targetId === viewerPlayerId;
  link.href = isOwn ? spec.path : `${spec.path}?id=${encodeURIComponent(targetId)}`;
  if (label) label.textContent = isOwn ? spec.ownLabel : spec.visitLabel;
  link.hidden = false;
}

// The trophy-case chip: the viewer's own page links to their collection, any
// other player's page to that player's (read-only, public). Same shape as the
// arcade link above.
export function wirePlayerAchievementsLink(
  doc: Document,
  { requestedPlayerId, viewerPlayerId }: { requestedPlayerId: string; viewerPlayerId: string },
): void {
  const link = doc.getElementById("playerAchievementsLink") as HTMLAnchorElement | null;
  const label = doc.getElementById("playerAchievementsLinkLabel");
  if (!link) return;
  const targetId = requestedPlayerId || viewerPlayerId;
  if (!targetId) {
    link.hidden = true;
    return;
  }
  const isOwn = targetId === viewerPlayerId;
  link.href = isOwn ? "../achievements/" : `../achievements/?id=${encodeURIComponent(targetId)}`;
  if (label) label.textContent = isOwn ? "Trophy Case" : "View Trophies";
  link.hidden = false;
}

const doc = globalThis.document;

if (typeof doc?.getElementById === "function") {
  const storage = getDefaultPlatformStorage();
  const apiClient = createPlatformApiClient();

  let authSession: any = null;
  try {
    authSession = await createAuthApiClient().getSession();
  } catch { /* no session */ }

  if (authSession?.playerId) {
    bindFactoryProfileToSession(authSession.playerId, storage);
  }

  const requestedPlayerId = sanitizePlayerId(new URLSearchParams(globalThis.location?.search || "").get("id"));
  const currentPage = authSession?.playerId && (!requestedPlayerId || requestedPlayerId === authSession.playerId)
    ? "me"
    : "";
  wirePlayerArcadeLink(doc, { requestedPlayerId, viewerPlayerId: authSession?.playerId || "" });
  wirePlayerFarmLink(doc, { requestedPlayerId, viewerPlayerId: authSession?.playerId || "" });
  wirePlayerAchievementsLink(doc, { requestedPlayerId, viewerPlayerId: authSession?.playerId || "" });
  renderPrimaryAppNav(doc.getElementById("playerPrimaryNav"), {
    basePath: "../",
    currentPage,
    linkClass: "player-stage__portal",
    sessionNavId: "playerAuthNav",
  });
  void initSessionNav(doc.getElementById("playerAuthNav"), {
    signInPath: "../sign-in/index.html",
    signUpPath: "../sign-up/index.html",
    homeOnLogout: "../index.html",
    preloadedSession: authSession,
  });

  // Fetch the target player's saved layout (or fall back to the default).
  let savedLayout = getPlayerDefaultLayout();
  try {
    const layout = requestedPlayerId
      ? await apiClient.fetchPlayerLayout(requestedPlayerId)
      : await apiClient.fetchMyLayout();
    if (layout) savedLayout = normalizeLayout(layout);
  } catch { /* keep default */ }

  renderPlayerPage(doc);
  applyPlayerLayout(doc, savedLayout);
  requestAnimationFrame(() => applyPlayerScaling(doc, savedLayout));
  doc.querySelectorAll<HTMLImageElement>(".player-layout img").forEach((img) => {
    if (!img.complete) {
      img.addEventListener("load", () => applyPlayerScaling(doc, savedLayout), { once: true });
    }
  });
  wirePlayerPage(doc, renderPlayerPage, loadPlayerPageData, { storage, apiClient, profilePanel: null, authSession, savedLayout });
}
