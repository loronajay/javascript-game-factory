import {
  buildDefaultProfileRelationshipsRecord,
  normalizeProfileRelationshipsRecord,
} from "../../../js/platform/relationships/relationships.mjs";

function sanitizePlayerId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function ensureJsonArray(value) {
  return Array.isArray(value) ? value : [];
}

function ensureJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mapRowToRelationshipsRecord(row = {}, fallbackPlayerId = "") {
  return normalizeProfileRelationshipsRecord({
    playerId: row.player_id || fallbackPlayerId,
    mainSqueezeMode: row.main_squeeze_mode,
    mainSqueezePlayerId: row.main_squeeze_player_id,
    friendRailMode: row.friend_rail_mode,
    manualFriendSlotPlayerIds: ensureJsonArray(row.manual_friend_slot_player_ids),
    mostPlayedWithPlayerId: row.most_played_with_player_id,
    lastPlayedWithPlayerId: row.last_played_with_player_id,
    recentlyPlayedWithPlayerIds: ensureJsonArray(row.recently_played_with_player_ids),
    friendPlayerIds: ensureJsonArray(row.friend_player_ids),
    friendPointsByPlayerId: ensureJsonObject(row.friend_points_by_player_id),
    mutualFriendCountByPlayerId: ensureJsonObject(row.mutual_friend_count_by_player_id),
    sharedGameCountByPlayerId: ensureJsonObject(row.shared_game_count_by_player_id),
    sharedSessionCountByPlayerId: ensureJsonObject(row.shared_session_count_by_player_id),
    sharedEventCountByPlayerId: ensureJsonObject(row.shared_event_count_by_player_id),
    lastSharedSessionAtByPlayerId: ensureJsonObject(row.last_shared_session_at_by_player_id),
    lastSharedEventAtByPlayerId: ensureJsonObject(row.last_shared_event_at_by_player_id),
    lastInteractionAtByPlayerId: ensureJsonObject(row.last_interaction_at_by_player_id),
  });
}

function buildRelationshipsParams(playerId, relationships) {
  return [
    playerId,
    relationships.mainSqueezeMode,
    relationships.mainSqueezePlayerId,
    relationships.friendRailMode,
    JSON.stringify(relationships.manualFriendSlotPlayerIds),
    relationships.mostPlayedWithPlayerId,
    relationships.lastPlayedWithPlayerId,
    JSON.stringify(relationships.recentlyPlayedWithPlayerIds),
    JSON.stringify(relationships.friendPlayerIds),
    JSON.stringify(relationships.friendPointsByPlayerId),
    JSON.stringify(relationships.mutualFriendCountByPlayerId),
    JSON.stringify(relationships.sharedGameCountByPlayerId),
    JSON.stringify(relationships.sharedSessionCountByPlayerId),
    JSON.stringify(relationships.sharedEventCountByPlayerId),
    JSON.stringify(relationships.lastSharedSessionAtByPlayerId),
    JSON.stringify(relationships.lastSharedEventAtByPlayerId),
    JSON.stringify(relationships.lastInteractionAtByPlayerId),
  ];
}

export async function loadPlayerRelationships(db, playerId) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return buildDefaultProfileRelationshipsRecord("");

  const result = await db.query(`
    select
      player_id,
      main_squeeze_mode,
      main_squeeze_player_id,
      friend_rail_mode,
      manual_friend_slot_player_ids,
      most_played_with_player_id,
      last_played_with_player_id,
      recently_played_with_player_ids,
      friend_player_ids,
      friend_points_by_player_id,
      mutual_friend_count_by_player_id,
      shared_game_count_by_player_id,
      shared_session_count_by_player_id,
      shared_event_count_by_player_id,
      last_shared_session_at_by_player_id,
      last_shared_event_at_by_player_id,
      last_interaction_at_by_player_id
    from player_relationships
    where player_id = $1
    limit 1
  `, [normalizedPlayerId]);

  if (!result?.rows?.[0]) {
    return buildDefaultProfileRelationshipsRecord(normalizedPlayerId);
  }

  return mapRowToRelationshipsRecord(result.rows[0], normalizedPlayerId);
}

export async function savePlayerRelationships(db, playerId, patch = {}) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  const normalized = normalizeProfileRelationshipsRecord({
    ...patch,
    playerId: normalizedPlayerId,
  });

  await db.query(`
    insert into players (player_id)
    values ($1)
    on conflict (player_id) do update
      set updated_at = now()
  `, [normalizedPlayerId]);

  const result = await db.query(`
    insert into player_relationships (
      player_id,
      main_squeeze_mode,
      main_squeeze_player_id,
      friend_rail_mode,
      manual_friend_slot_player_ids,
      most_played_with_player_id,
      last_played_with_player_id,
      recently_played_with_player_ids,
      friend_player_ids,
      friend_points_by_player_id,
      mutual_friend_count_by_player_id,
      shared_game_count_by_player_id,
      shared_session_count_by_player_id,
      shared_event_count_by_player_id,
      last_shared_session_at_by_player_id,
      last_shared_event_at_by_player_id,
      last_interaction_at_by_player_id
    ) values (
      $1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb,
      $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb
    )
    on conflict (player_id) do update set
      main_squeeze_mode = excluded.main_squeeze_mode,
      main_squeeze_player_id = excluded.main_squeeze_player_id,
      friend_rail_mode = excluded.friend_rail_mode,
      manual_friend_slot_player_ids = excluded.manual_friend_slot_player_ids,
      most_played_with_player_id = excluded.most_played_with_player_id,
      last_played_with_player_id = excluded.last_played_with_player_id,
      recently_played_with_player_ids = excluded.recently_played_with_player_ids,
      friend_player_ids = excluded.friend_player_ids,
      friend_points_by_player_id = excluded.friend_points_by_player_id,
      mutual_friend_count_by_player_id = excluded.mutual_friend_count_by_player_id,
      shared_game_count_by_player_id = excluded.shared_game_count_by_player_id,
      shared_session_count_by_player_id = excluded.shared_session_count_by_player_id,
      shared_event_count_by_player_id = excluded.shared_event_count_by_player_id,
      last_shared_session_at_by_player_id = excluded.last_shared_session_at_by_player_id,
      last_shared_event_at_by_player_id = excluded.last_shared_event_at_by_player_id,
      last_interaction_at_by_player_id = excluded.last_interaction_at_by_player_id,
      updated_at = now()
    returning
      player_id,
      main_squeeze_mode,
      main_squeeze_player_id,
      friend_rail_mode,
      manual_friend_slot_player_ids,
      most_played_with_player_id,
      last_played_with_player_id,
      recently_played_with_player_ids,
      friend_player_ids,
      friend_points_by_player_id,
      mutual_friend_count_by_player_id,
      shared_game_count_by_player_id,
      shared_session_count_by_player_id,
      shared_event_count_by_player_id,
      last_shared_session_at_by_player_id,
      last_shared_event_at_by_player_id,
      last_interaction_at_by_player_id
  `, buildRelationshipsParams(normalizedPlayerId, normalized));

  return mapRowToRelationshipsRecord(result?.rows?.[0] || null, normalizedPlayerId);
}

