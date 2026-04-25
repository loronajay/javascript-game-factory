function createFriendRequestId() {
  return `fr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapRowToFriendRequest(row = {}) {
  if (!row || !row.id) return null;
  return {
    id: String(row.id || ""),
    fromPlayerId: String(row.from_player_id || ""),
    toPlayerId: String(row.to_player_id || ""),
    fromDisplayName: String(row.from_display_name || ""),
    status: String(row.status || "pending"),
    notificationId: String(row.notification_id || ""),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
  };
}

export async function createFriendRequest(db, {
  id,
  fromPlayerId,
  toPlayerId,
  fromDisplayName = "",
  notificationId = "",
} = {}) {
  if (!db || !fromPlayerId || !toPlayerId) return null;
  const requestId = id || createFriendRequestId();

  const result = await db.query(`
    insert into friend_requests (
      id, from_player_id, to_player_id, from_display_name, status, notification_id
    ) values (
      $1, $2, $3, $4, 'pending', $5
    )
    on conflict do nothing
    returning id, from_player_id, to_player_id, from_display_name, status, notification_id, created_at, updated_at
  `, [requestId, fromPlayerId, toPlayerId, fromDisplayName, notificationId]);

  return mapRowToFriendRequest(result?.rows?.[0] || null);
}

export async function findPendingFriendRequest(db, fromPlayerId, toPlayerId) {
  if (!db || !fromPlayerId || !toPlayerId) return null;

  const result = await db.query(`
    select id, from_player_id, to_player_id, from_display_name, status, notification_id, created_at, updated_at
    from friend_requests
    where from_player_id = $1 and to_player_id = $2 and status = 'pending'
  `, [fromPlayerId, toPlayerId]);

  return mapRowToFriendRequest(result?.rows?.[0] || null);
}

export async function getFriendRequest(db, id) {
  if (!db || !id) return null;

  const result = await db.query(`
    select id, from_player_id, to_player_id, from_display_name, status, notification_id, created_at, updated_at
    from friend_requests
    where id = $1
  `, [id]);

  return mapRowToFriendRequest(result?.rows?.[0] || null);
}

export async function acceptFriendRequest(db, id) {
  if (!db || !id) return null;

  const result = await db.query(`
    update friend_requests
    set status = 'accepted', updated_at = now()
    where id = $1 and status = 'pending'
    returning id, from_player_id, to_player_id, from_display_name, status, notification_id, created_at, updated_at
  `, [id]);

  return mapRowToFriendRequest(result?.rows?.[0] || null);
}

export async function rejectFriendRequest(db, id) {
  if (!db || !id) return null;

  const result = await db.query(`
    update friend_requests
    set status = 'rejected', updated_at = now()
    where id = $1 and status = 'pending'
    returning id, from_player_id, to_player_id, from_display_name, status, notification_id, created_at, updated_at
  `, [id]);

  return mapRowToFriendRequest(result?.rows?.[0] || null);
}
