export function sanitizeGalleryPlayerId(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function loadGalleryPageData(playerId, { apiClient, authClient } = {}) {
  const authSession = await authClient?.getSession?.().catch(() => null);
  const authSessionPlayerId = authSession?.playerId || "";
  const isOwner = !!authSessionPlayerId && playerId === authSessionPlayerId;

  const [photos, profile] = await Promise.all([
    apiClient?.listPlayerPhotos?.(playerId, isOwner ? {} : { visibility: "public" }).catch(() => []),
    apiClient?.loadPlayerProfile?.(playerId).catch(() => null),
  ]);

  return {
    playerId,
    isOwner,
    authSessionPlayerId,
    photos: Array.isArray(photos) ? photos : [],
    profile: profile || null,
  };
}
