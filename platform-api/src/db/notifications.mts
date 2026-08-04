function createNotificationId(): string {
  return `notif-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapRowToNotification(row: any = {}): any {
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

export async function createNotification(db: any, {
  id,
  recipientPlayerId,
  actorPlayerId = "",
  actorDisplayName = "",
  type,
  payload = {},
}: any = {}): Promise<any> {
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

// Fans one notification out to every registered account in a single statement.
//
// This is the only write in this module that is not addressed to one player, so it is
// deliberately narrow: the caller supplies an `idPrefix` that makes each row's primary key
// deterministic (`<prefix><playerId>`), and the insert is `on conflict do nothing`. That
// pair is what makes a re-run harmless — a retried broadcast lands on the same ids and
// inserts nothing rather than giving everyone a second copy. Callers that must send only
// once still need their own claim (see markBulletinAnnounced); this only stops duplicates.
//
// `actorPlayerId` is excluded from the recipients: an operator announcing something does
// not need to be told about it.
export async function broadcastNotification(db: any, {
  idPrefix,
  actorPlayerId = "",
  actorDisplayName = "",
  type,
  payload = {},
}: any = {}): Promise<number> {
  if (!db || !type) return 0;
  const prefix = typeof idPrefix === "string" ? idPrefix.trim() : "";
  if (!prefix) return 0;

  try {
    const result = await db.query(`
      insert into notifications (
        id, recipient_player_id, actor_player_id, actor_display_name, type, status, payload
      )
      select
        $1 || a.player_id, a.player_id, $2, $3, $4, 'unread', $5::jsonb
      from accounts a
      where a.player_id <> $2
      on conflict (id) do nothing
    `, [prefix, String(actorPlayerId || ""), String(actorDisplayName || ""), type, JSON.stringify(payload)]);

    return Number(result?.rowCount) || 0;
  } catch (err) {
    process.stderr.write(`[notifications] broadcastNotification error: ${(err as any)?.message || err}\n`);
    return 0;
  }
}

export async function listNotifications(db: any, recipientPlayerId: any, options: any = {}): Promise<any> {
  if (!db || !recipientPlayerId) return { notifications: [], unreadCount: 0 };
  const limit = Math.max(1, Math.min(Number(options.limit) || 30, 100));

  const [listResult, countResult] = await Promise.all([
    db.query(`
      select
        n.id,
        n.recipient_player_id,
        n.actor_player_id,
        coalesce(nullif(n.actor_display_name, ''), pp.profile_name, '') as actor_display_name,
        n.type,
        n.status,
        n.payload,
        n.created_at
      from notifications n
      left join player_profiles pp on pp.player_id = n.actor_player_id
      where n.recipient_player_id = $1
      order by n.created_at desc, n.id desc
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

// Notifications embed a snapshot of what they announce, so when the underlying comment,
// post, or photo is removed the notification is left pointing at something that no longer
// exists. Callers that delete social content clear the matching notifications through here.
// The key is allowlisted because it is interpolated into a jsonb path lookup.
// `contentId` covers broadcast announcements (bulletins and events). Both id spaces are
// uuids from the same generator, so one key cannot collide across the two tables.
const NOTIFICATION_PAYLOAD_REF_KEYS = new Set(["commentId", "thoughtId", "photoId", "contentId"]);

export async function deleteNotificationsByPayloadRef(db: any, payloadKey: any, payloadValue: any): Promise<number> {
  if (!db) return 0;
  const key = typeof payloadKey === "string" ? payloadKey : "";
  const value = typeof payloadValue === "string" ? payloadValue.trim() : "";
  if (!NOTIFICATION_PAYLOAD_REF_KEYS.has(key) || !value) return 0;

  try {
    const result = await db.query(`
      delete from notifications
      where payload->>$1 = $2
    `, [key, value]);
    return Number(result?.rowCount) || 0;
  } catch {
    // A stale notification is a cosmetic problem; never fail the content deletion over it.
    return 0;
  }
}

export async function markAllNotificationsRead(db: any, recipientPlayerId: any): Promise<void> {
  if (!db || !recipientPlayerId) return;
  await db.query(`
    update notifications
    set status = 'read'
    where recipient_player_id = $1 and status = 'unread'
  `, [recipientPlayerId]);
}

export async function getUnreadNotificationCount(db: any, recipientPlayerId: any): Promise<number> {
  if (!db || !recipientPlayerId) return 0;
  const result = await db.query(`
    select count(*)::int as unread_count
    from notifications
    where recipient_player_id = $1 and status = 'unread'
  `, [recipientPlayerId]);
  return Number(result?.rows?.[0]?.unread_count) || 0;
}
