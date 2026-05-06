export async function uploadPendingThoughtPhoto({
  currentProfile,
  mediaComposer,
  apiClient,
  loadGallery,
  subject = "",
  text = "",
} = {}) {
  const pendingThoughtPhoto = mediaComposer?.getPendingThoughtPhoto?.();
  if (!pendingThoughtPhoto || !currentProfile?.playerId || !apiClient?.uploadPhoto) {
    return { imageUrl: "", thought: null, visibility: "public" };
  }

  const file = pendingThoughtPhoto;
  const photoState = { ...(mediaComposer?.getThoughtPhotoState?.() || {}) };
  const uploadResult = await apiClient.uploadPhoto(file).catch(() => null);
  mediaComposer?.closeThoughtPhotoComposer?.();

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
      await loadGallery?.();
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

export async function submitGalleryUpload({
  currentProfile,
  mediaComposer,
  apiClient,
  loadGallery,
  onUploadStart,
} = {}) {
  const galleryUploadState = mediaComposer?.getGalleryUploadState?.();
  if (galleryUploadState?.isUploading) {
    return { ok: false, skipped: true, reason: "already-uploading" };
  }

  if (
    !currentProfile?.playerId
    || !apiClient?.uploadPhoto
    || !apiClient?.savePlayerPhoto
    || !galleryUploadState?.previewUrl
  ) {
    mediaComposer?.setGalleryUploadField?.("statusMessage", "Choose a photo first.");
    return { ok: false, reason: "missing-photo", statusMessage: "Choose a photo first." };
  }

  const file = mediaComposer?.getPendingGalleryPhoto?.();
  if (!file) {
    mediaComposer?.setGalleryUploadField?.("statusMessage", "Choose a photo first.");
    return { ok: false, reason: "missing-file", statusMessage: "Choose a photo first." };
  }

  mediaComposer?.setGalleryUploadField?.("isUploading", true);
  mediaComposer?.setGalleryUploadField?.("statusMessage", "Uploading...");
  await onUploadStart?.();

  const uploadResult = await apiClient.uploadPhoto(file).catch(() => null);
  if (!uploadResult?.assetId || !uploadResult?.url) {
    mediaComposer?.setGalleryUploadField?.("isUploading", false);
    mediaComposer?.setGalleryUploadField?.("statusMessage", "Upload failed. Try again.");
    return { ok: false, reason: "upload-failed", statusMessage: "Upload failed. Try again." };
  }

  const savedGalleryState = mediaComposer?.getGalleryUploadState?.() || {};
  const savedPhotoRecord = await apiClient.savePlayerPhoto(currentProfile.playerId, {
    assetId: uploadResult.assetId,
    imageUrl: uploadResult.url,
    caption: savedGalleryState.caption,
    visibility: savedGalleryState.visibility,
    postToFeed: savedGalleryState.postToFeed,
  }).catch(() => null);

  if (!savedPhotoRecord?.photo) {
    mediaComposer?.setGalleryUploadField?.("isUploading", false);
    mediaComposer?.setGalleryUploadField?.("statusMessage", "Could not save photo. Try again.");
    return { ok: false, reason: "save-failed", statusMessage: "Could not save photo. Try again." };
  }

  const postedToFeed = !!savedPhotoRecord.thought;
  mediaComposer?.closeGalleryComposer?.(postedToFeed ? "Photo uploaded and posted." : "Photo uploaded.");
  await loadGallery?.();

  return {
    ok: true,
    postedToFeed,
    photo: savedPhotoRecord.photo,
    thought: savedPhotoRecord.thought || null,
  };
}
