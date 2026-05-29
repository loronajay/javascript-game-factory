import { syncThoughtPostCountWithApi } from "../platform/metrics/metrics.mjs";
import { buildPlayerThoughtFeed, loadThoughtFeed, syncThoughtFeedFromApi, } from "../platform/thoughts/thoughts.mjs";
export function createPlayerMediaActions({ authSessionPlayerId = "", storage, apiClient, mediaComposer, rerender, loadGallery, loadCurrentProfile, getCurrentPageData, syncThoughtFeedFromApiImpl = syncThoughtFeedFromApi, loadThoughtFeedImpl = loadThoughtFeed, buildPlayerThoughtFeedImpl = buildPlayerThoughtFeed, syncThoughtPostCountWithApiImpl = syncThoughtPostCountWithApi, }) {
    async function handleSubmit(form) {
        const formEl = form;
        if (!formEl || typeof formEl !== "object" || formEl.id !== "playerGalleryUploadForm") {
            return false;
        }
        const currentProfile = loadCurrentProfile?.();
        const galleryUploadState = mediaComposer.getGalleryUploadState();
        if (galleryUploadState?.isUploading) {
            return true;
        }
        if (!currentProfile?.playerId || currentProfile.playerId !== authSessionPlayerId || !apiClient?.uploadPhoto || !galleryUploadState.previewUrl) {
            mediaComposer.setGalleryUploadField("statusMessage", "Choose a photo first.");
            void rerender?.();
            return true;
        }
        const file = mediaComposer.getPendingGalleryPhoto();
        if (!file) {
            mediaComposer.setGalleryUploadField("statusMessage", "Choose a photo first.");
            void rerender?.();
            return true;
        }
        mediaComposer.setGalleryUploadField("isUploading", true);
        mediaComposer.setGalleryUploadField("statusMessage", "Uploading...");
        await Promise.resolve(rerender?.());
        const uploadResult = await apiClient.uploadPhoto(file).catch(() => null);
        if (!uploadResult?.assetId || !uploadResult?.url) {
            mediaComposer.setGalleryUploadField("isUploading", false);
            mediaComposer.setGalleryUploadField("statusMessage", "Upload failed. Try again.");
            void rerender?.();
            return true;
        }
        const savedGalleryState = mediaComposer.getGalleryUploadState();
        const savedPhotoRecord = await apiClient.savePlayerPhoto(currentProfile.playerId, {
            assetId: uploadResult.assetId,
            imageUrl: uploadResult.url,
            caption: savedGalleryState.caption,
            visibility: savedGalleryState.visibility,
            postToFeed: savedGalleryState.postToFeed,
        }).catch(() => null);
        if (!savedPhotoRecord?.photo) {
            mediaComposer.setGalleryUploadField("isUploading", false);
            mediaComposer.setGalleryUploadField("statusMessage", "Could not save photo. Try again.");
            void rerender?.();
            return true;
        }
        const postedToFeed = !!savedPhotoRecord.thought;
        mediaComposer.closeGalleryComposer(postedToFeed ? "Photo uploaded and posted." : "Photo uploaded.");
        await Promise.resolve(loadGallery?.(currentProfile.playerId));
        if (postedToFeed) {
            await syncThoughtFeedFromApiImpl(storage, apiClient, currentProfile.playerId);
            const updatedThoughtCount = buildPlayerThoughtFeedImpl(loadThoughtFeedImpl(storage), currentProfile.playerId).length;
            syncThoughtPostCountWithApiImpl(currentProfile.playerId, updatedThoughtCount, storage, apiClient);
        }
        void rerender?.();
        return true;
    }
    function handleClick(event) {
        const target = event.target;
        const clearThoughtPhotoButton = target?.closest("[data-clear-thought-photo]");
        if (clearThoughtPhotoButton) {
            mediaComposer.closeThoughtPhotoComposer();
            void rerender?.();
            return true;
        }
        const cancelGalleryButton = target?.closest("[data-cancel-gallery-upload]");
        if (cancelGalleryButton) {
            mediaComposer.closeGalleryComposer("");
            void rerender?.();
            return true;
        }
        const deletePhotoBtn = target?.closest("[data-delete-photo-id]");
        if (deletePhotoBtn) {
            const photoId = deletePhotoBtn.dataset.deletePhotoId;
            const targetId = getCurrentPageData?.()?.profile?.playerId || "";
            if (!photoId || !targetId || !apiClient?.deletePlayerPhoto) {
                return true;
            }
            apiClient.deletePlayerPhoto(targetId, photoId).then(async () => {
                await Promise.resolve(loadGallery?.(targetId));
                void rerender?.();
            }).catch(() => { });
            return true;
        }
        return false;
    }
    function handleChange(event) {
        const targetEl = event.target;
        if (targetEl?.id === "playerThoughtPhotoInput") {
            const file = targetEl.files?.[0] || null;
            if (!file) {
                mediaComposer.closeThoughtPhotoComposer();
                void rerender?.();
                return true;
            }
            mediaComposer.applyThoughtPhotoFile(file);
            void rerender?.();
            return true;
        }
        if (targetEl?.id === "playerThoughtVisibility") {
            mediaComposer.setThoughtPhotoField("visibility", targetEl.value || "public");
            return true;
        }
        if (targetEl?.id === "playerThoughtSaveToGallery") {
            mediaComposer.setThoughtPhotoField("saveToGallery", !!targetEl.checked);
            return true;
        }
        if (targetEl?.id === "playerGalleryFileInput") {
            const file = targetEl.files?.[0] || null;
            if (!file)
                return true;
            mediaComposer.applyGalleryPhotoFile(file);
            void rerender?.();
            return true;
        }
        if (targetEl?.id === "playerGalleryVisibility") {
            mediaComposer.setGalleryUploadField("visibility", targetEl.value || "public");
            return true;
        }
        if (targetEl?.id === "playerGalleryPostToFeed") {
            mediaComposer.setGalleryUploadField("postToFeed", !!targetEl.checked);
            return true;
        }
        return false;
    }
    function handleInput(event) {
        const targetEl = event.target;
        if (targetEl?.id === "playerThoughtPhotoCaption") {
            mediaComposer.setThoughtPhotoField("caption", targetEl.value || "");
            return true;
        }
        if (targetEl?.id === "playerThoughtSubject") {
            mediaComposer.setThoughtPhotoField("subject", targetEl.value || "");
            return true;
        }
        if (targetEl?.id === "playerThoughtBody") {
            mediaComposer.setThoughtPhotoField("text", targetEl.value || "");
            return true;
        }
        if (targetEl?.id === "playerGalleryCaption") {
            mediaComposer.setGalleryUploadField("caption", targetEl.value || "");
            return true;
        }
        return false;
    }
    return {
        handleSubmit,
        handleClick,
        handleChange,
        handleInput,
    };
}
