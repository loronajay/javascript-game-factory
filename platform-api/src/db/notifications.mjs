function createNotificationId() {
  return `notif-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapRowToNotification(row = {}) {
  if (!row || !row.id) return null;
  return {
    id: String(row.id || ""),
    recipientPlayerId: String(row.recipient_player_id || ""),
    actorPlayerId: String(row.actor_player_id || ""),
    actorDisplayName: String(row.actor_display_name || ""),
    type: String(row.type || ""),
    status: String(row.status || "unread"),
    payload: (row.payload && typeof row.payload === "object") ? row.payload : {},
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  };
}

export async function createNotification(db, {
  id,
  recipientPlayerId,
  actorPlayerId = "",
  actorDisplayName = "",
  type,
  payload = {},
} = {}) {
  if (!db || !recipientPlayerId || !type) return null;
  const notifId = id || createNotificationId();

  try {
    const result = await db.query(`
      insert into notifications (
        id, recipient_player_id, actor_player_id, actor_display_name, type, status, payload
      ) values (
        $1, $2, $3, $4, $5, 'unread', $6::jsonb
      )
      returning id, recipient_player_id, actor_player_id, actor_display_name, type, status, payload, created_at
    `, [notifId, recipientPlayerId, actorPlayerId, actorDisplayName, type, JSON.stringify(payload)]);

    return mapRowToNotification(result?.rows?.[0] || null);
  } catch {
    return null;
  }
}

export async function listNotifications(db, recipientPlayerId, options = {}) {
  if (!db || !recipientPlayerId) return { notifications: [], unreadCount: 0 };
  const limit = Math.max(1, Math.min(Number(options.limit) || 30, 100));

  const [listResult, countResult] = await Promise.all([
    db.query(`
      select id, recipient_player_id, actor_player_id, actor_display_name, type, status, payload, created_at
      from notifications
      where recipient_player_id = $1
      order by created_at desc, id desc
      limit $2
    `, [recipientPlayerId, limit]),
    db.query(`
      select count(*)::int as unread_count
      from notifications
      where recipient_player_id = $1 and status = 'unread'
    `, [recipientPlayerId]),
  ]);

  return {
    notifications: (listResult?.rows || []).map(mapRowToNotification).filter(Boolean),
    unreadCount: Number(countResult?.rows?.[0]?.unread_count) || 0,
  };
}

export async function markAllNotificationsRead(db, recipientPlayerId) {
  if (!db || !recipientPlayerId) return;
  await db.query(`
    update notifications
    set status = 'read'
    where recipient_player_id = $1 and status = 'unread'
  `, [recipientPlayerId]);
}

export async function getUnreadNotificationCount(db, recipientPlayerId) {
  if (!db || !recipientPlayerId) return 0;
  const result = await db.query(`
    select count(*)::int as unread_count
    from notifications
    where recipient_player_id = $1 and status = 'unread'
  `, [recipientPlayerId]);
  return Number(result?.rows?.[0]?.unread_count) || 0;
}
