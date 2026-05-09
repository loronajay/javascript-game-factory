import { loadFactoryProfile } from "../platform/identity/factory-profile.mjs";
import {
  loadProfileMetricsRecord,
  syncThoughtPostCount,
} from "../platform/metrics/metrics.mjs";
import { loadProfileRelationshipsRecord } from "../platform/relationships/relationships.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import {
  buildPlayerThoughtFeed,
  loadThoughtFeed,
} from "../platform/thoughts/thoughts.mjs";
import { renderMePageView } from "../arcade-me-view.mjs";
import { buildMePageViewModel } from "./view-model.mjs";

export function renderMePage(doc = globalThis.document, profile = loadFactoryProfile(), options = {}) {
  if (!doc?.getElementById) return null;

  const storage = options.storage || getDefaultPlatformStorage();
  const thoughtFeed = Array.isArray(options?.thoughtFeed) ? options.thoughtFeed : loadThoughtFeed(storage);
  const playerThoughtFeed = buildPlayerThoughtFeed(thoughtFeed, profile?.playerId);
  if (profile?.playerId) {
    syncThoughtPostCount(profile.playerId, playerThoughtFeed.length, storage);
  }
  const metricsRecord = options?.metricsRecord?.playerId
    ? options.metricsRecord
    : loadProfileMetricsRecord(profile?.playerId, storage);
  const relationshipsRecord = options?.relationshipsRecord?.playerId
    ? options.relationshipsRecord
    : loadProfileRelationshipsRecord(profile?.playerId, storage);
  const model = buildMePageViewModel(profile, {
    thoughtFeed,
    metricsRecord,
    relationshipsRecord,
    thoughtComposerFlash: options?.thoughtComposerFlash || "",
    friendCodeFlash: options?.friendCodeFlash || "",
  });
  renderMePageView(doc, model, { ...options, galleryPlayerId: profile?.playerId || "" });
  return model;
}
