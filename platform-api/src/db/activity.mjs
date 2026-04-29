import {
  ACTIVITY_FEED_LIMIT,
  normalizeActivityItem,
} from "../normalize.mjs";

function ensureJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mapRowToActivityItem(row = {}) {
  const payload = ensureJsonObject(row.payload);

  return normalizeActivityItem({
    id: row.id,
    type: payload.type,
    actorPlayerId: row.actor_player_id,
    actorDisplayName: row.actor_display_name || payload.actorDisplayName || "",
    gameSlug: row.game_slug,
    summary: row.summary,
    visibility: row.visibility,
    createdAt: row.created_at,
    metadata: ensureJsonObject(payload.metadata),
  });
}

function buildActivityParams(item) {
  return [
    item.id,
    item.actorPlayerId,
    item.actorDisplayName,
    item.gameSlug,
    item.visibility,
    item.summary,
    item.createdAt,
    JSON.stringify({
      type: item.type,
      actorDisplayName: item.actorDisplayName || "",
      metadata: item.metadata || {},
    }),
  ];
}

function isLegacySchemaMismatch(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  return code === "42703"
    || /actor_display_name|title/.test(message);
}

export async function listActivityItems(db, options = {}) {
  const limit = Math.max(1, Math.min(Number(options.limit) || ACTIVITY_FEED_LIMIT, ACTIVITY_FEED_LIMIT));
  let result;
  try {
    result = await db.query(`
      select
        id,
        actor_player_id,
        actor_display_name,
        game_slug,
        visibility,
        title,
        summary,
        created_at,
        payload
      from activity_items
      order by created_at desc, id desc
      limit $1
    `, [limit]);
  } catch (error) {
    if (!isLegacySchemaMismatch(error)) {
      throw error;
    }
    result = await db.query(`
      select
        id,
        actor_player_id,
        game_slug,
        visibility,
        summary,
        created_at,
        payload
      from activity_items
      order by created_at desc, id desc
      limit $1
    `, [limit]);
  }

  return (result?.rows || []).map(mapRowToActivityItem);
}

export async function saveActivityItem(db, item = {}) {
  const normalized = normalizeActivityItem(item);
  let result;
  try {
    result = await db.query(`
      insert into activity_items (
        id,
        actor_player_id,
        actor_display_name,
        game_slug,
        visibility,
        title,
        summary,
        created_at,
        payload
      ) values (
        $1, $2, $3, $4, $5, '', $6, $7, $8::jsonb
      )
      on conflict (id) do update set
        actor_player_id = excluded.actor_player_id,
        actor_display_name = excluded.actor_display_name,
        game_slug = excluded.game_slug,
        visibility = excluded.visibility,
        summary = excluded.summary,
        created_at = excluded.created_at,
        payload = excluded.payload
      returning
        id,
        actor_player_id,
        actor_display_name,
        game_slug,
        visibility,
        title,
        summary,
        created_at,
        payload
    `, buildActivityParams(normalized));
  } catch (error) {
    if (!isLegacySchemaMismatch(error)) {
      throw error;
    }
    result = await db.query(`
      insert into activity_items (
        id,
        actor_player_id,
        game_slug,
        visibility,
        summary,
        created_at,
        payload
      ) values (
        $1, $2, $4, $5, $6, $7, $8::jsonb
      )
      on conflict (id) do update set
        actor_player_id = excluded.actor_player_id,
        game_slug = excluded.game_slug,
        visibility = excluded.visibility,
        summary = excluded.summary,
        created_at = excluded.created_at,
        payload = excluded.payload
      returning
        id,
        actor_player_id,
        game_slug,
        visibility,
        summary,
        created_at,
        payload
    `, buildActivityParams(normalized));
  }

  return mapRowToActivityItem(result?.rows?.[0] || null);
}
