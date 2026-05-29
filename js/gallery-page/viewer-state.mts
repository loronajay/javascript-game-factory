export interface GalleryPhoto {
  id?: string;
  imageUrl?: string;
  caption?: string;
  createdAt?: string;
  created_at?: string;
  [key: string]: unknown;
}

export interface ViewerComment {
  authorDisplayName?: string;
  text?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export interface PhotoSocialState {
  reactionTotals?: Record<string, number>;
  viewerReaction?: string;
  comments?: ViewerComment[];
}

export interface SetPhotosOptions {
  isOwner?: boolean;
  galleryLinkHref?: string;
  viewerPlayerId?: string;
  viewerAuthorDisplayName?: string;
  onDelete?: ((photoId: string) => void) | null;
  onReact?: ((photoId: string, reactionId: string) => void) | null;
  onComment?: ((photoId: string, text: string) => void) | null;
}

export interface PhotoViewerViewState {
  photos: GalleryPhoto[];
  currentIndex: number;
  isOwner: boolean;
  galleryLinkHref: string;
  viewerPlayerId: string;
  viewerAuthorDisplayName: string;
  reactionPickerOpen: boolean;
}

export function createPhotoViewerState() {
  let photos: GalleryPhoto[] = [];
  let currentIndex = -1;
  let isOwner = false;
  let galleryLinkHref = "";
  let viewerPlayerId = "";
  let viewerAuthorDisplayName = "";
  let reactionPickerOpen = false;
  const socialStateMap = new Map<string, PhotoSocialState>();

  function closeIfIndexInvalid() {
    if (currentIndex < 0 || currentIndex >= photos.length) {
      currentIndex = -1;
      reactionPickerOpen = false;
    }
  }

  return {
    setPhotos(newPhotos: GalleryPhoto[], options: SetPhotosOptions = {}) {
      photos = Array.isArray(newPhotos) ? newPhotos : [];
      isOwner = !!options.isOwner;
      galleryLinkHref = options.galleryLinkHref || "";
      viewerPlayerId = options.viewerPlayerId || "";
      viewerAuthorDisplayName = options.viewerAuthorDisplayName || "";
      closeIfIndexInvalid();
    },

    setSocialState(photoId: string, state: PhotoSocialState) {
      if (!photoId) return;
      socialStateMap.set(photoId, state);
    },

    open(photoId: string): boolean {
      const index = photos.findIndex((photo) => photo?.id === photoId);
      if (index < 0) return false;
      currentIndex = index;
      return true;
    },

    close() {
      currentIndex = -1;
      reactionPickerOpen = false;
    },

    goPrev(): boolean {
      if (currentIndex <= 0) return false;
      currentIndex -= 1;
      return true;
    },

    goNext(): boolean {
      if (currentIndex < 0 || currentIndex >= photos.length - 1) return false;
      currentIndex += 1;
      return true;
    },

    canGoPrev(): boolean {
      return currentIndex > 0;
    },

    canGoNext(): boolean {
      return currentIndex >= 0 && currentIndex < photos.length - 1;
    },

    setReactionPickerOpen(open: unknown) {
      reactionPickerOpen = !!open;
    },

    toggleReactionPicker(): boolean {
      reactionPickerOpen = !reactionPickerOpen;
      return reactionPickerOpen;
    },

    getCurrentPhoto(): GalleryPhoto | null {
      return photos[currentIndex] || null;
    },

    getCurrentSocialState(): PhotoSocialState | null {
      const currentPhoto = photos[currentIndex];
      if (!currentPhoto?.id) return null;
      return socialStateMap.get(currentPhoto.id) || null;
    },

    getViewState(): PhotoViewerViewState {
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
