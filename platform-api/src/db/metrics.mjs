import {
  buildDefaultProfileMetricsRecord,
  normalizeProfileMetricsRecord,
} from "../normalize.mjs";

function sanitizePlayerId(value) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function ensureJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mapRowToMetricsRecord(row = {}, fallbackPlayerId = "") {
  return normalizeProfileMetricsRecord({
    playerId: row.player_id || fallbackPlayerId,
    profileViewCount: row.profile_view_count,
    thoughtPostCount: row.thought_post_count,
    activityItemCount: row.activity_item_count,
    receivedReactionCount: row.received_reaction_count,
    receivedCommentCount: row.received_comment_count,
    receivedShareCount: row.received_share_count,
    mostPlayedGameSlug: row.most_played_game_slug,
    mostPlayedWithPlayerId: row.most_played_with_player_id,
    friendCount: row.friend_count,
    friendPoints: ensureJsonObject(row.friend_points),
    totalPlaySessionCount: row.total_play_session_count,
    totalPlayTimeMinutes: row.total_play_time_minutes,
    uniqueGamesPlayedCount: row.unique_games_played_count,
    eventParticipationCount: row.event_participation_count,
    topThreeFinishCount: row.top_three_finish_count,
    mutualFriendCount: row.mutual_friend_count,
    sharedGameCount: row.shared_game_count,
    sharedSessionCount: row.shared_session_count,
    sharedEventCount: row.shared_event_count,
    resultsScreenProfileOpenCount: row.results_screen_profile_open_count,
    resultsScreenAddFriendClickCount: row.results_screen_add_friend_click_count,
    chatProfileOpenCount: row.chat_profile_open_count,
    friendRequestSentCount: row.friend_request_sent_count,
    friendRequestAcceptedCount: row.friend_request_accepted_count,
    thoughtImpressionCount: row.thought_impression_count,
    profileOpenSourceBreakdown: ensureJsonObject(row.profile_open_source_breakdown),
  });
}

function buildMetricsParams(playerId, metrics) {
  return [
    playerId,
    metrics.profileViewCount,
    metrics.thoughtPostCount,
    metrics.activityItemCount,
    metrics.receivedReactionCount,
    metrics.receivedCommentCount,
    metrics.receivedShareCount,
    metrics.mostPlayedGameSlug,
    metrics.mostPlayedWithPlayerId,
    metrics.friendCount,
    JSON.stringify(metrics.friendPoints),
    metrics.totalPlaySessionCount,
    metrics.totalPlayTimeMinutes,
    metrics.uniqueGamesPlayedCount,
    metrics.eventParticipationCount,
    metrics.topThreeFinishCount,
    metrics.mutualFriendCount,
    metrics.sharedGameCount,
    metrics.sharedSessionCount,
    metrics.sharedEventCount,
    metrics.resultsScreenProfileOpenCount,
    metrics.resultsScreenAddFriendClickCount,
    metrics.chatProfileOpenCount,
    metrics.friendRequestSentCount,
    metrics.friendRequestAcceptedCount,
    metrics.thoughtImpressionCount,
    JSON.stringify(metrics.profileOpenSourceBreakdown),
  ];
}

export async function loadPlayerMetrics(db, playerId) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return buildDefaultProfileMetricsRecord("");

  const result = await db.query(`
    select
      player_id,
      profile_view_count,
      thought_post_count,
      activity_item_count,
      received_reaction_count,
      received_comment_count,
      received_share_count,
      most_played_game_slug,
      most_played_with_player_id,
      friend_count,
      friend_points,
      total_play_session_count,
      total_play_time_minutes,
      unique_games_played_count,
      event_participation_count,
      top_three_finish_count,
      mutual_friend_count,
      shared_game_count,
      shared_session_count,
      shared_event_count,
      results_screen_profile_open_count,
      results_screen_add_friend_click_count,
      chat_profile_open_count,
      friend_request_sent_count,
      friend_request_accepted_count,
      thought_impression_count,
      profile_open_source_breakdown
    from player_metrics
    where player_id = $1
    limit 1
  `, [normalizedPlayerId]);

  if (!result?.rows?.[0]) {
    return buildDefaultProfileMetricsRecord(normalizedPlayerId);
  }

  return mapRowToMetricsRecord(result.rows[0], normalizedPlayerId);
}

export async function savePlayerMetrics(db, playerId, patch = {}) {
  const normalizedPlayerId = sanitizePlayerId(playerId);
  if (!normalizedPlayerId) return null;

  const normalized = normalizeProfileMetricsRecord({
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
    insert into player_metrics (
      player_id,
      profile_view_count,
      thought_post_count,
      activity_item_count,
      received_reaction_count,
      received_comment_count,
      received_share_count,
      most_played_game_slug,
      most_played_with_player_id,
      friend_count,
      friend_points,
      total_play_session_count,
      total_play_time_minutes,
      unique_games_played_count,
      event_participation_count,
      top_three_finish_count,
      mutual_friend_count,
      shared_game_count,
      shared_session_count,
      shared_event_count,
      results_screen_profile_open_count,
      results_screen_add_friend_click_count,
      chat_profile_open_count,
      friend_request_sent_count,
      friend_request_accepted_count,
      thought_impression_count,
      profile_open_source_breakdown
    ) values (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15,
      $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27::jsonb
    )
    on conflict (player_id) do update set
      profile_view_count = excluded.profile_view_count,
      thought_post_count = excluded.thought_post_count,
      activity_item_count = excluded.activity_item_count,
      received_reaction_count = excluded.received_reaction_count,
      received_comment_count = excluded.received_comment_count,
      received_share_count = excluded.received_share_count,
      most_played_game_slug = excluded.most_played_game_slug,
      most_played_with_player_id = excluded.most_played_with_player_id,
      friend_count = excluded.friend_count,
      friend_points = excluded.friend_points,
      total_play_session_count = excluded.total_play_session_count,
      total_play_time_minutes = excluded.total_play_time_minutes,
      unique_games_played_count = excluded.unique_games_played_count,
      event_participation_count = excluded.event_participation_count,
      top_three_finish_count = excluded.top_three_finish_count,
      mutual_friend_count = excluded.mutual_friend_count,
      shared_game_count = excluded.shared_game_count,
      shared_session_count = excluded.shared_session_count,
      shared_event_count = excluded.shared_event_count,
      results_screen_profile_open_count = excluded.results_screen_profile_open_count,
      results_screen_add_friend_click_count = excluded.results_screen_add_friend_click_count,
      chat_profile_open_count = excluded.chat_profile_open_count,
      friend_request_sent_count = excluded.friend_request_sent_count,
      friend_request_accepted_count = excluded.friend_request_accepted_count,
      thought_impression_count = excluded.thought_impression_count,
      profile_open_source_breakdown = excluded.profile_open_source_breakdown,
      updated_at = now()
    returning
      player_id,
      profile_view_count,
      thought_post_count,
      activity_item_count,
      received_reaction_count,
      received_comment_count,
      received_share_count,
      most_played_game_slug,
      most_played_with_player_id,
      friend_count,
      friend_points,
      total_play_session_count,
      total_play_time_minutes,
      unique_games_played_count,
      event_participation_count,
      top_three_finish_count,
      mutual_friend_count,
      shared_game_count,
      shared_session_count,
      shared_event_count,
      results_screen_profile_open_count,
      results_screen_add_friend_click_count,
      chat_profile_open_count,
      friend_request_sent_count,
      friend_request_accepted_count,
      thought_impression_count,
      profile_open_source_breakdown
  `, buildMetricsParams(normalizedPlayerId, normalized));

  return mapRowToMetricsRecord(result?.rows?.[0] || null, normalizedPlayerId);
}

