import { readJsonBody, writeJson } from "../http-utils.mjs";

function isConversationParticipant(conversation, playerId) {
  return conversation?.playerAId === playerId || conversation?.playerBId === playerId;
}

// Direct messages are a distinct backend surface with their own auth and
// notification rules, so they get a dedicated route family rather than
// staying embedded in the top-level app handler.
export async function handleMessageRoute(context) {
  const {
    req,
    res,
    method,
    pathname,
    authClaims,
    requestOrigin,
    timestamp,
    services,
  } = context;
  const {
    listConversations,
    findConversationBetween,
    findOrCreateConversation,
    getConversation,
    listMessages,
    createMessage,
    markConversationRead,
    loadPlayerProfile,
    createNotification,
  } = services;

  const messagesWithMatch = pathname.match(/^\/messages\/with\/([^/]+)$/);
  const conversationMatch = pathname.match(/^\/messages\/([^/]+)$/);
  const conversationReadMatch = pathname.match(/^\/messages\/([^/]+)\/read$/);

  if (method === "GET" && pathname === "/messages") {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    const conversations = await listConversations(authClaims.playerId);
    writeJson(res, 200, { conversations }, requestOrigin);
    return true;
  }

  if (method === "GET" && messagesWithMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    const otherPlayerId = decodeURIComponent(messagesWithMatch[1]);
    const conversation = await findConversationBetween(authClaims.playerId, otherPlayerId);
    writeJson(res, 200, { conversation: conversation || null }, requestOrigin);
    return true;
  }

  if (method === "POST" && pathname === "/messages") {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    const body = await readJsonBody(req);
    if (!body.ok) {
      writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
      return true;
    }
    const { toPlayerId, text } = body.value || {};
    const fromPlayerId = authClaims.playerId;
    if (!toPlayerId || toPlayerId === fromPlayerId) {
      writeJson(res, 400, { status: "error", error: "invalid_target", timestamp }, requestOrigin);
      return true;
    }
    if (!text?.trim()) {
      writeJson(res, 400, { status: "error", error: "empty_message", timestamp }, requestOrigin);
      return true;
    }
    const conversation = await findOrCreateConversation(fromPlayerId, toPlayerId);
    if (!conversation) {
      writeJson(res, 500, { status: "error", error: "conversation_failed", timestamp }, requestOrigin);
      return true;
    }
    const message = await createMessage({ conversationId: conversation.id, fromPlayerId, text });
    if (!message) {
      writeJson(res, 500, { status: "error", error: "send_failed", timestamp }, requestOrigin);
      return true;
    }
    const senderProfile = await loadPlayerProfile(fromPlayerId).catch(() => null);
    const senderName = senderProfile?.profileName || "";
    void createNotification({
      recipientPlayerId: toPlayerId,
      actorPlayerId: fromPlayerId,
      actorDisplayName: senderName,
      type: "new_message",
      payload: { conversationId: conversation.id, preview: String(text).trim().slice(0, 80) },
    });
    writeJson(res, 201, { message, conversationId: conversation.id }, requestOrigin);
    return true;
  }

  if (method === "GET" && conversationMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    const convId = decodeURIComponent(conversationMatch[1]);
    const conversation = await getConversation(convId);
    if (!conversation) {
      writeJson(res, 404, { status: "error", error: "conversation_not_found", timestamp }, requestOrigin);
      return true;
    }
    if (!isConversationParticipant(conversation, authClaims.playerId)) {
      writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
      return true;
    }
    const otherPlayerId = conversation.playerAId === authClaims.playerId ? conversation.playerBId : conversation.playerAId;
    const [messages, otherProfile] = await Promise.all([
      listMessages(convId),
      loadPlayerProfile(otherPlayerId).catch(() => null),
    ]);
    const isPlayerA = conversation.playerAId === authClaims.playerId;
    writeJson(res, 200, {
      conversation: {
        ...conversation,
        otherPlayerId,
        otherProfileName: otherProfile?.profileName || "",
        unreadCount: isPlayerA ? conversation.unreadCountA : conversation.unreadCountB,
      },
      messages,
    }, requestOrigin);
    return true;
  }

  if (method === "POST" && conversationReadMatch) {
    if (!authClaims?.playerId) {
      writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
      return true;
    }
    const convId = decodeURIComponent(conversationReadMatch[1]);
    const conversation = await getConversation(convId);
    if (!conversation) {
      writeJson(res, 404, { status: "error", error: "conversation_not_found", timestamp }, requestOrigin);
      return true;
    }
    if (!isConversationParticipant(conversation, authClaims.playerId)) {
      writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
      return true;
    }
    await markConversationRead(convId, authClaims.playerId);
    writeJson(res, 200, { ok: true }, requestOrigin);
    return true;
  }

  return false;
}
