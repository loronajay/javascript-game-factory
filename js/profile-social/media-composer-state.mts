export interface ThoughtPhotoState {
  subject: string;
  text: string;
  previewUrl: string;
  fileName: string;
  caption: string;
  visibility: string;
  saveToGallery: boolean;
}

export interface GalleryUploadState {
  previewUrl: string;
  fileName: string;
  caption: string;
  visibility: string;
  postToFeed: boolean;
  statusMessage: string;
  isUploading: boolean;
}

export interface MediaComposerStateOptions {
  doc?: Document;
  thoughtPhotoNameId?: string;
  thoughtPhotoInputId?: string;
  urlApi?: typeof URL;
}

function createInitialThoughtPhotoState(): ThoughtPhotoState {
  return {
    subject: "",
    text: "",
    previewUrl: "",
    fileName: "",
    caption: "",
    visibility: "public",
    saveToGallery: true,
  };
}

function createInitialGalleryUploadState(statusMessage = ""): GalleryUploadState {
  return {
    previewUrl: "",
    fileName: "",
    caption: "",
    visibility: "public",
    postToFeed: false,
    statusMessage,
    isUploading: false,
  };
}

export function createMediaComposerState({
  doc = globalThis.document,
  thoughtPhotoNameId = "",
  thoughtPhotoInputId = "",
  urlApi = globalThis.URL,
}: MediaComposerStateOptions = {}) {
  let pendingThoughtPhoto: File | null = null;
  let pendingGalleryPhoto: File | null = null;
  let thoughtPhotoState = createInitialThoughtPhotoState();
  let galleryUploadState = createInitialGalleryUploadState();

  function revokePreview(url: string | undefined): void {
    if (url?.startsWith?.("blob:") && typeof urlApi?.revokeObjectURL === "function") {
      urlApi.revokeObjectURL(url);
    }
  }

  function getThoughtPhotoNameEl(): HTMLElement | null {
    return thoughtPhotoNameId ? (doc?.getElementById?.(thoughtPhotoNameId) ?? null) : null;
  }

  function getThoughtPhotoInputEl(): HTMLInputElement | null {
    return thoughtPhotoInputId ? (doc?.getElementById?.(thoughtPhotoInputId) as HTMLInputElement | null) : null;
  }

  return {
    getPendingThoughtPhoto(): File | null {
      return pendingThoughtPhoto;
    },

    getPendingGalleryPhoto(): File | null {
      return pendingGalleryPhoto;
    },

    getThoughtPhotoState(): ThoughtPhotoState {
      return thoughtPhotoState;
    },

    getGalleryUploadState(): GalleryUploadState {
      return galleryUploadState;
    },

    setThoughtPhotoField(field: string, value: unknown): ThoughtPhotoState {
      thoughtPhotoState = {
        ...thoughtPhotoState,
        [field]: value,
      } as ThoughtPhotoState;
      return thoughtPhotoState;
    },

    setGalleryUploadField(field: string, value: unknown): GalleryUploadState {
      galleryUploadState = {
        ...galleryUploadState,
        [field]: value,
      } as GalleryUploadState;
      return galleryUploadState;
    },

    clearThoughtDraft(): ThoughtPhotoState {
      thoughtPhotoState = {
        ...thoughtPhotoState,
        subject: "",
        text: "",
      };
      return thoughtPhotoState;
    },

    closeGalleryComposer(statusMessage = ""): GalleryUploadState {
      revokePreview(galleryUploadState.previewUrl);
      pendingGalleryPhoto = null;
      galleryUploadState = createInitialGalleryUploadState(statusMessage);
      return galleryUploadState;
    },

    closeThoughtPhotoComposer(): ThoughtPhotoState {
      const preservedSubject = thoughtPhotoState.subject || "";
      const preservedText = thoughtPhotoState.text || "";
      revokePreview(thoughtPhotoState.previewUrl);
      pendingThoughtPhoto = null;
      thoughtPhotoState = {
        ...createInitialThoughtPhotoState(),
        subject: preservedSubject,
        text: preservedText,
      };

      const nameEl = getThoughtPhotoNameEl();
      if (nameEl) nameEl.textContent = "";
      const inputEl = getThoughtPhotoInputEl();
      if (inputEl) inputEl.value = "";

      return thoughtPhotoState;
    },

    applyThoughtPhotoFile(file: File | null): ThoughtPhotoState {
      if (!file) {
        return this.closeThoughtPhotoComposer();
      }

      revokePreview(thoughtPhotoState.previewUrl);
      pendingThoughtPhoto = file;
      thoughtPhotoState = {
        ...createInitialThoughtPhotoState(),
        subject: thoughtPhotoState.subject || "",
        text: thoughtPhotoState.text || "",
        previewUrl: typeof urlApi?.createObjectURL === "function" ? urlApi.createObjectURL(file) : "",
        fileName: file.name || "Selected photo",
      };

      const nameEl = getThoughtPhotoNameEl();
      if (nameEl) nameEl.textContent = file.name || "";

      return thoughtPhotoState;
    },

    applyGalleryPhotoFile(file: File | null): GalleryUploadState {
      if (!file) return galleryUploadState;

      revokePreview(galleryUploadState.previewUrl);
      pendingGalleryPhoto = file;
      galleryUploadState = {
        ...createInitialGalleryUploadState(),
        previewUrl: typeof urlApi?.createObjectURL === "function" ? urlApi.createObjectURL(file) : "",
        fileName: file.name || "Selected photo",
      };

      return galleryUploadState;
    },
  };
}
