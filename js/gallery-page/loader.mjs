export function sanitizeGalleryPlayerId(value) {
  return typeof value === "string" ? value.trim() : "";
}

export async function loadGalleryPageData(playerId, { apiClient, authClient } = {}) {
  const authSession = await authClient?.getSession?.().catch(() => null);
  const authSessionPlayerId = authSession?.playerId || "";
  const isOwner = !!authSessionPlayerId && playerId === authSessionPlayerId;

  const [photos, profile, viewerProfile] = await Promise.all([
    apiClient?.listPlayerPhotos?.(playerId, isOwner ? {} : { visibility: "public" }).catch(() => []),
    apiClient?.loadPlayerProfile?.(playerId).catch(() => null),
    !isOwner && authSessionPlayerId
      ? apiClient?.loadPlayerProfile?.(authSessionPlayerId).catch(() => null)
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
