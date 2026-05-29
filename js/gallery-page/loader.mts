import type { PlatformApiClient } from "../platform/api/platform-api.mjs";
import type { createAuthApiClient } from "../platform/api/auth-api.mjs";

type AuthApiClient = ReturnType<typeof createAuthApiClient>;

export interface GalleryPageLoadOptions {
  apiClient?: PlatformApiClient;
  authClient?: AuthApiClient;
}

export interface GalleryPageData {
  playerId: string;
  isOwner: boolean;
  authSessionPlayerId: string;
  authSessionDisplayName: string;
  photos: any[];
  profile: any;
}

export function sanitizeGalleryPlayerId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function loadGalleryPageData(playerId: string, { apiClient, authClient }: GalleryPageLoadOptions = {}): Promise<GalleryPageData> {
  const authSession = await authClient?.getSession?.()?.catch(() => null);
  const authSessionPlayerId = authSession?.playerId || "";
  const isOwner = !!authSessionPlayerId && playerId === authSessionPlayerId;

  const [photos, profile, viewerProfile] = await Promise.all([
    apiClient?.listPlayerPhotos?.(playerId, isOwner ? {} : { visibility: "public" })?.catch(() => []),
    apiClient?.loadPlayerProfile?.(playerId)?.catch(() => null),
    !isOwner && authSessionPlayerId
      ? apiClient?.loadPlayerProfile?.(authSessionPlayerId)?.catch(() => null)
      : Promise.resolve(null),
  ]);

  const authSessionDisplayName = isOwner
    ? (profile?.profileName || "")
    : (viewerProfile?.profileName || "");

  return {
    playerId,
    isOwner,
    authSessionPlayerId,
    authSessionDisplayName,
    photos: Array.isArray(photos) ? photos : [],
    profile: profile || null,
  };
}
