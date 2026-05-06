export function createPhotoViewerState() {
  let photos = [];
  let currentIndex = -1;
  let isOwner = false;
  let galleryLinkHref = "";
  let viewerPlayerId = "";
  let viewerAuthorDisplayName = "";
  let reactionPickerOpen = false;
  const socialStateMap = new Map();

  function closeIfIndexInvalid() {
    if (currentIndex < 0 || currentIndex >= photos.length) {
      currentIndex = -1;
      reactionPickerOpen = false;
    }
  }

  return {
    setPhotos(newPhotos, options = {}) {
      photos = Array.isArray(newPhotos) ? newPhotos : [];
      isOwner = !!options.isOwner;
      galleryLinkHref = options.galleryLinkHref || "";
      viewerPlayerId = options.viewerPlayerId || "";
      viewerAuthorDisplayName = options.viewerAuthorDisplayName || "";
      closeIfIndexInvalid();
    },

    setSocialState(photoId, state) {
      if (!photoId) return;
      socialStateMap.set(photoId, state);
    },

    open(photoId) {
      const index = photos.findIndex((photo) => photo?.id === photoId);
      if (index < 0) return false;
      currentIndex = index;
      return true;
    },

    close() {
      currentIndex = -1;
      reactionPickerOpen = false;
    },

    goPrev() {
      if (currentIndex <= 0) return false;
      currentIndex -= 1;
      return true;
    },

    goNext() {
      if (currentIndex < 0 || currentIndex >= photos.length - 1) return false;
      currentIndex += 1;
      return true;
    },

    canGoPrev() {
      return currentIndex > 0;
    },

    canGoNext() {
      return currentIndex >= 0 && currentIndex < photos.length - 1;
    },

    setReactionPickerOpen(open) {
      reactionPickerOpen = !!open;
    },

    toggleReactionPicker() {
      reactionPickerOpen = !reactionPickerOpen;
      return reactionPickerOpen;
    },

    getCurrentPhoto() {
      return photos[currentIndex] || null;
    },

    getCurrentSocialState() {
      const currentPhoto = photos[currentIndex];
      if (!currentPhoto?.id) return null;
      return socialStateMap.get(currentPhoto.id) || null;
    },

    getViewState() {
      return {
        photos,
        currentIndex,
        isOwner,
        galleryLinkHref,
        viewerPlayerId,
        viewerAuthorDisplayName,
        reactionPickerOpen,
      };
    },
  };
}
