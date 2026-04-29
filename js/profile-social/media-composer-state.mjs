function createInitialThoughtPhotoState() {
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

function createInitialGalleryUploadState(statusMessage = "") {
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
} = {}) {
  let pendingThoughtPhoto = null;
  let pendingGalleryPhoto = null;
  let thoughtPhotoState = createInitialThoughtPhotoState();
  let galleryUploadState = createInitialGalleryUploadState();

  function revokePreview(url) {
    if (url?.startsWith?.("blob:") && typeof urlApi?.revokeObjectURL === "function") {
      urlApi.revokeObjectURL(url);
    }
  }

  function getThoughtPhotoNameEl() {
    return thoughtPhotoNameId ? doc?.getElementById?.(thoughtPhotoNameId) : null;
  }

  function getThoughtPhotoInputEl() {
    return thoughtPhotoInputId ? doc?.getElementById?.(thoughtPhotoInputId) : null;
  }

  return {
    getPendingThoughtPhoto() {
      return pendingThoughtPhoto;
    },

    getPendingGalleryPhoto() {
      return pendingGalleryPhoto;
    },

    getThoughtPhotoState() {
      return thoughtPhotoState;
    },

    getGalleryUploadState() {
      return galleryUploadState;
    },

    setThoughtPhotoField(field, value) {
      thoughtPhotoState = {
        ...thoughtPhotoState,
        [field]: value,
      };
      return thoughtPhotoState;
    },

    setGalleryUploadField(field, value) {
      galleryUploadState = {
        ...galleryUploadState,
        [field]: value,
      };
      return galleryUploadState;
    },

    clearThoughtDraft() {
      thoughtPhotoState = {
        ...thoughtPhotoState,
        subject: "",
        text: "",
      };
      return thoughtPhotoState;
    },

    closeGalleryComposer(statusMessage = "") {
      revokePreview(galleryUploadState.previewUrl);
      pendingGalleryPhoto = null;
      galleryUploadState = createInitialGalleryUploadState(statusMessage);
      return galleryUploadState;
    },

    closeThoughtPhotoComposer() {
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

    applyThoughtPhotoFile(file) {
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

    applyGalleryPhotoFile(file) {
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
