import { createProfileSocialViewRenderer, escapeHtml } from "../profile-social/social-view.mjs";

const socialView = createProfileSocialViewRenderer({
  pageKey: "gallery",
  panelPrefix: "gallery",
  ownerGalleryEmptyText: "No photos yet. Upload one below.",
  viewerGalleryEmptyText: "No photos yet.",
});

export function renderGalleryPageView(doc, { profile, photos = [], isOwner, uploadState = {} } = {}) {
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
