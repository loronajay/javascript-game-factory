import { syncThoughtPostCountWithApi } from "../platform/metrics/metrics.mjs";
import {
  buildPlayerThoughtFeed,
  loadThoughtFeed,
  publishThoughtPostWithApi,
} from "../platform/thoughts/thoughts.mjs";

export function createPlayerThoughtComposerActions({
  doc = globalThis.document,
  storage,
  apiClient,
  mediaComposer,
  loadCurrentProfile,
  getCurrentPageData,
  loadGallery,
  rerender,
  publishThoughtPostWithApiImpl = publishThoughtPostWithApi,
  loadThoughtFeedImpl = loadThoughtFeed,
  buildPlayerThoughtFeedImpl = buildPlayerThoughtFeed,
  syncThoughtPostCountWithApiImpl = syncThoughtPostCountWithApi,
} = {}) {
  async function uploadPendingThoughtPhoto(currentProfile, subject = "", text = "") {
    const pendingThoughtPhoto = mediaComposer.getPendingThoughtPhoto();
    if (!pendingThoughtPhoto || !currentProfile?.playerId || !apiClient?.uploadPhoto) {
      return { imageUrl: "", thought: null, visibility: "public" };
    }

    const file = pendingThoughtPhoto;
    const photoState = { ...mediaComposer.getThoughtPhotoState() };
    const uploadResult = await apiClient.uploadPhoto(file).catch(() => null);
    mediaComposer.closeThoughtPhotoComposer();

    if (!uploadResult?.url) {
      return { imageUrl: "", thought: null, visibility: photoState.visibility || "public" };
    }

    if (photoState.saveToGallery !== false && apiClient?.savePlayerPhoto && uploadResult.assetId) {
      const savedPhotoRecord = await apiClient.savePlayerPhoto(currentProfile.playerId, {
        assetId: uploadResult.assetId,
        imageUrl: uploadResult.url,
        caption: photoState.caption || text,
        visibility: photoState.visibility || "public",
        postToFeed: true,
        subject,
        thoughtText: text,
      }).catch(() => null);

      if (savedPhotoRecord?.photo) {
        await Promise.resolve(loadGallery?.(currentProfile.playerId));
      }

      return {
        imageUrl: uploadResult.url,
        thought: savedPhotoRecord?.thought || null,
        visibility: photoState.visibility || "public",
      };
    }

    return {
      imageUrl: uploadResult.url,
      thought: null,
      visibility: photoState.visibility || "public",
    };
  }

  async function handleSubmit(form) {
    if (!form || typeof form !== "object" || form.id !== "playerThoughtComposer") {
      return false;
    }

    const currentProfile = loadCurrentProfile?.();
    const subjectInput = doc.getElementById("playerThoughtSubject");
    const bodyInput = doc.getElementById("playerThoughtBody");
    const thoughtPhotoState = mediaComposer.getThoughtPhotoState();
    const subject = subjectInput?.value ?? thoughtPhotoState.subject ?? "";
    const text = bodyInput?.value ?? thoughtPhotoState.text ?? "";
    const photoResult = await uploadPendingThoughtPhoto(currentProfile, subject, text);

    if (photoResult.thought) {
      const targetId = getCurrentPageData?.()?.profile?.playerId || currentProfile.playerId;
      await Promise.resolve(loadGallery?.(targetId));
      const updatedThoughtCount = buildPlayerThoughtFeedImpl(
        await loadThoughtFeedImpl(storage),
        currentProfile.playerId,
      ).length;
      syncThoughtPostCountWithApiImpl(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
      mediaComposer.closeThoughtPhotoComposer();
      mediaComposer.clearThoughtDraft();
      void rerender?.("Thought posted.");
      return true;
    }

    const saved = await publishThoughtPostWithApiImpl({
      authorPlayerId: currentProfile.playerId,
      authorDisplayName: currentProfile.profileName || "UNNAMED PILOT",
      subject,
      text,
      visibility: photoResult.visibility || "public",
      imageUrl: photoResult.imageUrl,
    }, storage, { apiClient });

    if (!saved) {
      void rerender?.("Write a thought before posting.");
      return true;
    }

    const updatedThoughtCount = buildPlayerThoughtFeedImpl(
      loadThoughtFeedImpl(storage),
      currentProfile.playerId,
    ).length;
    syncThoughtPostCountWithApiImpl(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
    mediaComposer.closeThoughtPhotoComposer();
    mediaComposer.clearThoughtDraft();
    void rerender?.("Thought posted.");
    return true;
  }

  return {
    handleSubmit,
  };
}
