const PHOTO_VISIBILITIES = new Set(["public", "friends", "private"]);

function createPhotoId() {
  return `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapRowToPhoto(row = {}) {
  if (!row?.id) return null;
  const visibility = String(row.visibility || "public");
  return {
    id: String(row.id),
    playerId: String(row.player_id || ""),
    assetId: String(row.asset_id || ""),
    imageUrl: String(row.image_url || ""),
    caption: String(row.caption || ""),
    visibility: PHOTO_VISIBILITIES.has(visibility) ? visibility : "public",
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  };
}

export async function savePlayerPhoto(db, { playerId, assetId, imageUrl, caption = "", visibility = "public" } = {}) {
  if (!db || !playerId || !assetId || !imageUrl) return null;
  const id = createPhotoId();
  const safeCaption = String(caption).slice(0, 500);
  const safeVisibility = PHOTO_VISIBILITIES.has(visibility) ? visibility : "public";

  const result = await db.query(`
    insert into player_photos (id, player_id, asset_id, image_url, caption, visibility)
    values ($1, $2, $3, $4, $5, $6)
    returning id, player_id, asset_id, image_url, caption, visibility, created_at
  `, [id, playerId, assetId, imageUrl, safeCaption, safeVisibility]);

  return mapRowToPhoto(result?.rows?.[0] || null);
}

export async function listPlayerPhotos(db, playerId, { limit = 40, visibility = null } = {}) {
  if (!db || !playerId) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 40, 100));

  let result;
  if (visibility && PHOTO_VISIBILITIES.has(visibility)) {
    result = await db.query(`
      select id, player_id, asset_id, image_url, caption, visibility, created_at
      from player_photos
      where player_id = $1 and visibility = $2
      order by created_at desc
      limit $3
    `, [playerId, visibility, safeLimit]);
  } else {
    result = await db.query(`
      select id, player_id, asset_id, image_url, caption, visibility, created_at
      from player_photos
      where player_id = $1
      order by created_at desc
      limit $2
    `, [playerId, safeLimit]);
  }

  return (result?.rows || []).map(mapRowToPhoto).filter(Boolean);
}

export async function deletePlayerPhoto(db, photoId, playerId) {
  if (!db || !photoId || !playerId) return false;

  const result = await db.query(`
    delete from player_photos
    where id = $1 and player_id = $2
    returning id
  `, [photoId, playerId]);

  return (result?.rowCount || 0) > 0;
}
