// The platform API speaks in generic tracks; a track is a bowler in Yam.
// Keeping that translation in one seam makes online matches and circuit clears
// apply the same authoritative document to the same local cache.
export function applyProgressionDocument({ progressionCore, store, document, now = () => new Date().toISOString() }) {
  if (!document || !store?.applySnapshot) return false;
  // A new account has a real level-1 document but no XP row yet, so the server
  // has no update timestamp to return. The successful fetch itself proves that
  // zero-XP snapshot is current; reserve a null timestamp for no snapshot at all.
  const syncedAt = typeof document.syncedAt === "string" && document.syncedAt.trim()
    ? document.syncedAt
    : now();
  return store.applySnapshot({
    version: progressionCore.SCHEMA_VERSION,
    player: { xp: document.player?.xp },
    bowlers: document.tracks || {},
    grants: document.grants || [],
    syncedAt,
  });
}
