import { createAuthApiClient } from "../platform/api/auth-api.mjs";
import type { PlatformApiClient } from "../platform/api/platform-api.mjs";
import type { PhotoViewer } from "./viewer.mjs";
import type { PhotoSocialState } from "./viewer-state.mjs";

interface ViewerSession {
  playerId: string;
  displayName: string;
}

interface PageGalleryViewerActionsOptions {
  apiClient: PlatformApiClient;
  fullViewer: PhotoViewer;
  createSessionClient?: typeof createAuthApiClient;
}

function buildViewerSocialState(photoRecord: any, comments: unknown): PhotoSocialState {
  return {
    reactionTotals: photoRecord?.reactionTotals || {},
    viewerReaction: photoRecord?.viewerReaction || "",
    comments: Array.isArray(comments) ? comments : [],
  };
}

export function createPageGalleryViewerActions({
  apiClient,
  fullViewer,
  createSessionClient = createAuthApiClient,
}: PageGalleryViewerActionsOptions) {
  let sessionCache: ViewerSession | null = null;

  async function loadSessionOnce(): Promise<ViewerSession> {
    if (sessionCache !== null) return sessionCache;
    sessionCache = { playerId: "", displayName: "" };
    try {
      const session = await createSessionClient().getSession().catch(() => null);
      if (session?.playerId) {
        let displayName = session.displayName || session.profileName || "";
        if (!displayName && apiClient) {
          const profile = await apiClient.loadPlayerProfile(session.playerId).catch(() => null);
          displayName = profile?.profileName || "";
        }
        sessionCache = { playerId: session.playerId, displayName };
      }
    } catch {}
    return sessionCache;
  }

  async function loadSocialState(ownerId: string, photoId: string) {
    const [comments, photoRecord] = await Promise.all([
      apiClient.listPhotoComments(photoId).catch(() => []),
      ownerId ? apiClient.getPlayerPhoto(ownerId, photoId).catch(() => null) : Promise.resolve(null),
    ]);
    fullViewer.setSocialState(photoId, buildViewerSocialState(photoRecord, comments));
  }

  async function handleReact(photoId: string, reactionId: string) {
    const session = await loadSessionOnce();
    if (!session.playerId) return;
    const photo = await apiClient.reactToPhoto(photoId, session.playerId, reactionId).catch(() => null);
    if (!photo) return;
    const comments = await apiClient.listPhotoComments(photoId).catch(() => []);
    fullViewer.setSocialState(photoId, buildViewerSocialState(photo, comments));
  }

  async function handleComment(photoId: string, text: string) {
    const session = await loadSessionOnce();
    if (!session.playerId || !text?.trim()) return;
    const commentRecord = await apiClient
      .commentOnPhoto(photoId, session.playerId, session.displayName, text)
      .catch(() => null);
    if (!commentRecord) return;
    const comments = await apiClient.listPhotoComments(photoId).catch(() => []);
    fullViewer.setSocialState(photoId, {
      reactionTotals: commentRecord.photo?.reactionTotals || {},
      viewerReaction: "",
      comments: Array.isArray(comments) ? comments : [],
    });
  }

  return {
    loadSessionOnce,
    loadSocialState,
    handleReact,
    handleComment,
  };
}

export type PageGalleryViewerActions = ReturnType<typeof createPageGalleryViewerActions>;
