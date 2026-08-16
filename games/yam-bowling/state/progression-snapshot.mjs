// The platform API speaks in generic tracks; a track is a bowler in Yam.
// Keeping that translation in one seam makes online matches and circuit clears
// apply the same authoritative document to the same local cache.
export function applyProgressionDocument({ progressionCore, store, document }) {
  if (!document || !store?.applySnapshot) return false;
  return store.applySnapshot({
    version: progressionCore.SCHEMA_VERSION,
    player: { xp: document.player?.xp },
    bowlers: document.tracks || {},
    grants: document.grants || [],
    syncedAt: document.syncedAt || null,
  });
}
