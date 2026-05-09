import { hydrateArcadeProfileFromApi } from "../arcade-profile.mjs";
import { loadFactoryProfile, saveFactoryProfile } from "../platform/identity/factory-profile.mjs";
import { loadProfileMetricsRecord } from "../platform/metrics/metrics.mjs";
import {
  loadProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
} from "../platform/relationships/relationships.mjs";
import { enrichProfileFriendPreviewsFromApi } from "../platform/profile/friend-preview-enrichment.mjs";
import {
  loadThoughtFeed,
  syncThoughtFeedFromApi,
} from "../platform/thoughts/thoughts.mjs";

export function createMePageDataController(options = {}) {
  const storage = options.storage;
  const apiClient = options.apiClient;
  const loadFactoryProfileImpl = options.loadFactoryProfileImpl || loadFactoryProfile;
  const saveFactoryProfileImpl = options.saveFactoryProfileImpl || saveFactoryProfile;
  const loadProfileMetricsRecordImpl = options.loadProfileMetricsRecordImpl || loadProfileMetricsRecord;
  const loadProfileRelationshipsRecordImpl = options.loadProfileRelationshipsRecordImpl || loadProfileRelationshipsRecord;
  const normalizeProfileRelationshipsRecordImpl = options.normalizeProfileRelationshipsRecordImpl || normalizeProfileRelationshipsRecord;
  const enrichProfileFriendPreviewsFromApiImpl = options.enrichProfileFriendPreviewsFromApiImpl || enrichProfileFriendPreviewsFromApi;
  const loadThoughtFeedImpl = options.loadThoughtFeedImpl || loadThoughtFeed;
  const syncThoughtFeedFromApiImpl = options.syncThoughtFeedFromApiImpl || syncThoughtFeedFromApi;
  const hydrateArcadeProfileFromApiImpl = options.hydrateArcadeProfileFromApiImpl || hydrateArcadeProfileFromApi;

  let cachedHydration = null;
  let galleryPhotos = [];

  return {
    getGalleryPhotos() {
      return galleryPhotos;
    },

    clearCachedHydration() {
      cachedHydration = null;
    },

    async loadGallery() {
      const currentProfile = loadFactoryProfileImpl(storage);
      if (!currentProfile?.playerId || !apiClient?.listPlayerPhotos) {
        galleryPhotos = [];
        return galleryPhotos;
      }

      const photos = await apiClient.listPlayerPhotos(currentProfile.playerId).catch(() => []);
      galleryPhotos = Array.isArray(photos) ? photos : [];
      return galleryPhotos;
    },

    async loadRenderState({ shouldHydrate = false } = {}) {
      const currentProfile = loadFactoryProfileImpl(storage);
      const thoughtFeed = shouldHydrate
        ? await syncThoughtFeedFromApiImpl(storage, apiClient, currentProfile.playerId)
        : loadThoughtFeedImpl(storage);

      if (!cachedHydration) {
        const fetched = await hydrateArcadeProfileFromApiImpl(storage, apiClient);
        if (!fetched?.error && fetched?.profile) {
          cachedHydration = fetched;
        }
      }

      const hydrated = cachedHydration ?? {
        profile: currentProfile,
        metricsRecord: loadProfileMetricsRecordImpl(currentProfile.playerId, storage),
        relationshipsRecord: loadProfileRelationshipsRecordImpl(currentProfile.playerId, storage),
      };

      const normalizedRelationships = normalizeProfileRelationshipsRecordImpl(
        hydrated.relationshipsRecord?.playerId
          ? hydrated.relationshipsRecord
          : { playerId: currentProfile.playerId },
      );

      const enrichedProfile = await enrichProfileFriendPreviewsFromApiImpl(
        hydrated.profile,
        normalizedRelationships,
        apiClient,
      );

      if (enrichedProfile !== hydrated.profile) {
        saveFactoryProfileImpl(enrichedProfile, storage);
        if (cachedHydration) {
          cachedHydration = { ...cachedHydration, profile: enrichedProfile };
        }
      }

      return {
        profile: enrichedProfile,
        metricsRecord: hydrated.metricsRecord,
        relationshipsRecord: hydrated.relationshipsRecord,
        thoughtFeed,
        galleryPhotos,
      };
    },
  };
}
