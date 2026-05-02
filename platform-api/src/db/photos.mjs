import { THOUGHT_REACTION_IDS } from "../normalize.mjs";

const PHOTO_VISIBILITIES = new Set(["public", "friends", "private"]);
const PHOTO_REACTION_ID_SET = new Set(THOUGHT_REACTION_IDS);

const PHOTO_COLUMNS = `id, player_id, asset_id, image_url, caption, visibility, reaction_totals, comment_count, created_at`;

function createPhotoId() {
  return `photo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createPhotoCommentId(photoId, viewerPlayerId) {
  return `pcomment-${viewerPlayerId.slice(0, 24)}-${photoId.slice(0, 24)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizePhotoId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function sanitizeViewerPlayerId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function sanitizePhotoReactionId(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase().slice(0, 24) : "";
  return PHOTO_REACTION_ID_SET.has(normalized) ? normalized : "";
}

function sanitizeCommentText(value) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, 500) : "";
}

function sanitizeViewerAuthorDisplayName(value) {
  return typeof value === "string" ? value.trim().slice(0, 60) : "";
}

function sanitizeReactionTotals(value) {
  if (!value || typeof value !== "object") return {};
  return Object.entries(value).reduce((totals, [key, count]) => {
    const normalizedKey = String(key).trim().toLowerCase().slice(0, 24);
    if (!PHOTO_REACTION_ID_SET.has(normalizedKey)) return totals;
    const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
    if (normalizedCount <= 0) return totals;
    totals[normalizedKey] = normalizedCount;
    return totals;
  }, {});
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
    reactionTotals: sanitizeReactionTotals(row.reaction_totals),
    commentCount: Math.max(0, Number(row.comment_count) || 0),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  };
}

function mapRowToPhotoComment(row = {}) {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    photoId: String(row.photo_id || ""),
    authorPlayerId: String(row.author_player_id || ""),
    authorDisplayName: String(row.author_display_name || ""),
    text: String(row.text || ""),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    editedAt: row.edited_at ? new Date(row.edited_at).toISOString() : "",
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
    returning ${PHOTO_COLUMNS}
  `, [id, playerId, assetId, imageUrl, safeCaption, safeVisibility]);

  return mapRowToPhoto(result?.rows?.[0] || null);
}

export async function listPlayerPhotos(db, playerId, { limit = 40, visibility = null } = {}) {
  if (!db || !playerId) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 40, 100));

  let result;
  if (visibility && PHOTO_VISIBILITIES.has(visibility)) {
    result = await db.query(`
      select ${PHOTO_COLUMNS}
      from player_photos
      where player_id = $1 and visibility = $2
      order by created_at desc
      limit $3
    `, [playerId, visibility, safeLimit]);
  } else {
    result = await db.query(`
      select ${PHOTO_COLUMNS}
      from player_photos
      where player_id = $1
      order by created_at desc
      limit $2
    `, [playerId, safeLimit]);
  }

  return (result?.rows || []).map(mapRowToPhoto).filter(Boolean);
}

export async function getPlayerPhoto(db, photoId, { viewerPlayerId = "" } = {}) {
  if (!db || !photoId) return null;
  const safePhotoId = sanitizePhotoId(photoId);
  if (!safePhotoId) return null;

  const result = await db.query(`
    select ${PHOTO_COLUMNS}
    from player_photos
    where id = $1
  `, [safePhotoId]);

  const row = result?.rows?.[0];
  if (!row) return null;

  const photo = mapRowToPhoto(row);
  if (!photo) return null;

  const safeViewerPlayerId = sanitizeViewerPlayerId(viewerPlayerId);
  if (safeViewerPlayerId) {
    const reactionResult = await db.query(`
      select reaction_id
      from photo_reactions
      where photo_id = $1 and player_id = $2
    `, [safePhotoId, safeViewerPlayerId]);
    photo.viewerReaction = sanitizePhotoReactionId(reactionResult?.rows?.[0]?.reaction_id || "");
  } else {
    photo.viewerReaction = "";
  }

  return photo;
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

export async function reactToPhoto(db, photoId, viewerPlayerId, reactionId) {
  const safePhotoId = sanitizePhotoId(photoId);
  const safeViewerPlayerId = sanitizeViewerPlayerId(viewerPlayerId);
  const safeReactionId = sanitizePhotoReactionId(reactionId);
  if (!safePhotoId || !safeViewerPlayerId || !safeReactionId) return null;

  await db.query("begin");
  try {
    const photoResult = await db.query(`
      select ${PHOTO_COLUMNS}
      from player_photos
      where id = $1
    `, [safePhotoId]);
    const photoRow = photoResult?.rows?.[0];
    if (!photoRow) {
      await db.query("rollback");
      return null;
    }

    const existingResult = await db.query(`
      select reaction_id
      from photo_reactions
      where photo_id = $1 and player_id = $2
    `, [safePhotoId, safeViewerPlayerId]);
    const existingReactionId = sanitizePhotoReactionId(existingResult?.rows?.[0]?.reaction_id);
    const nextViewerReaction = existingReactionId === safeReactionId ? "" : safeReactionId;

    if (!nextViewerReaction) {
      await db.query(`
        delete from photo_reactions
        where photo_id = $1 and player_id = $2
      `, [safePhotoId, safeViewerPlayerId]);
    } else {
      await db.query(`
        insert into photo_reactions (photo_id, player_id, reaction_id)
        values ($1, $2, $3)
        on conflict (photo_id, player_id) do update set
          reaction_id = excluded.reaction_id,
          updated_at = now()
      `, [safePhotoId, safeViewerPlayerId, nextViewerReaction]);
    }

    const totalsResult = await db.query(`
      select reaction_id, count(*)::int as reaction_count
      from photo_reactions
      where photo_id = $1
      group by reaction_id
    `, [safePhotoId]);

    const reactionTotals = {};
    for (const row of totalsResult?.rows || []) {
      const rId = sanitizePhotoReactionId(row.reaction_id);
      if (rId) reactionTotals[rId] = Math.max(0, Number(row.reaction_count) || 0);
    }

    await db.query(`
      update player_photos
      set reaction_totals = $2::jsonb
      where id = $1
    `, [safePhotoId, JSON.stringify(reactionTotals)]);

    await db.query("commit");

    const photo = mapRowToPhoto({ ...photoRow, reaction_totals: reactionTotals });
    photo.viewerReaction = nextViewerReaction;
    return photo;
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

export async function commentOnPhoto(db, photoId, viewerPlayerId, authorDisplayName, text) {
  const safePhotoId = sanitizePhotoId(photoId);
  const safeViewerPlayerId = sanitizeViewerPlayerId(viewerPlayerId);
  const safeDisplayName = sanitizeViewerAuthorDisplayName(authorDisplayName);
  const safeText = sanitizeCommentText(text);
  if (!safePhotoId || !safeViewerPlayerId || !safeDisplayName || !safeText) return null;

  await db.query("begin");
  try {
    const photoResult = await db.query(`
      select ${PHOTO_COLUMNS}
      from player_photos
      where id = $1
    `, [safePhotoId]);
    const photoRow = photoResult?.rows?.[0];
    if (!photoRow) {
      await db.query("rollback");
      return null;
    }

    const commentId = createPhotoCommentId(safePhotoId, safeViewerPlayerId);
    const insertResult = await db.query(`
      insert into photo_comments (id, photo_id, author_player_id, author_display_name, text, created_at)
      values ($1, $2, $3, $4, $5, $6)
      returning id, photo_id, author_player_id, author_display_name, text, created_at, edited_at
    `, [commentId, safePhotoId, safeViewerPlayerId, safeDisplayName, safeText, new Date().toISOString()]);
    const insertedComment = mapRowToPhotoComment(insertResult?.rows?.[0] || {});

    const countResult = await db.query(`
      select count(*)::int as comment_count
      from photo_comments
      where photo_id = $1
    `, [safePhotoId]);
    const commentCount = Math.max(0, Number(countResult?.rows?.[0]?.comment_count) || 0);

    await db.query(`
      update player_photos
      set comment_count = $2
      where id = $1
    `, [safePhotoId, commentCount]);

    await db.query("commit");
    return {
      photo: mapRowToPhoto({ ...photoRow, comment_count: commentCount }),
      comment: insertedComment,
    };
  } catch (error) {
    await db.query("rollback");
    throw error;
  }
}

export async function listPhotoComments(db, photoId, { limit = 100 } = {}) {
  if (!db || !photoId) return [];
  const safePhotoId = sanitizePhotoId(photoId);
  if (!safePhotoId) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 200));

  const result = await db.query(`
    select id, photo_id, author_player_id, author_display_name, text, created_at, edited_at
    from photo_comments
    where photo_id = $1
    order by created_at asc
    limit $2
  `, [safePhotoId, safeLimit]);

  return (result?.rows || []).map(mapRowToPhotoComment).filter(Boolean);
}
