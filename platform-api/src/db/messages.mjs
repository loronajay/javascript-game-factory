function createConversationId() {
  return `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createMessageId() {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function mapRowToConversation(row = {}) {
  if (!row?.id) return null;
  return {
    id: String(row.id || ""),
    playerAId: String(row.player_a_id || ""),
    playerBId: String(row.player_b_id || ""),
    lastMessageAt: row.last_message_at ? new Date(row.last_message_at).toISOString() : "",
    unreadCountA: Number(row.unread_count_a) || 0,
    unreadCountB: Number(row.unread_count_b) || 0,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  };
}

function mapRowToMessage(row = {}) {
  if (!row?.id) return null;
  return {
    id: String(row.id || ""),
    conversationId: String(row.conversation_id || ""),
    fromPlayerId: String(row.from_player_id || ""),
    text: String(row.text || ""),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : "",
  };
}

// Always store player_a_id < player_b_id to enforce unique pair constraint
function normalizePair(p1, p2) {
  return p1 <= p2 ? [p1, p2] : [p2, p1];
}

export async function findOrCreateConversation(db, playerOneId, playerTwoId) {
  if (!db || !playerOneId || !playerTwoId || playerOneId === playerTwoId) return null;
  const [aId, bId] = normalizePair(playerOneId, playerTwoId);
  const convId = createConversationId();

  const result = await db.query(`
    insert into conversations (id, player_a_id, player_b_id)
    values ($1, $2, $3)
    on conflict (player_a_id, player_b_id) do update
      set id = conversations.id
    returning id, player_a_id, player_b_id, last_message_at, unread_count_a, unread_count_b, created_at
  `, [convId, aId, bId]);

  return mapRowToConversation(result?.rows?.[0] || null);
}

export async function findConversationBetween(db, playerOneId, playerTwoId) {
  if (!db || !playerOneId || !playerTwoId) return null;
  const [aId, bId] = normalizePair(playerOneId, playerTwoId);

  const result = await db.query(`
    select id, player_a_id, player_b_id, last_message_at, unread_count_a, unread_count_b, created_at
    from conversations
    where player_a_id = $1 and player_b_id = $2
  `, [aId, bId]);

  return mapRowToConversation(result?.rows?.[0] || null);
}

export async function listConversations(db, playerId) {
  if (!db || !playerId) return [];

  const result = await db.query(`
    select
      c.id, c.player_a_id, c.player_b_id, c.last_message_at,
      c.unread_count_a, c.unread_count_b, c.created_at,
      lm.text as last_message_preview,
      pp.profile_name as other_profile_name
    from conversations c
    left join lateral (
      select text from messages
      where conversation_id = c.id
      order by created_at desc
      limit 1
    ) lm on true
    left join player_profiles pp on pp.player_id =
      case when c.player_a_id = $1 then c.player_b_id else c.player_a_id end
    where c.player_a_id = $1 or c.player_b_id = $1
    order by c.last_message_at desc
  `, [playerId]);

  return (result?.rows || []).map(row => {
    const conv = mapRowToConversation(row);
    if (!conv) return null;
    const isPlayerA = row.player_a_id === playerId;
    return {
      ...conv,
      otherPlayerId: isPlayerA ? conv.playerBId : conv.playerAId,
      otherProfileName: String(row.other_profile_name || ""),
      lastMessagePreview: String(row.last_message_preview || ""),
      unreadCount: isPlayerA ? conv.unreadCountA : conv.unreadCountB,
    };
  }).filter(Boolean);
}

export async function getConversation(db, conversationId) {
  if (!db || !conversationId) return null;

  const result = await db.query(`
    select id, player_a_id, player_b_id, last_message_at, unread_count_a, unread_count_b, created_at
    from conversations
    where id = $1
  `, [conversationId]);

  return mapRowToConversation(result?.rows?.[0] || null);
}

export async function listMessages(db, conversationId) {
  if (!db || !conversationId) return [];

  const result = await db.query(`
    select id, conversation_id, from_player_id, text, created_at
    from messages
    where conversation_id = $1
    order by created_at asc
  `, [conversationId]);

  return (result?.rows || []).map(mapRowToMessage).filter(Boolean);
}

export async function createMessage(db, { conversationId, fromPlayerId, text } = {}) {
  if (!db || !conversationId || !fromPlayerId || !text?.trim()) return null;
  const msgId = createMessageId();
  const trimmed = text.trim().slice(0, 2000);

  const result = await db.query(`
    insert into messages (id, conversation_id, from_player_id, text)
    values ($1, $2, $3, $4)
    returning id, conversation_id, from_player_id, text, created_at
  `, [msgId, conversationId, fromPlayerId, trimmed]);

  const message = mapRowToMessage(result?.rows?.[0] || null);
  if (!message) return null;

  // Bump last_message_at and increment the *recipient's* unread counter.
  // The sender is identified by fromPlayerId; increment the other side's counter.
  await db.query(`
    update conversations
    set
      last_message_at = now(),
      unread_count_a = unread_count_a + case when player_b_id = $2 then 1 else 0 end,
      unread_count_b = unread_count_b + case when player_a_id = $2 then 1 else 0 end
    where id = $1
  `, [conversationId, fromPlayerId]);

  return message;
}

export async function markConversationRead(db, conversationId, playerId) {
  if (!db || !conversationId || !playerId) return;

  await db.query(`
    update conversations
    set
      unread_count_a = case when player_a_id = $2 then 0 else unread_count_a end,
      unread_count_b = case when player_b_id = $2 then 0 else unread_count_b end
    where id = $1
  `, [conversationId, playerId]);
}
