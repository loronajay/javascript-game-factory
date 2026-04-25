import {
  buildClearCookieHeader,
  buildSetCookieHeader,
  extractTokenFromRequest,
  signToken,
  verifyToken,
} from "./auth-helpers.mjs";

function applyCorsHeaders(res, requestOrigin) {
  if (requestOrigin) {
    res.setHeader("access-control-allow-origin", requestOrigin);
    res.setHeader("access-control-allow-credentials", "true");
    res.setHeader("vary", "Origin");
  } else {
    res.setHeader("access-control-allow-origin", "*");
  }
  res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function writeJson(res, statusCode, payload, requestOrigin) {
  res.statusCode = statusCode;
  applyCorsHeaders(res, requestOrigin);
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const chunks = [];

  try {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    return { ok: false, error: "invalid_body" };
  }

  if (chunks.length === 0) {
    return { ok: true, value: {} };
  }

  try {
    return {
      ok: true,
      value: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
  } catch {
    return { ok: false, error: "invalid_json" };
  }
}

function buildTimestamp(now) {
  if (typeof now === "function") {
    const value = now();
    return typeof value === "string" && value.trim() ? value : new Date().toISOString();
  }

  return new Date().toISOString();
}

function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  const atIdx = trimmed.indexOf("@");
  if (atIdx < 1) return false;
  const afterAt = trimmed.slice(atIdx + 1);
  return afterAt.includes(".") && afterAt.length > 2 && !trimmed.includes(" ");
}

export function createApp(options = {}) {
  const config = options?.config && typeof options.config === "object"
    ? options.config
    : { hasDatabaseUrl: false };
  const checkDatabase = typeof options?.checkDatabase === "function"
    ? options.checkDatabase
    : async () => false;
  const searchPlayers = typeof options?.searchPlayers === "function"
    ? options.searchPlayers
    : async () => [];
  const loadPlayerProfile = typeof options?.loadPlayerProfile === "function"
    ? options.loadPlayerProfile
    : async () => null;
  const loadPlayerProfileByFriendCode = typeof options?.loadPlayerProfileByFriendCode === "function"
    ? options.loadPlayerProfileByFriendCode
    : async () => null;
  const savePlayerProfile = typeof options?.savePlayerProfile === "function"
    ? options.savePlayerProfile
    : async () => null;
  const loadPlayerMetrics = typeof options?.loadPlayerMetrics === "function"
    ? options.loadPlayerMetrics
    : async () => null;
  const savePlayerMetrics = typeof options?.savePlayerMetrics === "function"
    ? options.savePlayerMetrics
    : async () => null;
  const loadPlayerRelationships = typeof options?.loadPlayerRelationships === "function"
    ? options.loadPlayerRelationships
    : async () => null;
  const createFriendshipBetweenPlayers = typeof options?.createFriendshipBetweenPlayers === "function"
    ? options.createFriendshipBetweenPlayers
    : async () => null;
  const recordSharedSessionBetweenPlayers = typeof options?.recordSharedSessionBetweenPlayers === "function"
    ? options.recordSharedSessionBetweenPlayers
    : async () => null;
  const recordSharedEventBetweenPlayers = typeof options?.recordSharedEventBetweenPlayers === "function"
    ? options.recordSharedEventBetweenPlayers
    : async () => null;
  const recordDirectInteractionBetweenPlayers = typeof options?.recordDirectInteractionBetweenPlayers === "function"
    ? options.recordDirectInteractionBetweenPlayers
    : async () => null;
  const savePlayerRelationships = typeof options?.savePlayerRelationships === "function"
    ? options.savePlayerRelationships
    : async () => null;
  const listActivityItems = typeof options?.listActivityItems === "function"
    ? options.listActivityItems
    : async () => [];
  const saveActivityItem = typeof options?.saveActivityItem === "function"
    ? options.saveActivityItem
    : async () => null;
  const listThoughts = typeof options?.listThoughts === "function"
    ? options.listThoughts
    : async () => [];
  const listThoughtComments = typeof options?.listThoughtComments === "function"
    ? options.listThoughtComments
    : async () => [];
  const saveThought = typeof options?.saveThought === "function"
    ? options.saveThought
    : async () => null;
  const shareThought = typeof options?.shareThought === "function"
    ? options.shareThought
    : async () => null;
  const commentOnThought = typeof options?.commentOnThought === "function"
    ? options.commentOnThought
    : async () => null;
  const reactToThought = typeof options?.reactToThought === "function"
    ? options.reactToThought
    : async () => null;
  const deleteThought = typeof options?.deleteThought === "function"
    ? options.deleteThought
    : async () => false;
  const createNotification = typeof options?.createNotification === "function"
    ? options.createNotification
    : async () => null;
  const listNotifications = typeof options?.listNotifications === "function"
    ? options.listNotifications
    : async () => ({ notifications: [], unreadCount: 0 });
  const markAllNotificationsRead = typeof options?.markAllNotificationsRead === "function"
    ? options.markAllNotificationsRead
    : async () => {};
  const createFriendRequest = typeof options?.createFriendRequest === "function"
    ? options.createFriendRequest
    : async () => null;
  const getFriendRequest = typeof options?.getFriendRequest === "function"
    ? options.getFriendRequest
    : async () => null;
  const acceptFriendRequest = typeof options?.acceptFriendRequest === "function"
    ? options.acceptFriendRequest
    : async () => null;
  const rejectFriendRequest = typeof options?.rejectFriendRequest === "function"
    ? options.rejectFriendRequest
    : async () => null;
  const registerAccount = typeof options?.registerAccount === "function"
    ? options.registerAccount
    : async () => ({ error: "not_configured" });
  const loginAccount = typeof options?.loginAccount === "function"
    ? options.loginAccount
    : async () => ({ error: "not_configured" });
  const requestPasswordReset = typeof options?.requestPasswordReset === "function"
    ? options.requestPasswordReset
    : async () => ({ ok: true });
  const resetPassword = typeof options?.resetPassword === "function"
    ? options.resetPassword
    : async () => ({ error: "not_configured" });
  const deleteAccount = typeof options?.deleteAccount === "function"
    ? options.deleteAccount
    : async () => ({ error: "not_configured" });
  const jwtSecret = typeof options?.jwtSecret === "string" ? options.jwtSecret : "";
  const isProduction = Boolean(options?.isProduction);
  const now = options?.now;

  return async function app(req, res) {
    const method = typeof req?.method === "string" ? req.method.toUpperCase() : "GET";
    const requestUrl = new URL(req?.url || "/", "http://localhost");
    const pathname = requestUrl.pathname;
    const requestOrigin = req?.headers?.origin || "";
    const timestamp = buildTimestamp(now);

    const rawToken = extractTokenFromRequest(req);
    const authClaims = rawToken && jwtSecret ? verifyToken(rawToken, jwtSecret) : null;

    const playerMatch = pathname.match(/^\/players\/([^/]+)$/);
    const friendCodeMatch = pathname.match(/^\/players\/by-friend-code\/([^/]+)$/);
    const profileMatch = pathname.match(/^\/players\/([^/]+)\/profile$/);
    const metricsMatch = pathname.match(/^\/players\/([^/]+)\/metrics$/);
    const relationshipsMatch = pathname.match(/^\/players\/([^/]+)\/relationships$/);
    const friendRequestActionMatch = pathname.match(/^\/friend-requests\/([^/]+)\/(accept|reject)$/);

    if (method === "OPTIONS") {
      res.statusCode = 204;
      applyCorsHeaders(res, requestOrigin);
      res.end("");
      return;
    }

    if (method === "GET" && pathname === "/health") {
      writeJson(res, 200, {
        status: "ok",
        service: "platform-api",
        databaseConfigured: Boolean(config.hasDatabaseUrl),
        timestamp,
      }, requestOrigin);
      return;
    }

    if (method === "GET" && pathname === "/ready") {
      if (!config.hasDatabaseUrl) {
        writeJson(res, 503, {
          status: "error",
          service: "platform-api",
          database: "missing_configuration",
          timestamp,
        }, requestOrigin);
        return;
      }

      const isDatabaseReady = await checkDatabase();
      writeJson(res, isDatabaseReady ? 200 : 503, {
        status: isDatabaseReady ? "ok" : "error",
        service: "platform-api",
        database: isDatabaseReady ? "up" : "down",
        timestamp,
      }, requestOrigin);
      return;
    }

    // Auth routes
    if (method === "POST" && pathname === "/auth/register") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }

      const { email, password, profileName, claimPlayerId } = body.value || {};

      if (!isValidEmail(email)) {
        writeJson(res, 400, { status: "error", error: "invalid_email", timestamp }, requestOrigin);
        return;
      }

      if (!password || String(password).length < 8) {
        writeJson(res, 400, { status: "error", error: "password_too_short", timestamp }, requestOrigin);
        return;
      }

      if (!jwtSecret) {
        writeJson(res, 503, { status: "error", error: "auth_not_configured", timestamp }, requestOrigin);
        return;
      }

      const result = await registerAccount({ email, password, profileName, claimPlayerId });

      if (!result?.ok) {
        const statusCode = result?.error === "email_taken" ? 409 : 400;
        writeJson(res, statusCode, { status: "error", error: result?.error || "register_failed", timestamp }, requestOrigin);
        return;
      }

      const token = signToken({ playerId: result.playerId, email: result.email }, jwtSecret);
      res.setHeader("set-cookie", buildSetCookieHeader(token, isProduction));
      writeJson(res, 201, { playerId: result.playerId, profileName: result.profileName, email: result.email }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/auth/login") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }

      const { email, password } = body.value || {};

      if (!isValidEmail(email) || !password) {
        writeJson(res, 400, { status: "error", error: "missing_credentials", timestamp }, requestOrigin);
        return;
      }

      if (!jwtSecret) {
        writeJson(res, 503, { status: "error", error: "auth_not_configured", timestamp }, requestOrigin);
        return;
      }

      const result = await loginAccount({ email, password });

      if (!result?.ok) {
        writeJson(res, 401, { status: "error", error: "invalid_credentials", timestamp }, requestOrigin);
        return;
      }

      const token = signToken({ playerId: result.playerId, email: result.email }, jwtSecret);
      res.setHeader("set-cookie", buildSetCookieHeader(token, isProduction));
      writeJson(res, 200, { playerId: result.playerId, email: result.email }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/auth/logout") {
      res.setHeader("set-cookie", buildClearCookieHeader(isProduction));
      writeJson(res, 200, { ok: true }, requestOrigin);
      return;
    }

    if (method === "GET" && pathname === "/auth/me") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      writeJson(res, 200, { playerId: authClaims.playerId, email: authClaims.email }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/auth/forgot-password") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }

      const { email } = body.value || {};
      if (!isValidEmail(email)) {
        // Still return 200 to avoid leaking whether the email exists
        writeJson(res, 200, { ok: true }, requestOrigin);
        return;
      }

      await requestPasswordReset({ email });
      writeJson(res, 200, { ok: true }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/auth/reset-password") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }

      const { token, newPassword } = body.value || {};
      const result = await resetPassword({ token, newPassword });

      if (!result?.ok) {
        const statusCode = result?.error === "token_expired" || result?.error === "token_already_used"
          ? 410
          : 400;
        writeJson(res, statusCode, { status: "error", error: result?.error || "reset_failed", timestamp }, requestOrigin);
        return;
      }

      writeJson(res, 200, { ok: true }, requestOrigin);
      return;
    }

    if (method === "DELETE" && pathname === "/auth/account") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }

      const result = await deleteAccount(authClaims.playerId);

      if (!result?.ok) {
        writeJson(res, 400, { status: "error", error: result?.error || "delete_failed", timestamp }, requestOrigin);
        return;
      }

      res.setHeader("set-cookie", buildClearCookieHeader(isProduction));
      writeJson(res, 200, { ok: true }, requestOrigin);
      return;
    }

    if (method === "GET" && pathname === "/players/search") {
      const q = requestUrl.searchParams.get("q") || "";
      if (!q.trim()) {
        writeJson(res, 200, { players: [] }, requestOrigin);
        return;
      }
      const players = await searchPlayers(q);
      writeJson(res, 200, { players }, requestOrigin);
      return;
    }

    if (method === "GET" && pathname === "/activity") {
      const items = await listActivityItems();
      writeJson(res, 200, { items }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/activity") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const item = await saveActivityItem(body.value);
      writeJson(res, 200, { item }, requestOrigin);
      return;
    }

    if (method === "GET" && pathname === "/thoughts") {
      const thoughts = await listThoughts({
        viewerPlayerId: requestUrl.searchParams.get("viewerPlayerId") || "",
      });
      writeJson(res, 200, { thoughts }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/thoughts") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const thought = await saveThought(body.value);
      writeJson(res, 200, { thought }, requestOrigin);
      return;
    }

    const thoughtDeleteMatch = pathname.match(/^\/thoughts\/([^/]+)$/);
    const thoughtReactionMatch = pathname.match(/^\/thoughts\/([^/]+)\/reactions$/);
    const thoughtShareMatch = pathname.match(/^\/thoughts\/([^/]+)\/shares$/);
    const thoughtCommentMatch = pathname.match(/^\/thoughts\/([^/]+)\/comments$/);
    if (method === "GET" && thoughtCommentMatch) {
      const comments = await listThoughtComments(decodeURIComponent(thoughtCommentMatch[1]));
      writeJson(res, 200, { comments }, requestOrigin);
      return;
    }

    if (method === "POST" && thoughtCommentMatch) {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const actorPlayerId = String(body.value?.viewerPlayerId || "");
      const actorDisplayName = String(body.value?.viewerAuthorDisplayName || "");
      const commentRecord = await commentOnThought(
        decodeURIComponent(thoughtCommentMatch[1]),
        actorPlayerId,
        actorDisplayName,
        body.value?.text,
      );
      writeJson(res, 200, { commentRecord }, requestOrigin);
      if (commentRecord?.thought?.authorPlayerId && actorPlayerId && commentRecord.thought.authorPlayerId !== actorPlayerId) {
        void createNotification({
          recipientPlayerId: commentRecord.thought.authorPlayerId,
          actorPlayerId,
          actorDisplayName,
          type: "thought_comment",
          payload: {
            thoughtId: commentRecord.thought.id,
            commentId: commentRecord.comment?.id || "",
            commentText: String(commentRecord.comment?.text || "").slice(0, 80),
            thoughtText: String(commentRecord.thought.text || "").slice(0, 80),
          },
        });
      }
      return;
    }

    if (method === "POST" && thoughtShareMatch) {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const actorPlayerId = String(body.value?.viewerPlayerId || "");
      const actorDisplayName = String(body.value?.viewerAuthorDisplayName || "");
      const share = await shareThought(
        decodeURIComponent(thoughtShareMatch[1]),
        actorPlayerId,
        actorDisplayName,
        body.value,
      );
      writeJson(res, 200, { share }, requestOrigin);
      if (share?.sharedThought && share?.originalThought?.authorPlayerId && actorPlayerId && share.originalThought.authorPlayerId !== actorPlayerId) {
        void createNotification({
          recipientPlayerId: share.originalThought.authorPlayerId,
          actorPlayerId,
          actorDisplayName,
          type: "thought_share",
          payload: {
            thoughtId: share.originalThought.id,
            thoughtText: String(share.originalThought.text || "").slice(0, 80),
          },
        });
      }
      return;
    }

    if (method === "POST" && thoughtReactionMatch) {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const actorPlayerId = String(body.value?.viewerPlayerId || "");
      const actorDisplayName = String(body.value?.actorDisplayName || "");
      const thought = await reactToThought(
        decodeURIComponent(thoughtReactionMatch[1]),
        actorPlayerId,
        body.value?.reactionId,
      );
      writeJson(res, 200, { thought }, requestOrigin);
      // fire-and-forget notification when reaction is set (not removed) on someone else's thought
      if (thought?.authorPlayerId && actorPlayerId && thought.authorPlayerId !== actorPlayerId && thought.viewerReaction) {
        void createNotification({
          recipientPlayerId: thought.authorPlayerId,
          actorPlayerId,
          actorDisplayName,
          type: "thought_reaction",
          payload: {
            thoughtId: thought.id,
            reactionId: thought.viewerReaction,
            thoughtText: String(thought.text || "").slice(0, 80),
          },
        });
      }
      return;
    }

    if (method === "DELETE" && thoughtDeleteMatch) {
      const thoughtId = decodeURIComponent(thoughtDeleteMatch[1]);
      const deleted = await deleteThought(thoughtId);
      writeJson(res, 200, {
        deleted,
        id: thoughtId,
      }, requestOrigin);
      return;
    }

    if (method === "GET" && (playerMatch || profileMatch)) {
      const profile = await loadPlayerProfile(decodeURIComponent((profileMatch || playerMatch)[1]));
      if (!profile) {
        writeJson(res, 404, {
          status: "error",
          service: "platform-api",
          error: "player_not_found",
          timestamp,
        }, requestOrigin);
        return;
      }

      writeJson(res, 200, {
        player: profile,
      }, requestOrigin);
      return;
    }

    if (method === "GET" && friendCodeMatch) {
      const profile = await loadPlayerProfileByFriendCode(decodeURIComponent(friendCodeMatch[1]));
      if (!profile) {
        writeJson(res, 404, {
          status: "error",
          service: "platform-api",
          error: "player_not_found",
          timestamp,
        }, requestOrigin);
        return;
      }

      writeJson(res, 200, {
        player: profile,
      }, requestOrigin);
      return;
    }

    if (method === "PUT" && profileMatch) {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const profile = await savePlayerProfile(decodeURIComponent(profileMatch[1]), body.value);
      writeJson(res, 200, {
        player: profile,
      }, requestOrigin);
      return;
    }

    if (method === "GET" && metricsMatch) {
      const metrics = await loadPlayerMetrics(decodeURIComponent(metricsMatch[1]));
      writeJson(res, 200, {
        metrics,
      }, requestOrigin);
      return;
    }

    if (method === "PUT" && metricsMatch) {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const metrics = await savePlayerMetrics(decodeURIComponent(metricsMatch[1]), body.value);
      writeJson(res, 200, {
        metrics,
      }, requestOrigin);
      return;
    }

    if (method === "GET" && relationshipsMatch) {
      const relationships = await loadPlayerRelationships(decodeURIComponent(relationshipsMatch[1]));
      writeJson(res, 200, {
        relationships,
      }, requestOrigin);
      return;
    }

    if (method === "PUT" && relationshipsMatch) {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const relationships = await savePlayerRelationships(decodeURIComponent(relationshipsMatch[1]), body.value);
      writeJson(res, 200, {
        relationships,
      }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/friendships") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const friendship = await createFriendshipBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { friendship }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/relationships/shared-session") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const relationshipUpdate = await recordSharedSessionBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { relationshipUpdate }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/relationships/shared-event") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const relationshipUpdate = await recordSharedEventBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { relationshipUpdate }, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/relationships/direct-interaction") {
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, {
          status: "error",
          service: "platform-api",
          error: body.error,
          timestamp,
        }, requestOrigin);
        return;
      }

      const relationshipUpdate = await recordDirectInteractionBetweenPlayers(
        body.value?.leftPlayerId,
        body.value?.rightPlayerId,
        body.value,
      );
      writeJson(res, 200, { relationshipUpdate }, requestOrigin);
      return;
    }

    // Notification routes (auth required)
    if (method === "GET" && pathname === "/notifications") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const result = await listNotifications(authClaims.playerId);
      writeJson(res, 200, result, requestOrigin);
      return;
    }

    if (method === "POST" && pathname === "/notifications/read-all") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      await markAllNotificationsRead(authClaims.playerId);
      writeJson(res, 200, { ok: true }, requestOrigin);
      return;
    }

    // Friend request routes (auth required)
    if (method === "POST" && pathname === "/friend-requests") {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const body = await readJsonBody(req);
      if (!body.ok) {
        writeJson(res, 400, { status: "error", error: body.error, timestamp }, requestOrigin);
        return;
      }
      const { toPlayerId, fromDisplayName } = body.value || {};
      const fromPlayerId = authClaims.playerId;
      if (!toPlayerId || toPlayerId === fromPlayerId) {
        writeJson(res, 400, { status: "error", error: "invalid_target", timestamp }, requestOrigin);
        return;
      }
      // create request first so we have the ID for the notification payload
      const request = await createFriendRequest({
        fromPlayerId,
        toPlayerId,
        fromDisplayName: String(fromDisplayName || ""),
      });
      if (!request) {
        writeJson(res, 409, { status: "error", error: "request_already_pending", timestamp }, requestOrigin);
        return;
      }
      void createNotification({
        recipientPlayerId: toPlayerId,
        actorPlayerId: fromPlayerId,
        actorDisplayName: String(fromDisplayName || ""),
        type: "friend_request",
        payload: { requestId: request.id },
      });
      writeJson(res, 201, { request }, requestOrigin);
      return;
    }

    if (method === "POST" && friendRequestActionMatch) {
      if (!authClaims?.playerId) {
        writeJson(res, 401, { status: "error", error: "not_authenticated", timestamp }, requestOrigin);
        return;
      }
      const requestId = decodeURIComponent(friendRequestActionMatch[1]);
      const action = friendRequestActionMatch[2];
      const friendRequest = await getFriendRequest(requestId);
      if (!friendRequest) {
        writeJson(res, 404, { status: "error", error: "request_not_found", timestamp }, requestOrigin);
        return;
      }
      if (friendRequest.toPlayerId !== authClaims.playerId) {
        writeJson(res, 403, { status: "error", error: "forbidden", timestamp }, requestOrigin);
        return;
      }
      if (action === "accept") {
        const acceptBody = await readJsonBody(req).catch(() => ({ ok: false }));
        const acceptorDisplayName = String(acceptBody?.value?.acceptorDisplayName || "");
        const accepted = await acceptFriendRequest(requestId);
        if (!accepted) {
          writeJson(res, 409, { status: "error", error: "request_not_pending", timestamp }, requestOrigin);
          return;
        }
        // create actual friendship
        void createFriendshipBetweenPlayers(accepted.fromPlayerId, accepted.toPlayerId, {});
        // notify the sender — prefer name from body, then profile lookup, then generic fallback
        const resolvedAcceptorName = acceptorDisplayName
          || (await loadPlayerProfile(accepted.toPlayerId).catch(() => null))?.profileName
          || "A player";
        void createNotification({
          recipientPlayerId: accepted.fromPlayerId,
          actorPlayerId: accepted.toPlayerId,
          actorDisplayName: resolvedAcceptorName,
          type: "friend_accept",
          payload: { requestId },
        });
        writeJson(res, 200, { ok: true, request: accepted }, requestOrigin);
      } else {
        const rejected = await rejectFriendRequest(requestId);
        if (!rejected) {
          writeJson(res, 409, { status: "error", error: "request_not_pending", timestamp }, requestOrigin);
          return;
        }
        writeJson(res, 200, { ok: true, request: rejected }, requestOrigin);
      }
      return;
    }

    writeJson(res, 404, {
      status: "error",
      service: "platform-api",
      error: "not_found",
      timestamp,
    }, requestOrigin);
  };
}
