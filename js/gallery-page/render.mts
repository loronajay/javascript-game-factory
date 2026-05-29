import { createProfileSocialViewRenderer, escapeHtml } from "../profile-social/social-view.mjs";
import type { GalleryUploadState } from "../profile-social/media-composer-state.mjs";

void escapeHtml;

const socialView = createProfileSocialViewRenderer({
  pageKey: "gallery",
  panelPrefix: "gallery",
  ownerGalleryEmptyText: "No photos yet. Upload one below.",
  viewerGalleryEmptyText: "No photos yet.",
});

interface RenderGalleryPageViewOptions {
  profile?: any;
  photos?: any[];
  isOwner?: boolean;
  uploadState?: Partial<GalleryUploadState>;
}

export function renderGalleryPageView(doc: Document, { profile, photos = [], isOwner, uploadState = {} }: RenderGalleryPageViewOptions = {}): void {
  if (!doc?.getElementById) return;

  const titleEl = doc.getElementById("galleryPageTitle");
  const subtitleEl = doc.getElementById("galleryPageSubtitle");
  const displayName = profile?.profileName || "Player";
  if (titleEl) titleEl.textContent = isOwner ? "Your Photo Gallery" : `${displayName}'s Photos`;
  if (subtitleEl) subtitleEl.textContent = isOwner ? "Manage your photos" : `Photos shared by ${displayName}`;

  socialView.renderGalleryPanel(doc.getElementById("galleryPanel"), "Photos", photos, {
    isOwner,
    uploadState,
  });
}
