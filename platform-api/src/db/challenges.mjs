function createChallengeId() {
  return `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapRowToChallenge(row = {}) {
  if (!row || !row.id) return null;
  return {
    id: String(row.id || ""),
    fromPlayerId: String(row.from_player_id || ""),
    toPlayerId: String(row.to_player_id || ""),
    fromDisplayName: String(row.from_display_name || ""),
    gameSlug: String(row.game_slug || ""),
    gameTitle: String(row.game_title || ""),
    status: String(row.status || "pending"),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

export async function createChallenge(db, {
  fromPlayerId,
  toPlayerId,
  fromDisplayName = "",
  gameSlug,
  gameTitle = "",
} = {}) {
  if (!db || !fromPlayerId || !toPlayerId || !gameSlug) return null;
  const challengeId = createChallengeId();

  const result = await db.query(`
    insert into challenges (
      id, from_player_id, to_player_id, from_display_name, game_slug, game_title, status
    ) values (
      $1, $2, $3, $4, $5, $6, 'pending'
    )
    returning id, from_player_id, to_player_id, from_display_name, game_slug, game_title, status, created_at, updated_at
  `, [challengeId, fromPlayerId, toPlayerId, fromDisplayName, gameSlug, gameTitle]);

  return mapRowToChallenge(result?.rows?.[0] || null);
}

export async function getChallenge(db, id) {
  if (!db || !id) return null;

  const result = await db.query(`
    select id, from_player_id, to_player_id, from_display_name, game_slug, game_title, status, created_at, updated_at
    from challenges
    where id = $1
  `, [id]);

  return mapRowToChallenge(result?.rows?.[0] || null);
}

export async function acceptChallenge(db, id) {
  if (!db || !id) return null;

  const result = await db.query(`
    update challenges
    set status = 'accepted', updated_at = now()
    where id = $1 and status = 'pending'
    returning id, from_player_id, to_player_id, from_display_name, game_slug, game_title, status, created_at, updated_at
  `, [id]);

  return mapRowToChallenge(result?.rows?.[0] || null);
}

export async function declineChallenge(db, id) {
  if (!db || !id) return null;

  const result = await db.query(`
    update challenges
    set status = 'declined', updated_at = now()
    where id = $1 and status = 'pending'
    returning id, from_player_id, to_player_id, from_display_name, game_slug, game_title, status, created_at, updated_at
  `, [id]);

  return mapRowToChallenge(result?.rows?.[0] || null);
}
